const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 4000; // Usa el puerto proporcionado por Railway o el puerto 4000 por defecto

// Usar CORS para permitir conexiones desde el frontend
app.use(cors());

// Crear el servidor HTTP
const httpServer = http.createServer(app);

// Configurar Socket.IO con el servidor HTTP
const io = new Server(httpServer, {
  transports: ["websocket", "polling"], // Incluye ambos transportes
  cors: {
    origin: "*", // Puedes reemplazar esto con la URL de tu aplicación en producción para mayor seguridad
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Evento para unirse a una sala
  socket.on("joinChat", (roomId, callback) => {
    handleJoinRoom(socket, roomId, callback);
  });

  // Evento para enviar mensajes
  socket.on("sendMessage", (message) => {
    handleSendMessage(io, message);
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.id} disconnected`);
  });
});

// Función para gestionar la unión a una sala
function handleJoinRoom(socket, roomId, callback) {
  const roomIdStr = roomId.toString();
  socket.join(roomIdStr);
  console.log(`User ${socket.id} joined room: ${roomIdStr}`);
  socket.emit("joinedRoom", `Te has unido a la sala ${roomIdStr}`);

  if (callback) {
    callback();
  }
}

// Función para gestionar el envío de mensajes
function handleSendMessage(io, message) {
  const { roomId, text, senderId } = message;
  const roomIdStr = roomId.toString();

  if (!roomIdStr || !text || !senderId) {
    console.error("Invalid message or room ID");
    return io.emit("error", "Invalid message or room ID");
  }

  console.log(`Message sent to room ${roomIdStr}: ${text} from ${senderId}`);
  io.to(roomIdStr).emit("newMessage", message); // Emitimos el mensaje con el senderId
}

// Iniciar el servidor
httpServer.listen(port, () => {
  console.log(`Chat server running on port ${port}`);
});
