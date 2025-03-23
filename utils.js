const API_URL = process.env.API_URL || "http://localhost:3000";
const createNotification = async (senderId, chatId, receiverId, typeChat) => {
    if (receiverId) {
        try {
            const notif = await fetch(`${API_URL}/api/notification`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: "Has recibido un nuevo mensaje",
                    chatId: chatId,
                    senderId,
                    type: "CHAT",
                    userId: receiverId,
                    typeChat,
                }),
            });
        } catch (error) {
            console.log(error);
        }
    }
};

const getParticipantsId = async (chatId) => {
    try {
        const response = await fetch(`${API_URL}/api/chat?id=${chatId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });
        const data = await response.json();
        return data.participants;
    } catch (error) {
        console.log(error);
    }
};

module.exports = { createNotification, getParticipantsId };
