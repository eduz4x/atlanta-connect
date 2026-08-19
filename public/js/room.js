(function () {
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  const params = new URLSearchParams(window.location.search);
  const room = (params.get("room") || "").toUpperCase();
  const name = sessionStorage.getItem("cc:name");

  if (!room || !name) {
    window.location.href = `/index.html${room ? `?room=${room}` : ""}`;
    return;
  }

  document.getElementById("room-code-label").textContent = room;

  const stageEl = document.getElementById("stage");
  const filmstripEl = document.getElementById("filmstrip");
  const roomShellEl = document.getElementById("room-shell");
  const participantCountEl = document.getElementById("participant-count");
  const toastEl = document.getElementById("toast");

  const micBtn = document.getElementById("mic-btn");
  const camBtn = document.getElementById("cam-btn");
  const shareBtn = document.getElementById("share-btn");
  const cinemaBtn = document.getElementById("cinema-btn");
  const leaveBtn = document.getElementById("leave-btn");
  const copyLink = document.getElementById("copy-link");
  const volumeBtn = document.getElementById("volume-btn");
  const volumePanel = document.getElementById("volume-panel");
  const micVolumeInput = document.getElementById("mic-volume");
  const micVolumeValue = document.getElementById("mic-volume-value");
  const playbackVolumeInput = document.getElementById("playback-volume");
  const playbackVolumeValue = document.getElementById("playback-volume-value");

  const socket = io();

  // ---- state ----
  const peers = {}; // peerId -> { pc, name }
  const tileElements = {}; // tileId -> DOM element
  let orderedTileIds = [];
  let cinemaMode = false;

  let micStream = null;
  let micTrack = null;
  let micOn = false;

  let camStream = null;
  let camTrack = null;
  let camOn = false;

  let screenStream = null;
  let screenTrack = null;
  let screenOn = false;

  // volume control state
  let audioCtx = null;
  let micGainNode = null;
  let micGainValue = 1; // 0..2 — how loud your mic is sent, boostable past 100%
  let playbackVolume = 1; // 0..1 — how loud incoming audio (camera + screen) plays

  // ---------- tile helpers ----------

  function initials(n) {
    return (n || "?").trim().charAt(0).toUpperCase();
  }

  function createTile(id, { label, kind }) {
    const tile = document.createElement("div");
    tile.className = "tile no-video";
    tile.dataset.kind = kind;
    if (kind === "screen") tile.classList.add("screen-tile");

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    if (id === "local") video.muted = true;
    tile.appendChild(video);

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = initials(label);
    tile.appendChild(avatar);

    const tag = document.createElement("div");
    tag.className = "name-tag";
    tag.innerHTML = `<span class="mic-off" style="display:none">🔇</span><span>${label}</span>`;
    tile.appendChild(tag);

    if (kind === "screen") {
      const liveBadge = document.createElement("div");
      liveBadge.className = "live-badge";
      liveBadge.innerHTML = '<span class="live-dot"></span>Ao vivo';
      tile.appendChild(liveBadge);

      const viewerBadge = document.createElement("div");
      viewerBadge.className = "viewer-badge";
      viewerBadge.textContent = `${Object.keys(peers).length + 1} assistindo`;
      tile.appendChild(viewerBadge);

      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "expand-btn";
      expandBtn.title = "Tela cheia";
      expandBtn.textContent = "⛶";
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        requestTileFullscreen(tile);
      });
      tile.appendChild(expandBtn);
      tile.addEventListener("dblclick", () => requestTileFullscreen(tile));

      const bubble = document.createElement("div");
      bubble.className = "cam-bubble";
      bubble.hidden = true;
      const bubbleVideo = document.createElement("video");
      bubbleVideo.autoplay = true;
      bubbleVideo.playsInline = true;
      bubbleVideo.muted = true;
      bubble.appendChild(bubbleVideo);
      tile.appendChild(bubble);
    }

    tileElements[id] = tile;
    orderedTileIds.push(id);
    renderLayout();
    return tile;
  }

  function setTileStream(id, stream) {
    const tile = tileElements[id];
    if (!tile) return;
    const video = tile.querySelector("video");
    video.srcObject = stream;
    tile.classList.toggle("no-video", !stream);
    if (stream && !id.startsWith("local")) {
      video.volume = playbackVolume; // apply the "transmissão" volume to remote audio
    }
  }

  function setTileMicOff(id, off) {
    const tile = tileElements[id];
    if (!tile) return;
    const el = tile.querySelector(".mic-off");
    if (el) el.style.display = off ? "inline" : "none";
  }

  function removeTile(id) {
    const tile = tileElements[id];
    if (!tile) return;
    tile.remove();
    delete tileElements[id];
    orderedTileIds = orderedTileIds.filter((t) => t !== id);
    renderLayout();
  }

  function renderLayout() {
    if (!cinemaMode) {
      stageEl.replaceChildren(...orderedTileIds.map((id) => tileElements[id]));
      filmstripEl.replaceChildren();
      orderedTileIds.forEach((id) => tileElements[id].classList.remove("focus-tile"));
      return;
    }
    const focusId =
      orderedTileIds.find((id) => tileElements[id].dataset.kind === "screen") ||
      orderedTileIds[0];
    stageEl.replaceChildren(tileElements[focusId]);
    tileElements[focusId].classList.add("focus-tile");
    const rest = orderedTileIds.filter((id) => id !== focusId);
    filmstripEl.replaceChildren(...rest.map((id) => {
      tileElements[id].classList.remove("focus-tile");
      return tileElements[id];
    }));
  }

  function updateParticipantCount() {
    const n = Object.keys(peers).length + 1;
    participantCountEl.textContent = `${n} na sala`;
    document.querySelectorAll(".viewer-badge").forEach((el) => {
      el.textContent = `${n} assistindo`;
    });
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  // ---------- local media ----------

  createTile("local", { label: `${name} (você)`, kind: "camera" });

  async function initMic() {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(rawStream);
      micGainNode = audioCtx.createGain();
      micGainNode.gain.value = micGainValue;
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(micGainNode).connect(dest);
      audioCtx.resume().catch(() => {});

      micStream = dest.stream; // processed (gain-controlled) stream sent to peers
      micTrack = micStream.getAudioTracks()[0];
      micOn = true;
      micBtn.classList.remove("off");
      Object.values(peers).forEach((p) => p.pc.addTrack(micTrack, micStream));
      broadcastState({ micOn });
    } catch (err) {
      micOn = false;
      micBtn.classList.add("off");
      showToast("Não foi possível acessar o microfone.");
    }
  }

  function toggleMic() {
    if (!micTrack) return initMic();
    micOn = !micOn;
    micTrack.enabled = micOn;
    micBtn.classList.toggle("off", !micOn);
    broadcastState({ micOn });
  }

  async function toggleCam() {
    if (!camOn) {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        camTrack = camStream.getVideoTracks()[0];
        camOn = true;
        camBtn.classList.remove("off");
        setTileStream("local", camStream);
        syncCamBubble("local");
        Object.values(peers).forEach((p) => p.pc.addTrack(camTrack, camStream));
        camTrack.onended = () => {
          if (camOn) toggleCam();
        };
        broadcastState({ camOn });
      } catch (err) {
        showToast("Não foi possível acessar a câmera.");
      }
    } else {
      camOn = false;
      camBtn.classList.add("off");
      setTileStream("local", null);
      syncCamBubble("local");
      Object.values(peers).forEach((p) => {
        const sender = p.pc.getSenders().find((s) => s.track === camTrack);
        if (sender) p.pc.removeTrack(sender);
      });
      camTrack.stop();
      camTrack = null;
      camStream = null;
      broadcastState({ camOn });
    }
  }

  async function toggleShare() {
    if (!screenOn) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        screenTrack = screenStream.getVideoTracks()[0];
        screenOn = true;
        shareBtn.classList.add("active");
        createTile("local:screen", { label: `Tela de ${name}`, kind: "screen" });
        setTileStream("local:screen", screenStream);
        syncCamBubble("local");
        Object.values(peers).forEach((p) => p.pc.addTrack(screenTrack, screenStream));
        broadcastState({ screenOn: true });
        screenTrack.onended = () => {
          if (screenOn) toggleShare();
        };
      } catch (err) {
        // user cancelled the picker — no error toast needed
      }
    } else {
      screenOn = false;
      shareBtn.classList.remove("active");
      removeTile("local:screen");
      Object.values(peers).forEach((p) => {
        const sender = p.pc.getSenders().find((s) => s.track === screenTrack);
        if (sender) p.pc.removeTrack(sender);
      });
      screenTrack.stop();
      screenTrack = null;
      screenStream = null;
      broadcastState({ screenOn: false });
    }
  }

  function toggleCinema() {
    cinemaMode = !cinemaMode;
    roomShellEl.classList.toggle("cinema", cinemaMode);
    cinemaBtn.classList.toggle("active", cinemaMode);
    renderLayout();
  }

  function applyPlaybackVolume() {
    orderedTileIds.forEach((id) => {
      if (id.startsWith("local")) return;
      const video = tileElements[id] && tileElements[id].querySelector("video");
      if (video) video.volume = playbackVolume;
    });
  }

  function requestTileFullscreen(tile) {
    const req = tile.requestFullscreen || tile.webkitRequestFullscreen || tile.msRequestFullscreen;
    if (req) req.call(tile).catch(() => {});
  }

  // Discord-style "Go Live": finds the screen-share tile belonging to a
  // given owner ("local" or a peer id) so we can overlay their camera bubble on it.
  function findScreenTileId(ownerId) {
    if (ownerId === "local") {
      return tileElements["local:screen"] ? "local:screen" : null;
    }
    return (
      orderedTileIds.find(
        (id) => id.startsWith(`${ownerId}:`) && tileElements[id].dataset.kind === "screen"
      ) || null
    );
  }

  function syncCamBubble(ownerId) {
    const screenTileId = findScreenTileId(ownerId);
    if (!screenTileId) return;
    const screenTile = tileElements[screenTileId];
    const bubble = screenTile.querySelector(".cam-bubble");
    const bubbleVideo = bubble.querySelector("video");
    const camTile = tileElements[ownerId];
    const camVideo = camTile && camTile.querySelector("video");
    const hasCam = camVideo && camVideo.srcObject && !camTile.classList.contains("no-video");
    bubble.hidden = !hasCam;
    bubbleVideo.srcObject = hasCam ? camVideo.srcObject : null;
  }

  function toggleVolumePanel(forceOpen) {
    const shouldOpen = forceOpen ?? volumePanel.hidden;
    volumePanel.hidden = !shouldOpen;
    volumeBtn.classList.toggle("active", shouldOpen);
    if (shouldOpen && audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function broadcastState(payload) {
    socket.emit("state-change", payload);
  }

  micBtn.addEventListener("click", toggleMic);
  camBtn.addEventListener("click", toggleCam);
  shareBtn.addEventListener("click", toggleShare);
  cinemaBtn.addEventListener("click", toggleCinema);
  volumeBtn.addEventListener("click", () => toggleVolumePanel());
  leaveBtn.addEventListener("click", () => {
    socket.emit("leave-room");
    window.location.href = "/index.html";
  });
  copyLink.addEventListener("click", () => {
    const url = `${window.location.origin}/?room=${room}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link da sala copiado!"));
  });

  micVolumeInput.addEventListener("input", () => {
    const pct = Number(micVolumeInput.value);
    micGainValue = pct / 100;
    micVolumeValue.textContent = `${pct}%`;
    if (micGainNode) micGainNode.gain.value = micGainValue;
  });

  playbackVolumeInput.addEventListener("input", () => {
    const pct = Number(playbackVolumeInput.value);
    playbackVolume = pct / 100;
    playbackVolumeValue.textContent = `${pct}%`;
    applyPlaybackVolume();
  });

  document.addEventListener("click", (e) => {
    if (
      !volumePanel.hidden &&
      !volumePanel.contains(e.target) &&
      e.target !== volumeBtn
    ) {
      toggleVolumePanel(false);
    }
  });

  // ---------- WebRTC peer handling ----------

  function localTracksAndStreams() {
    const list = [];
    if (micTrack) list.push([micTrack, micStream]);
    if (camTrack) list.push([camTrack, camStream]);
    if (screenTrack) list.push([screenTrack, screenStream]);
    return list;
  }

  function createPeerConnection(peerId, peerName, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[peerId] = { pc, name: peerName };
    updateParticipantCount();

    localTracksAndStreams().forEach(([track, stream]) => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("signal", { to: peerId, data: { candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      const isFirstVideo = !tileElements[peerId];
      const tileId = isFirstVideo ? peerId : `${peerId}:${stream.id}`;

      if (!tileElements[tileId]) {
        const isScreen = tileId !== peerId; // second+ stream from this peer = screen share
        createTile(tileId, {
          label: isScreen ? `Tela de ${peerName}` : peerName,
          kind: isScreen ? "screen" : "camera",
        });
      }
      setTileStream(tileId, stream);
      syncCamBubble(peerId);

      stream.onremovetrack = () => {
        if (stream.getTracks().length === 0 && tileId !== peerId) {
          removeTile(tileId);
        }
      };
    };

    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== "stable") return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", { to: peerId, data: { sdp: pc.localDescription } });
      } catch (err) {
        /* ignore transient negotiation races */
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        // cleanup handled by user-left event; this guards against silent stalls
      }
    };

    if (initiator) {
      pc.onnegotiationneeded();
    }

    return pc;
  }

  socket.on("connect", () => {
    socket.emit("join-room", { room, name });
  });

  socket.on("room-users", (users) => {
    users.forEach((u) => createPeerConnection(u.id, u.name, true));
  });

  socket.on("user-joined", ({ id, name: peerName }) => {
    createPeerConnection(id, peerName, false);
    showToast(`${peerName} entrou na sala`);
  });

  socket.on("signal", async ({ from, data }) => {
    let peer = peers[from];
    if (!peer) {
      // shouldn't normally happen (user-joined fires first), but guard anyway
      const pc = createPeerConnection(from, "Convidado", false);
      peer = peers[from];
    }
    const pc = peer.pc;

    if (data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        /* ICE candidate arrived before remote description was set — safe to ignore */
      }
    }
  });

  socket.on("state-change", ({ id, micOn: remoteMicOn }) => {
    if (typeof remoteMicOn === "boolean") setTileMicOff(id, !remoteMicOn);
  });

  socket.on("user-left", ({ id }) => {
    const peer = peers[id];
    if (peer) {
      peer.pc.close();
      delete peers[id];
    }
    removeTile(id);
    Object.keys(tileElements)
      .filter((tid) => tid.startsWith(`${id}:`))
      .forEach(removeTile);
    updateParticipantCount();
  });

  window.addEventListener("beforeunload", () => {
    socket.emit("leave-room");
  });

  // start with mic enabled by default so voice calling works out of the box
  initMic();
})();
