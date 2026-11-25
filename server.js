const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const { initDatabase, dbRun, dbGet, dbAll } = require('./database');
const { encrypt, decrypt, masterKey } = require('./encryption');
const { getRobinResponse, getKonektRobinResponse } = require('./robin-ai');

const app = express();
const PORT = process.env.PORT || 3000;
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const MAX_TEXT = 2000;

// ============ MIDDLEWARE ============
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()),
  }),
);
app.use(express.json({ limit: '50kb' }));

// The browser helper script lives in this repo.
app.get('/rkive-frontend.js', (req, res) => res.sendFile(path.join(__dirname, 'rkive-frontend.js')));

// Optional: serve the HTML pages from a folder set in .env (FRONTEND_DIR).
if (process.env.FRONTEND_DIR) {
  app.use(express.static(process.env.FRONTEND_DIR));
}
app.get('/', (req, res) => {
  if (process.env.FRONTEND_DIR && process.env.HOME_PAGE) {
    return res.sendFile(path.join(process.env.FRONTEND_DIR, process.env.HOME_PAGE));
  }
  res.json({ success: true, message: 'Rkive backend is running.' });
});

// Basic abuse protection: limits per IP address.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20 });

// ============ HELPERS ============
function fail(res, status, error) {
  return res.status(status).json({ success: false, error });
}

/** Wraps a route so unexpected errors are logged on the server, not sent to the browser. */
const route = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    fail(res, 500, 'Something went wrong. Please try again.');
  }
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const publicUser = (u) => u && { id: u.id, handle: u.handle, avatar: u.avatar, color: u.color };
const isText = (v, max = MAX_TEXT) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

const COLORS = ['#4A90D9', '#50C878', '#9B59B6', '#E67E22', '#E74C3C', '#1ABC9C'];

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await dbRun('INSERT INTO sessions (tokenHash, userId) VALUES (?, ?)', [hashToken(token), userId]);
  return token;
}

/** Requires "Authorization: Bearer <token>". Sets req.user. */
async function auth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return fail(res, 401, 'Please sign in first.');
    const session = await dbGet('SELECT userId FROM sessions WHERE tokenHash = ?', [
      hashToken(token),
    ]);
    if (!session) return fail(res, 401, 'Your session has expired. Please sign in again.');
    req.user = await dbGet('SELECT * FROM users WHERE id = ?', [session.userId]);
    if (!req.user) return fail(res, 401, 'Account not found.');
    next();
  } catch (err) {
    console.error('[auth]', err);
    fail(res, 500, 'Something went wrong. Please try again.');
  }
}

/** Loads a room and checks it belongs to the signed-in user. */
async function ownRoom(req, res, roomId) {
  const room = await dbGet('SELECT * FROM rooms WHERE id = ?', [roomId]);
  if (!room || room.userId !== req.user.id) {
    fail(res, 404, 'Room not found.');
    return null;
  }
  return room;
}

// ============ AUTH ============
// Create an anonymous account. Returns a token the browser keeps in localStorage.
app.post(
  '/api/auth/signup',
  authLimiter,
  route(async (req, res) => {
    let { handle } = req.body || {};
    if (handle !== undefined && !/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
      return fail(res, 400, 'Handle must be 3-20 letters, numbers or underscores.');
    }
    if (!handle) handle = `Friend_${crypto.randomInt(1000, 9999)}`;
    if (await dbGet('SELECT id FROM users WHERE handle = ?', [handle])) {
      return fail(res, 409, 'That handle is taken. Try another one.');
    }
    const id = `user_${crypto.randomBytes(8).toString('hex')}`;
    const user = {
      id,
      handle,
      avatar: handle.slice(0, 2).toUpperCase(),
      color: COLORS[crypto.randomInt(COLORS.length)],
    };
    await dbRun('INSERT INTO users (id, handle, avatar, color) VALUES (?, ?, ?, ?)', [
      user.id,
      user.handle,
      user.avatar,
      user.color,
    ]);
    const token = await createSession(id);
    res.status(201).json({ success: true, data: { user, token } });
  }),
);

// Demo login (pick a seeded user). Only enabled with DEMO_MODE=true.
app.get(
  '/api/demo/users',
  route(async (req, res) => {
    if (!DEMO_MODE) return fail(res, 404, 'Not found.');
    const users = await dbAll('SELECT * FROM users');
    res.json({ success: true, data: users.map(publicUser) });
  }),
);
app.post(
  '/api/demo/login',
  authLimiter,
  route(async (req, res) => {
    if (!DEMO_MODE) return fail(res, 404, 'Not found.');
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.body?.userId]);
    if (!user) return fail(res, 404, 'User not found.');
    const token = await createSession(user.id);
    res.json({ success: true, data: { user: publicUser(user), token } });
  }),
);

