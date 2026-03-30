import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const PORT = process.env.PORT || 3001;

// --- Color palettes ---
const SKIN_COLORS = [0xf5c6a0, 0xf0b88a, 0xf5d0b0, 0xdeb887, 0xc68c53, 0xe0a878, 0xf0c8a0, 0xd2a06a];
const HAIR_COLORS = [0x3b2417, 0x8b4513, 0x2c1a0e, 0x1a1a1a, 0xc84040, 0x4a3728, 0x5c3a1e, 0x222222];
const SHIRT_COLORS = [
  0x1a1a1a, 0xe056a0, 0x50c878, 0xf5a623, 0x6a5acd,
  0x20b2aa, 0x808080, 0xdc143c, 0x4488cc, 0xcc6633,
  0x33aa66, 0xdd4466, 0x5577cc, 0xaa55cc, 0x44aaaa,
];

// Safe spawn positions — near left-wall entry door first, then spreading out
const SPAWN_POSITIONS = [
  { x: 1, y: 3 }, { x: 1, y: 4 },
  { x: 2, y: 3 }, { x: 2, y: 4 },
  { x: 3, y: 3 }, { x: 3, y: 4 },
  { x: 1, y: 5 }, { x: 1, y: 6 },
  { x: 14, y: 3 }, { x: 14, y: 5 },
  { x: 12, y: 3 }, { x: 12, y: 5 },
  { x: 17, y: 3 }, { x: 17, y: 5 },
  { x: 19, y: 3 }, { x: 19, y: 5 },
  { x: 9, y: 3 }, { x: 9, y: 5 }, { x: 9, y: 9 },
  { x: 7, y: 7 }, { x: 7, y: 9 },
  { x: 4, y: 7 }, { x: 4, y: 11 },
  { x: 23, y: 3 }, { x: 24, y: 4 },
  { x: 30, y: 5 }, { x: 31, y: 7 }, { x: 33, y: 7 },
  { x: 35, y: 5 }, { x: 37, y: 7 }, { x: 38, y: 5 },
  { x: 32, y: 3 }, { x: 37, y: 12 }, { x: 40, y: 10 },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SHIRT_STYLES = {
  'blue-lines': 0x4488cc,
  'river': 0xffffff,
  'white-v': 0xffffff,
  'pink': 0xff69b4,
  'black-logo': 0x1a1a1a,
};

function parseHexColor(str) {
  if (!str) return null;
  // Handle "0x1a1a1a" or "1a1a1a" formats
  const n = Number(str);
  if (!isNaN(n)) return n;
  const clean = str.replace(/^0x/i, '');
  const parsed = parseInt(clean, 16);
  return isNaN(parsed) ? null : parsed;
}

function randomColor(shirtStyle, hairStyle, hairColor, skinColor) {
  const shirt = SHIRT_STYLES[shirtStyle] || pickRandom(SHIRT_COLORS);
  const hair = parseHexColor(hairColor) ?? pickRandom(HAIR_COLORS);
  const skin = parseHexColor(skinColor) ?? pickRandom(SKIN_COLORS);
  return {
    skin,
    hair,
    shirt,
    shirtStyle: shirtStyle || null,
    hairStyle: hairStyle || 'short',
  };
}

function findSpawnPosition() {
  // Always spawn at the entry door (top-left)
  return { x: 1, y: 3 };
}

// Players map: socketId -> PlayerData
const players = new Map();

// Meeting rooms state
const meetingRooms = new Map();
meetingRooms.set('meet-1', { owner: null, maxCapacity: 2, players: new Set() });
meetingRooms.set('meet-2', { owner: null, maxCapacity: 2, players: new Set() });
meetingRooms.set('meet-3', { owner: null, maxCapacity: 2, players: new Set() });

const MAP_COLS = 44;
const MAP_ROWS = 40;

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('player:join', (data) => {
    const color = randomColor(data.shirtStyle, data.hairStyle, data.hairColor, data.skinColor);
    const pos = findSpawnPosition(players);

    const player = {
      id: socket.id,
      name: data.name || 'Anónimo',
      position: data.position || 'Miembro del equipo',
      color,
      x: pos.x,
      y: pos.y,
      cameraOn: false,
      micOn: false,
    };

    players.set(socket.id, player);

    // Send full state to the new player
    socket.emit('game:state', {
      you: player,
      players: Array.from(players.values()),
    });

    // Broadcast to others
    socket.broadcast.emit('player:joined', player);

    console.log(`Joined: ${player.name} (${socket.id}) at (${pos.x}, ${pos.y})`);
  });

  socket.on('player:move', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const newX = parseInt(data.x, 10);
    const newY = parseInt(data.y, 10);

    // Basic bounds check
    if (newX < 0 || newX >= MAP_COLS || newY < 0 || newY >= MAP_ROWS) return;

    player.x = newX;
    player.y = newY;

    socket.broadcast.emit('player:moved', {
      id: socket.id,
      x: newX,
      y: newY,
    });
  });

  // --- Camera state ---
  socket.on('camera:on', () => {
    const player = players.get(socket.id);
    if (!player) return;
    player.cameraOn = true;
    socket.broadcast.emit('camera:on', { id: socket.id });
  });

  socket.on('camera:off', () => {
    const player = players.get(socket.id);
    if (!player) return;
    player.cameraOn = false;
    socket.broadcast.emit('camera:off', { id: socket.id });
  });

  // --- Mic state ---
  socket.on('mic:on', () => {
    const player = players.get(socket.id);
    if (!player) return;
    player.micOn = true;
    socket.broadcast.emit('mic:on', { id: socket.id });
  });

  socket.on('mic:off', () => {
    const player = players.get(socket.id);
    if (!player) return;
    player.micOn = false;
    socket.broadcast.emit('mic:off', { id: socket.id });
  });

  // --- WebRTC signaling ---
  socket.on('rtc:offer', ({ targetId, offer }) => {
    io.to(targetId).emit('rtc:offer', { fromId: socket.id, offer });
  });

  socket.on('rtc:answer', ({ targetId, answer }) => {
    io.to(targetId).emit('rtc:answer', { fromId: socket.id, answer });
  });

  socket.on('rtc:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('rtc:ice', { fromId: socket.id, candidate });
  });

  // --- Game sync (bug fix: late joiners missing players) ---
  socket.on('game:sync', () => {
    socket.emit('game:sync', { players: Array.from(players.values()) });
  });

  // --- Chat ---
  socket.on('chat:send', ({ message }) => {
    const player = players.get(socket.id);
    if (!player || !message) return;
    socket.broadcast.emit('chat:message', {
      id: socket.id,
      name: player.name,
      message: message.slice(0, 200),
      timestamp: Date.now(),
    });
  });

  // --- Meeting rooms ---
  socket.on('meeting:join', ({ roomId }) => {
    const room = meetingRooms.get(roomId);
    if (!room) return;
    if (room.players.size >= room.maxCapacity) {
      socket.emit('meeting:full', { roomId });
      return;
    }
    room.players.add(socket.id);
    if (!room.owner) room.owner = socket.id;
    const payload = {
      roomId,
      owner: room.owner,
      maxCapacity: room.maxCapacity,
      playerIds: Array.from(room.players),
    };
    // Notify all room members
    for (const pid of room.players) {
      io.to(pid).emit('meeting:updated', payload);
    }
  });

  socket.on('meeting:leave', ({ roomId }) => {
    const room = meetingRooms.get(roomId);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      room.owner = null;
      room.maxCapacity = 2;
    } else if (room.owner === socket.id) {
      room.owner = room.players.values().next().value;
    }
    // Notify leaving player
    socket.emit('meeting:updated', { roomId, owner: room.owner, maxCapacity: room.maxCapacity, playerIds: Array.from(room.players) });
    // Notify remaining members
    if (room.players.size > 0) {
      const payload = {
        roomId,
        owner: room.owner,
        maxCapacity: room.maxCapacity,
        playerIds: Array.from(room.players),
      };
      for (const pid of room.players) {
        io.to(pid).emit('meeting:updated', payload);
      }
    }
  });

  socket.on('meeting:setCapacity', ({ roomId, maxCapacity }) => {
    const room = meetingRooms.get(roomId);
    if (!room) return;
    if (room.owner !== socket.id) return;
    const cap = Math.max(2, Math.min(5, parseInt(maxCapacity, 10)));
    room.maxCapacity = cap;
    const payload = {
      roomId,
      owner: room.owner,
      maxCapacity: room.maxCapacity,
      playerIds: Array.from(room.players),
    };
    for (const pid of room.players) {
      io.to(pid).emit('meeting:updated', payload);
    }
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`Left: ${player.name} (${socket.id})`);
      // Auto-leave any meeting room
      for (const [roomId, room] of meetingRooms) {
        if (room.players.has(socket.id)) {
          room.players.delete(socket.id);
          if (room.players.size === 0) {
            room.owner = null;
            room.maxCapacity = 2;
          } else if (room.owner === socket.id) {
            room.owner = room.players.values().next().value;
          }
          if (room.players.size > 0) {
            const payload = {
              roomId,
              owner: room.owner,
              maxCapacity: room.maxCapacity,
              playerIds: Array.from(room.players),
            };
            for (const pid of room.players) {
              io.to(pid).emit('meeting:updated', payload);
            }
          }
        }
      }
      players.delete(socket.id);
      io.emit('player:left', { id: socket.id });
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Paisanos server running on http://0.0.0.0:${PORT}`);
});
