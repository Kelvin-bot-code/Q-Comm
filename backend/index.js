const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8 // Allows up to 100MB payloads
});

// Store active frequencies: { roomName: { creator: socketId, stegoImg: base64String } }
const activeRooms = {};

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // --- CREATE ROOM ---
  socket.on('create_room', (data, callback) => {
    const roomUpper = data.room.toUpperCase();
    if (activeRooms[roomUpper]) {
      return callback({ success: false, message: "FREQUENCY ALREADY IN USE. CHOOSE ANOTHER." });
    }
    
    activeRooms[roomUpper] = {
      creator: socket.id,
      stegoImg: data.stegoImg
    };
    
    socket.join(roomUpper);
    console.log(`Room Created: ${roomUpper} by ${socket.id}`);
    callback({ success: true });
  });

  // --- JOIN ROOM ---
  socket.on('join_room', (data, callback) => {
    const roomUpper = data.room.toUpperCase();
    if (!activeRooms[roomUpper]) {
      return callback({ success: false, message: "FREQUENCY DOES NOT EXIST. CREATE IT FIRST." });
    }

    socket.join(roomUpper);
    socket.to(roomUpper).emit('user_joined', socket.id);
    console.log(`User ${socket.id} joined ${roomUpper}`);
    
    callback({ success: true, stegoImg: activeRooms[roomUpper].stegoImg });
  });

  // --- TERMINATE ROOM (SKULL ICON) ---
  socket.on('terminate_room', (room) => {
    const roomUpper = room.toUpperCase();
    if (activeRooms[roomUpper] && activeRooms[roomUpper].creator === socket.id) {
      console.log(`Room Terminated: ${roomUpper} by Creator`);
      io.to(roomUpper).emit('room_terminated');
      delete activeRooms[roomUpper];
      io.in(roomUpper).socketsLeave(roomUpper);
    }
  });

  socket.on('typing_start', (room) => socket.to(room.toUpperCase()).emit('peer_typing', true));
  socket.on('typing_stop', (room) => socket.to(room.toUpperCase()).emit('peer_typing', false));

  // --- CRYPTO EVENTS ---
  socket.on('share_pubkey', (data) => {
      socket.to(data.room.toUpperCase()).emit('peer_pubkey', { 
          key: data.key, 
          lweKey: data.lweKey, 
          id: socket.id 
      });
  });

  socket.on('send_handshake', (data) => socket.to(data.room.toUpperCase()).emit('handshake_challenge', data));
  socket.on('send_msg', (data) => socket.to(data.room.toUpperCase()).emit('rcv_msg', data));

  // --- DEAD-MAN'S SWITCH (DISCONNECT HANDLING) ---
  socket.on('disconnecting', () => {
    // 1. Notify standard rooms that a user left
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit('user_left', socket.id);
      }
    }

    // 2. HARD CLEANUP: If the user leaving is a Creator, destroy their rooms
    for (const [roomName, roomData] of Object.entries(activeRooms)) {
        if (roomData.creator === socket.id) {
            console.log(`Creator disconnected unexpectedly. Terminating room: ${roomName}`);
            io.to(roomName).emit('room_terminated');
            delete activeRooms[roomName];
            io.in(roomName).socketsLeave(roomName);
        }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User Left: ${socket.id}`);
  });
});

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ Q-Comm Server running on port 3001');
});