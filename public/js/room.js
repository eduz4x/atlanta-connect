(function () {
  const nameInput = document.getElementById("name");
  const roomInput = document.getElementById("room");
  const generateBtn = document.getElementById("generate-btn");
  const enterBtn = document.getElementById("enter-btn");
  const hint = document.getElementById("hint");

  function randomRoomCode(length = 6) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
    let code = "";
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Pre-fill room code from URL (?room=XXXX) if present, like a shared invite link
  const params = new URLSearchParams(window.location.search);
  const prefilledRoom = params.get("room");
  if (prefilledRoom) {
    roomInput.value = prefilledRoom.toUpperCase();
  }

  const savedName = sessionStorage.getItem("cc:name");
  if (savedName) nameInput.value = savedName;

  generateBtn.addEventListener("click", () => {
    roomInput.value = randomRoomCode();
    hint.textContent = "";
    hint.classList.remove("error");
  });

  roomInput.addEventListener("input", () => {
    roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  function showError(message) {
    hint.textContent = message;
    hint.classList.add("error");
  }

  function enterRoom() {
    const name = nameInput.value.trim();
    let room = roomInput.value.trim().toUpperCase();

    if (!name) {
      showError("Digite seu nome para continuar.");
      nameInput.focus();
      return;
    }

    if (!room) {
      room = randomRoomCode();
      roomInput.value = room;
    }

    sessionStorage.setItem("cc:name", name);
    window.location.href = `/room.html?room=${encodeURIComponent(room)}`;
  }

  enterBtn.addEventListener("click", enterRoom);

  [nameInput, roomInput].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") enterRoom();
    });
  });
})();
