const createNotification = async (senderId, chatId, receiverId) => {
    try {
        const notif = await fetch("http://localhost:3000/api/notification", {
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
            }),
        });
    } catch (error) {
        console.log(error);
    }
};

module.exports = { createNotification };
