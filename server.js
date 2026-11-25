const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
  socket.on("join", (room) => socket.join(room));
  socket.on("move", ({ room, move }) => socket.to(room).emit("move", move));
});

server.listen(3000, () => console.log("GOMOKU running on port 3000"));
