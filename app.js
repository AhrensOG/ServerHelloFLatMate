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
    console.log(userId);

    console.log(`📡 Nueva conexión: ${type} - Socket ID: ${socket.id}`);

    if (!userId) {
        console.error("🚨 Error: userId no recibido en la conexión.");
        return;
    }

    // 🔹 Guardar cada `socket.id` del usuario en un Set
    if (!activeUsers[userId]) activeUsers[userId] = new Set();
    activeUsers[userId].add(socket.id);

    // 🔔 Manejo de notificaciones
    if (type === "notification") {
        console.log(`🔔 Usuario ${userId} conectado a notificaciones con sockets: ${[...activeUsers[userId]]}`);
    }

    // 💬 Manejo de chats
    if (type === "chat" && roomId) {
        socket.join(roomId);
        console.log(`💬 Usuario ${userId} se unió al chat ${roomId}`);
    }

    socket.on("joinChat", (roomId, userId, callback) => {
        handleJoinRoom(socket, roomId, userId, callback);
    });

    socket.on("sendMessage", (message) => {
        handleSendMessage(io, message);
    });

    socket.on("sendFile", (message) => {
        handleSendFile(io, message);
    });

    // 🛑 Manejar la desconexión
    socket.on("disconnect", () => {
        console.log(`❌ Socket ${socket.id} desconectado.`);
        if (activeUsers[userId]) {
            activeUsers[userId].delete(socket.id);
            if (activeUsers[userId].size === 0) delete activeUsers[userId]; // Eliminar usuario si no tiene sockets activos
        }
    });
});

// 🔄 Función para verificar si un usuario tiene **algún** socket en la sala
function isUserInRoom(io, userId, roomIdStr) {
    if (!activeUsers[userId]) return false;

    for (const socketId of activeUsers[userId]) {
        if (io.sockets.adapter.sids.get(socketId)?.has(roomIdStr)) {
            return true; // ✅ Si al menos un socket del usuario está en la sala, retornamos `true`
        }
    }
    return false;
}

function handleJoinRoom(socket, roomId, userId, callback) {
    const roomIdStr = roomId.toString();
    socket.join(roomIdStr);
    console.log(`User ${userId} joined room: ${roomIdStr}`);
    if (callback) callback();
}

async function handleSendMessage(io, message) {
    const { roomId, text, senderId, receiverId } = message;
    const roomIdStr = roomId.toString();

    if (!roomIdStr || !text || !senderId || !receiverId) {
        console.error("❌ Mensaje inválido o datos incompletos.");
        return;
    }

    console.log(`📩 Mensaje enviado en sala ${roomIdStr}: ${text} de ${senderId}`);

    // 🔹 Emitir el mensaje a la sala
    io.to(roomIdStr).emit("newMessage", message);

    // ✅ Verificar si el receptor tiene algún socket en la sala
    const isReceiverInRoom = isUserInRoom(io, receiverId, roomIdStr);
    console.log(`🎯 Usuario ${receiverId} en la sala: ${isReceiverInRoom ? "Sí" : "No"}`);

    // 🔔 Enviar notificación SOLO si el receptor no está en el chat
    if (!isReceiverInRoom) {
        console.log(`📡 Enviando notificación a ${receiverId} - Sockets: ${[...(activeUsers[receiverId] || [])]}`);
        await createNotification(senderId, roomIdStr, receiverId);

        activeUsers[receiverId]?.forEach((socketId) => {
            io.to(socketId).emit("newNotification", {
                message: "You have a new message",
                chatId: roomIdStr,
                senderId,
            });
        });
    }
}

async function handleSendFile(io, message) {
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
    // ✅ Verificar si el receptor tiene algún socket en la sala
    const isReceiverInRoom = isUserInRoom(io, receiverId, roomIdStr);
    console.log(`🎯 Usuario ${receiverId} en la sala: ${isReceiverInRoom ? "Sí" : "No"}`);

    // 🔔 Enviar notificación SOLO si el receptor no está en el chat
    if (!isReceiverInRoom) {
        console.log(`📡 Enviando notificación a ${receiverId} - Sockets: ${[...(activeUsers[receiverId] || [])]}`);
        await createNotification(senderId, roomIdStr, receiverId);

        activeUsers[receiverId]?.forEach((socketId) => {
            io.to(socketId).emit("newNotification", {
                message: "You have a new message",
                chatId: roomIdStr,
                senderId,
            });
        });
    }
}

httpServer.listen(port, () => {
    console.log(`🚀 Servidor de chat ejecutándose en el puerto ${port}`);
});
