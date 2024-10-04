const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { cors } = require("cors")

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "https://helloflatmate.vercel.app/*",
        methods: ["GET", "POST"]
    }
});

app.use(cors())

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
})