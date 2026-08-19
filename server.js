const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// room -> { socketId: { name } }
const rooms = {};

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("join-room", ({ room, name }) => {
    if (!room || !name) return;
    currentRoom = room;
    socket.join(room);

    if (!rooms[room]) rooms[room] = {};

    // tell the newcomer who is already here
    const existingUsers = Object.entries(rooms[room]).map(([id, u]) => ({
      id,
      name: u.name,
    }));
    socket.emit("room-users", existingUsers);

    rooms[room][socket.id] = { name };

    // tell everyone else a new person joined
    socket.to(room).emit("user-joined", { id: socket.id, name });
  });

  // relay WebRTC signaling data (offers, answers, ICE candidates) peer to peer
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // relay lightweight state changes (mic muted, camera off, screen sharing...)
  socket.on("state-change", (payload) => {
    if (currentRoom) {
      socket.to(currentRoom).emit("state-change", { id: socket.id, ...payload });
    }
  });

  socket.on("leave-room", () => leaveRoom());
  socket.on("disconnect", () => leaveRoom());

  function leaveRoom() {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom][socket.id];
      socket.to(currentRoom).emit("user-left", { id: socket.id });
      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
      }
    }
    currentRoom = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Atlanta Connect rodando em http://localhost:${PORT}`);
});
