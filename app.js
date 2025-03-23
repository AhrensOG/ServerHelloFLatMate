const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createNotification, getParticipantsId } = require("./utils");

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
    const { roomId, text, senderId, receiverId, typeChat } = message;
    const roomIdStr = roomId.toString();

    if (!roomIdStr || !text || !senderId) {
        console.log(message);

        console.error("❌ Mensaje inválido o datos incompletos.");
        return;
    }

    console.log(`📩 Mensaje enviado en sala ${roomIdStr}: ${text} de ${senderId}`);

    // 🔹 Emitir el mensaje a la sala
    io.to(roomIdStr).emit("newMessage", message);

    const isGroupChat = typeChat === "group";
    const isSuppChat = typeChat === "supp";
    console.log(typeChat);

    switch (typeChat) {
        case "group":
            {
                const participants = await getParticipantsId(roomIdStr);
                console.log(`👥 Participantes en el chat: ${participants}`);

                // 🔔 Notificar a todos los miembros del grupo EXCEPTO el remitente
                participants.forEach(async (participant) => {
                    if (participant.id !== senderId) {
                        const isUserActive = isUserInRoom(io, participant.id, roomIdStr);
                        if (!isUserActive) {
                            console.log(`📡 Enviando notificación a ${participant.participantId}`);
                            await createNotification(senderId, roomIdStr, participant.participantId, typeChat);

                            activeUsers[participant.id]?.forEach((socketId) => {
                                io.to(socketId).emit("newNotification", {
                                    message: "You have a new group message",
                                    chatId: roomIdStr,
                                    senderId,
                                });
                            });
                        }
                    }
                });
            }
            break;
        case "supp":
            {
                // ✅ Si es un chat de support, verificar si el receptor está en la sala
                const isReceiverInRoom = isUserInRoom(io, receiverId, roomIdStr);
                if (!isReceiverInRoom) {
                    console.log(`📡 Enviando notificación privada a ${receiverId}`);
                    await createNotification(senderId, roomIdStr, receiverId, typeChat);
                    activeUsers[receiverId]?.forEach((socketId) => {
                        io.to(socketId).emit("newNotification", {
                            message: "You have a new message",
                            chatId: roomIdStr,
                            senderId,
                        });
                    });
                }
            }
            break;
        case "priv":
            {
                // ✅ Si es un chat privado, verificar si el receptor está en la sala
                const isReceiverInRoom = isUserInRoom(io, receiverId, roomIdStr);
                if (!isReceiverInRoom) {
                    console.log(`📡 Enviando notificación privada a ${receiverId}`);
                    await createNotification(senderId, roomIdStr, receiverId, typeChat);
                    activeUsers[receiverId]?.forEach((socketId) => {
                        io.to(socketId).emit("newNotification", {
                            message: "You have a new message",
                            chatId: roomIdStr,
                            senderId,
                        });
                    });
                }
                break;
            }
            break;
        default:
            break;
    }
}

async function handleSendFile(io, message) {
    const { roomId, senderId, image, receiverId, typeChat } = message; // Añadir typeChat
    const roomIdStr = roomId.toString();

    if (!roomIdStr || !senderId || !image) {
        console.error("❌ Archivo inválido o datos incompletos");
        return;
    }

    console.log(`📤 Archivo enviado a sala ${roomIdStr} desde ${senderId}`);
    io.to(roomIdStr).emit("newFile", message);

    const isGroupChat = typeChat === "group";
    const isSuppChat = typeChat === "supp";

    if (isGroupChat) {
        const participants = await getParticipantsId(roomIdStr);
        console.log("👥 Participantes en el chat grupal:", participants);

        // Notificar a todos los miembros del grupo excepto el remitente
        participants.forEach(async (participant) => {
            if (participant.id !== senderId) {
                const isUserActive = isUserInRoom(io, participant.id, roomIdStr);

                if (!isUserActive) {
                    console.log(`📡 Enviando notificación grupal a ${participant.participantId}`);
                    await createNotification(senderId, roomIdStr, participant.participantId);

                    activeUsers[participant.id]?.forEach((socketId) => {
                        io.to(socketId).emit("newNotification", {
                            message: "Has recibido un archivo en el grupo",
                            chatId: roomIdStr,
                            senderId,
                        });
                    });
                }
            }
        });
    } else {
        // Chat privado
        const isReceiverInRoom = isUserInRoom(io, receiverId, roomIdStr);
        console.log(`🎯 Usuario ${receiverId} en la sala: ${isReceiverInRoom ? "Sí" : "No"}`);

        if (!isReceiverInRoom) {
            console.log(`📡 Enviando notificación privada a ${receiverId}`);
            await createNotification(senderId, roomIdStr, receiverId);

            activeUsers[receiverId]?.forEach((socketId) => {
                io.to(socketId).emit("newNotification", {
                    message: "Has recibido un archivo",
                    chatId: roomIdStr,
                    senderId,
                });
            });
        }
    }
}

httpServer.listen(port, () => {
    console.log(`🚀 Servidor de chat ejecutándose en el puerto ${port}`);
});
