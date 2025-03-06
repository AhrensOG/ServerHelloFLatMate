const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createNotification } = require("./utils");

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    transports: ["websocket", "polling"],
    cors: {
        origin: "*",
    },
});

const activeUsers = {};

io.on("connection", (socket) => {
    const { type, roomId, userId } = socket.handshake.query;

    console.log(`📡 Nueva conexión: ${type} - Socket ID: ${socket.id}`);

    if (type === "notification") {
        activeUsers[userId] = socket.id;
        console.log(`🔔 Usuario ${userId} conectado a notificaciones.`);
    } else if (type === "chat" && roomId) {
        socket.join(roomId);
        console.log(`💬 Usuario ${userId} se unió al chat ${roomId}`);
    }

    socket.on("userConnected", (userId, callback) => {
        activeUsers[userId] = socket.id;
        callback();
    });

    socket.on("joinChat", (roomId, userId, callback) => {
        handleJoinRoom(socket, roomId, userId, callback);
    });

    socket.on("sendMessage", (message) => {
        handleSendMessage(io, message);
    });

    socket.on("sendFile", (message) => {
        handleSendFile(io, message);
    });

    socket.on("disconnect", () => {
        console.log(`❌ Socket ${socket.id} desconectado.`);
        if (type === "notification") {
            delete activeUsers[userId];
        }
    });
});

function handleJoinRoom(socket, roomId, userId, callback) {
    const roomIdStr = roomId.toString();
    socket.join(roomIdStr);
    console.log(`User ${userId} joined room: ${roomIdStr}`);
    if (callback) callback();
}

async function handleSendMessage(io, message) {
    const { roomId, text, senderId, receiverId } = message;
    const roomIdStr = roomId.toString();

    if (!roomIdStr || !text || !senderId) {
        console.error("Invalid message or room ID");
        return;
    }

    console.log(`📩 Mensaje enviado en sala ${roomIdStr}: ${text} de ${senderId}`);
    io.to(roomIdStr).emit("newMessage", message);

    const socketsInRoom = io.sockets.adapter.rooms.get(roomIdStr);
    const isReceiverInRoom = socketsInRoom && [...socketsInRoom].some((socketId) => activeUsers[receiverId] === socketId);

    if (!isReceiverInRoom) {
        const receiverSocketId = activeUsers[receiverId];
        console.log(activeUsers);

        console.log(`📡 Enviando notificación de nuevo mensaje a ${receiverSocketId}`);
        await createNotification(senderId, roomIdStr, receiverId);

        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newNotification", {
                message: "You have a new message",
                chatId: roomIdStr,
                senderId,
            });
        }
    }
}

function handleSendFile(io, message) {
    const { roomId, senderId, image, receiverId } = message;
    const roomIdStr = roomId.toString();

    if (!roomIdStr || !senderId || !image) {
        console.error("Invalid file or room ID");
        return;
    }

    console.log(`📤 Archivo enviado a sala ${roomIdStr} desde ${senderId}`);
    io.to(roomIdStr).emit("newFile", message);

    const socketsInRoom = io.sockets.adapter.rooms.get(roomIdStr);
    const isReceiverInChat = socketsInRoom && [...socketsInRoom].some((socketId) => activeUsers[receiverId] === socketId);

    if (!isReceiverInChat) {
        const receiverSocketId = activeUsers[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newNotification", {
                message: "Has recibido un archivo",
                chatId: roomId,
                senderId,
            });
        }
    }
}

httpServer.listen(port, () => {
    console.log(`🚀 Servidor de chat ejecutándose en el puerto ${port}`);
});
