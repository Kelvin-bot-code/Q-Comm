const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');

const srv = http.createServer(app);
const io = new Server(srv, {
    cors: { origin: "*" }
});

io.on('connection', (sk) => {
    console.log('user connected:', sk.id);

    sk.on('send_msg', (data) => {
        // Broadcoast plaintext message to all
        sk.broadcast.emit('rcv_msg', data);
    });

    sk.on('disconnect', () => {
        console.log('user left:', sk.id);
    });
});

const PORT = 3001;
srv.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});