const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase, dbRun, dbGet, dbAll } = require('./database');
const { encrypt, decrypt, generateKeyFromUserId } = require('./encryption');
const { getRobinResponse, getKonektRobinResponse } = require('./robin-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// Serve static files
app.use('/frontend.js', express.static(path.join(__dirname, 'frontend.js')));
app.use(express.static('G:/college/stitch'));
app.use(express.static('G:/college/stitch/stitch'));

app.get('/', (req, res) => {
  res.sendFile('G:/college/stitch/stitch/rkive_personal_dashboard/code.html');
});

// Store current user in memory
let currentUserId = null;

// ============ USERS ============
app.get('/api/users', async (req, res) => {
  try {
    const users = await dbAll('SELECT * FROM users');
    res.json({ success: true, data: users });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/users/current', async (req, res) => {
  try {
    const { userId } = req.body;
    currentUserId = userId;
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    res.json({ success: true, data: user });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ MOODS ============
app.post('/api/moods/log', async (req, res) => {
  try {
    const { userId, score, note } = req.body;
    if (!userId || score < 1 || score > 10) {
      return res.json({ success: false, error: 'Invalid input' });
    }
    const result = await dbRun(
      'INSERT INTO moods (userId, score, note) VALUES (?, ?, ?)',
      [userId, score, note || '']
    );
    res.json({ success: true, data: { id: result.id, userId, score, note } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/moods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const moods = await dbAll(
      'SELECT * FROM moods WHERE userId = ? ORDER BY timestamp DESC LIMIT 30',
      [userId]
    );
    res.json({ success: true, data: moods });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/moods/:userId/average', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await dbGet(
      'SELECT AVG(score) as average FROM moods WHERE userId = ? AND timestamp > datetime("now", "-7 days")',
      [userId]
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ ROOMS ============
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { userId, title, type } = req.body;
    if (!userId || !title || !type) {
      return res.json({ success: false, error: 'Missing required fields' });
    }
    const result = await dbRun(
      'INSERT INTO rooms (userId, title, type, contextData) VALUES (?, ?, ?, ?)',
      [userId, title, type, JSON.stringify({})]
    );
    res.json({ success: true, data: { id: result.id, userId, title, type } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/rooms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const rooms = await dbAll(
      'SELECT * FROM rooms WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    res.json({ success: true, data: rooms });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/:roomId/entries', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { type, content, userId } = req.body;
    if (!type || !content) {
      return res.json({ success: false, error: 'Missing required fields' });
    }
    let encryptedContent = content;
    if (userId) {
      const key = generateKeyFromUserId(userId);
      encryptedContent = encrypt(content, key);
    }
    const result = await dbRun(
      'INSERT INTO room_entries (roomId, type, content) VALUES (?, ?, ?)',
      [roomId, type, encryptedContent]
    );
    res.json({ success: true, data: { id: result.id, type, content: content.substring(0, 50) } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/rooms/:roomId/entries', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const entries = await dbAll(
      'SELECT * FROM room_entries WHERE roomId = ? ORDER BY timestamp',
      [roomId]
    );
    if (userId) {
      const key = generateKeyFromUserId(userId);
      entries.forEach(entry => {
        entry.content = decrypt(entry.content, key);
      });
    }
    res.json({ success: true, data: entries });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ ROBIN (Room-specific chat) ============
app.post('/api/robin/chat', async (req, res) => {
  try {
    const { roomId, message, userId } = req.body;
    if (!roomId || !message) {
      return res.json({ success: false, error: 'Missing required fields' });
    }
    const room = await dbGet('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.json({ success: false, error: 'Room not found' });
    }
    const chatHistory = await dbAll(
      'SELECT role, content FROM room_chats WHERE roomId = ? ORDER BY timestamp DESC LIMIT 5',
      [roomId]
    );
    const robinResponse = await getRobinResponse(message, room.title, chatHistory.reverse());

    // Always log the user message
    await dbRun(
      'INSERT INTO room_chats (roomId, role, content, isCrisis) VALUES (?, ?, ?, ?)',
      [roomId, 'user', message, 0]
    );

    if (robinResponse.isCrisis) {
      // SESSION RESET: If a crisis is detected, delete all chat history for this room
      // so the next time the user chats, it starts fresh.
      await dbRun('DELETE FROM room_chats WHERE roomId = ?', [roomId]);
      console.log(`Crisis detected in room ${roomId}. Session cleared.`);
    } else {
      // Log the assistant response if not a crisis
      await dbRun(
        'INSERT INTO room_chats (roomId, role, content, isCrisis) VALUES (?, ?, ?, ?)',
        [roomId, 'assistant', robinResponse.reply, 0]
      );
    }

    res.json({ success: true, data: robinResponse });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ KONEKT ============
app.get('/api/konekt/matches', async (req, res) => {
  try {
    const { userId } = req.query;
    const matches = await dbAll(
      'SELECT id, handle, avatar, color FROM users WHERE id != ? LIMIT 10',
      [userId]
    );
    res.json({ success: true, data: matches });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/konekt/chat/send', async (req, res) => {
  try {
    const { chatRoomId, senderHandle, content } = req.body;
    if (!chatRoomId || !senderHandle || !content) {
      return res.json({ success: false, error: 'Missing required fields' });
    }
    const moderation = await getKonektRobinResponse(content, []);
    const result = await dbRun(
      'INSERT INTO konekt_chats (chatRoomId, senderHandle, content, isFlagged) VALUES (?, ?, ?, ?)',
      [chatRoomId, senderHandle, content, moderation.isFlagged ? 1 : 0]
    );
    res.json({
      success: true,
      data: {
        id: result.id,
        chatRoomId,
        senderHandle,
        content,
        isFlagged: moderation.isFlagged,
        warning: moderation.warning
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/konekt/chat/:chatRoomId', async (req, res) => {
  try {
    const { chatRoomId } = req.params;
    const messages = await dbAll(
      'SELECT * FROM konekt_chats WHERE chatRoomId = ? ORDER BY timestamp',
      [chatRoomId]
    );
    res.json({ success: true, data: messages });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ SERVER START ============
async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`Rkive Backend running on http://localhost:${PORT}`);
      console.log('Ready to handle requests.');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