app.get(
  '/api/me',
  auth,
  route(async (req, res) => res.json({ success: true, data: publicUser(req.user) })),
);

app.post(
  '/api/auth/logout',
  auth,
  route(async (req, res) => {
    const token = req.get('authorization').slice(7);
    await dbRun('DELETE FROM sessions WHERE tokenHash = ?', [hashToken(token)]);
    res.json({ success: true });
  }),
);

// ============ MOODS ============
app.post(
  '/api/moods/log',
  auth,
  route(async (req, res) => {
    const score = Number(req.body?.score);
    const note = req.body?.note || '';
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      return fail(res, 400, 'Score must be a whole number from 1 to 10.');
    }
    if (typeof note !== 'string' || note.length > MAX_TEXT) return fail(res, 400, 'Note is too long.');
    const result = await dbRun('INSERT INTO moods (userId, score, note) VALUES (?, ?, ?)', [
      req.user.id,
      score,
      note ? encrypt(note, req.user.id) : '',
    ]);
    res.json({ success: true, data: { id: result.id, userId: req.user.id, score, note } });
  }),
);

// The :userId in these paths is kept for the existing frontend, but it must be you.
function selfOnly(req, res, next) {
  if (req.params.userId !== req.user.id) return fail(res, 403, 'You can only see your own data.');
  next();
}

app.get(
  '/api/moods/:userId',
  auth,
  selfOnly,
  route(async (req, res) => {
    const moods = await dbAll(
      'SELECT * FROM moods WHERE userId = ? ORDER BY timestamp DESC LIMIT 30',
      [req.user.id],
    );
    moods.forEach((m) => (m.note = m.note ? decrypt(m.note, req.user.id) : ''));
    res.json({ success: true, data: moods });
  }),
);

app.get(
  '/api/moods/:userId/average',
  auth,
  selfOnly,
  route(async (req, res) => {
    const result = await dbGet(
      "SELECT AVG(score) as average FROM moods WHERE userId = ? AND timestamp > datetime('now', '-7 days')",
      [req.user.id],
    );
    res.json({ success: true, data: result });
  }),
);

// ============ ROOMS ============
app.post(
  '/api/rooms/create',
  auth,
  route(async (req, res) => {
    const { title, type } = req.body || {};
    if (!isText(title, 100) || !isText(type, 30)) return fail(res, 400, 'Missing required fields.');
    const result = await dbRun(
      'INSERT INTO rooms (userId, title, type, contextData) VALUES (?, ?, ?, ?)',
      [req.user.id, title.trim(), type.trim(), JSON.stringify({})],
    );
    res.json({ success: true, data: { id: result.id, userId: req.user.id, title, type } });
  }),
);

app.get(
  '/api/rooms/:userId',
  auth,
  selfOnly,
  route(async (req, res) => {
    const rooms = await dbAll('SELECT * FROM rooms WHERE userId = ? ORDER BY createdAt DESC', [
      req.user.id,
    ]);
    res.json({ success: true, data: rooms });
  }),
);

app.post(
  '/api/rooms/:roomId/entries',
  auth,
  route(async (req, res) => {
    const room = await ownRoom(req, res, req.params.roomId);
    if (!room) return;
    const { type, content } = req.body || {};
    if (!isText(type, 30) || !isText(content)) return fail(res, 400, 'Missing required fields.');
    const result = await dbRun('INSERT INTO room_entries (roomId, type, content) VALUES (?, ?, ?)', [
      room.id,
      type,
      encrypt(content, req.user.id),
    ]);
    res.json({ success: true, data: { id: result.id, type, content: content.substring(0, 50) } });
  }),
);

app.get(
  '/api/rooms/:roomId/entries',
  auth,
  route(async (req, res) => {
    const room = await ownRoom(req, res, req.params.roomId);
    if (!room) return;
    const entries = await dbAll('SELECT * FROM room_entries WHERE roomId = ? ORDER BY timestamp', [
      room.id,
    ]);
    entries.forEach((e) => (e.content = decrypt(e.content, req.user.id)));
    res.json({ success: true, data: entries });
  }),
);

// ============ ROBIN (room chat) ============
app.post(
  '/api/robin/chat',
  auth,
  aiLimiter,
  route(async (req, res) => {
    const { roomId, message } = req.body || {};
    if (!roomId || !isText(message)) return fail(res, 400, 'Missing required fields.');
    const room = await ownRoom(req, res, roomId);
    if (!room) return;

    const recent = await dbAll(
      'SELECT role, content FROM room_chats WHERE roomId = ? ORDER BY id DESC LIMIT 6',
      [room.id],
    );
    const history = recent.reverse().map((h) => ({ ...h, content: decrypt(h.content, req.user.id) }));

    const robin = await getRobinResponse(message, room.title, history);

    // History is kept (not wiped) in a crisis, so a false alarm never deletes
    // someone's conversation. Crisis turns are marked with isCrisis = 1.
    const flag = robin.isCrisis ? 1 : 0;
    await dbRun('INSERT INTO room_chats (roomId, role, content, isCrisis) VALUES (?, ?, ?, ?)', [
      room.id,
      'user',
      encrypt(message, req.user.id),
      flag,
    ]);
    await dbRun('INSERT INTO room_chats (roomId, role, content, isCrisis) VALUES (?, ?, ?, ?)', [
      room.id,
      'assistant',
      encrypt(robin.reply, req.user.id),
      flag,
    ]);

    res.json({ success: true, data: robin });
  }),
);

// ============ KONEKT ============
// A chat between two users always has the same id, whoever opens it first.
const konektRoomId = (a, b) => `konekt:${[a, b].sort().join(':')}`;

app.get(
  '/api/konekt/matches',
  auth,
  route(async (req, res) => {
    const matches = await dbAll(
      'SELECT id, handle, avatar, color FROM users WHERE id != ? ORDER BY RANDOM() LIMIT 10',
      [req.user.id],
    );
    res.json({ success: true, data: matches });
  }),
);

app.post(
  '/api/konekt/chat/send',
  auth,
  aiLimiter,
  route(async (req, res) => {
    const { partnerId, content } = req.body || {};
    if (!partnerId || !isText(content)) return fail(res, 400, 'Missing required fields.');
    if (partnerId === req.user.id) return fail(res, 400, 'You cannot message yourself.');
    const partner = await dbGet('SELECT id FROM users WHERE id = ?', [partnerId]);
    if (!partner) return fail(res, 404, 'User not found.');

    const moderation = await getKonektRobinResponse(content);
    const chatRoomId = konektRoomId(req.user.id, partnerId);
    const result = await dbRun(
      'INSERT INTO konekt_chats (chatRoomId, senderHandle, content, isFlagged) VALUES (?, ?, ?, ?)',
      [chatRoomId, req.user.handle, content, moderation.isFlagged ? 1 : 0],
    );
    res.json({
      success: true,
      data: {
        id: result.id,
        chatRoomId,
        senderHandle: req.user.handle,
        content,
        isFlagged: moderation.isFlagged,
        warning: moderation.warning,
      },
    });
  }),
);

app.get(
  '/api/konekt/chat/with/:partnerId',
  auth,
  route(async (req, res) => {
    const chatRoomId = konektRoomId(req.user.id, req.params.partnerId);
    const messages = await dbAll(
      'SELECT * FROM konekt_chats WHERE chatRoomId = ? ORDER BY timestamp, id',
      [chatRoomId],
    );
    // Flagged messages are hidden from the other person (the sender still sees theirs).
    messages.forEach((m) => {
      if (m.isFlagged && m.senderHandle !== req.user.handle) {
        m.content = '[Message hidden by Robin for safety]';
      }
    });
    res.json({ success: true, data: messages });
  }),
);

// ============ FALLBACKS ============
app.use('/api', (req, res) => fail(res, 404, 'Not found.'));

// Bad JSON bodies and any other unexpected error: answer in JSON, log the details.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Invalid JSON.');
  if (err.type === 'entity.too.large') return fail(res, 413, 'Request is too large.');
  console.error(`[${req.method} ${req.path}]`, err);
  fail(res, 500, 'Something went wrong. Please try again.');
});

// ============ SERVER START ============
async function startServer() {
  try {
    masterKey(); // fail fast with a clear message if SECRET_KEY is missing
    await initDatabase();
    console.log('Database initialized successfully');
    if (DEMO_MODE) console.log('DEMO_MODE is on: demo users and demo login are enabled.');
    app.listen(PORT, () => console.log(`Rkive backend running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = { app, initDatabase };
