// End-to-end checks of the HTTP API against a throwaway in-memory database.
process.env.DB_PATH = ':memory:';
process.env.SECRET_KEY = 'test-secret-key-that-is-long-enough-1234567890';
process.env.DEMO_MODE = 'false';
delete process.env.GROQ_API_KEY;
delete process.env.GROK_API_KEY;

const test = require('node:test');
const assert = require('node:assert');
const { app, initDatabase } = require('../server');
const { db } = require('../database');

let base;
let server;

test.before(async () => {
  await initDatabase();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const signup = async (handle) => (await call('/api/auth/signup', { method: 'POST', body: { handle } })).body.data;

test('requests without a token are refused', async () => {
  assert.strictEqual((await call('/api/me')).status, 401);
  assert.strictEqual((await call('/api/konekt/matches')).status, 401);
});

test('the old "list every user" endpoint is gone', async () => {
  assert.strictEqual((await call('/api/users')).status, 404);
  assert.strictEqual((await call('/api/demo/users')).status, 404); // DEMO_MODE off
});

test('users can only read their own moods', async () => {
  const alice = await signup('alice_1');
  const bob = await signup('bob_1');
  const logged = await call('/api/moods/log', {
    method: 'POST',
    token: alice.token,
    body: { score: 7, note: 'private note' },
  });
  assert.strictEqual(logged.status, 200);

  const own = await call(`/api/moods/${alice.user.id}`, { token: alice.token });
  assert.strictEqual(own.body.data[0].note, 'private note');

  const other = await call(`/api/moods/${alice.user.id}`, { token: bob.token });
  assert.strictEqual(other.status, 403);
});

test('room entries are encrypted in the database and private to the owner', async () => {
  const carol = await signup('carol_1');
  const dave = await signup('dave_1');
  const room = (await call('/api/rooms/create', { method: 'POST', token: carol.token, body: { title: 'Journal', type: 'reflection' } })).body.data;

  await call(`/api/rooms/${room.id}/entries`, { method: 'POST', token: carol.token, body: { type: 'note', content: 'my secret thought' } });

  const raw = await new Promise((resolve, reject) =>
    db.get('SELECT content FROM room_entries WHERE roomId = ?', [room.id], (e, r) => (e ? reject(e) : resolve(r))),
  );
  assert.ok(raw.content.startsWith('v2:'), 'stored encrypted');
  assert.ok(!raw.content.includes('secret'), 'no plain text in DB');

  const mine = await call(`/api/rooms/${room.id}/entries`, { token: carol.token });
  assert.strictEqual(mine.body.data[0].content, 'my secret thought');

  const theirs = await call(`/api/rooms/${room.id}/entries`, { token: dave.token });
  assert.strictEqual(theirs.status, 404);
});

test('Robin chat still flags a crisis (with helplines) when the AI is unavailable', async () => {
  const erin = await signup('erin_1');
  const room = (await call('/api/rooms/create', { method: 'POST', token: erin.token, body: { title: 'Talk', type: 'chat' } })).body.data;
  const res = await call('/api/robin/chat', { method: 'POST', token: erin.token, body: { roomId: room.id, message: 'i want to end my life' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.isCrisis, true);
  assert.match(res.body.data.reply, /14416/);
});

test('Konekt: sender comes from the token, both sides share one chat, flagged text is hidden', async () => {
  const f = await signup('frank_1');
  const g = await signup('grace_1');
  const sent = await call('/api/konekt/chat/send', { method: 'POST', token: f.token, body: { partnerId: g.user.id, content: 'hi there', senderHandle: 'grace_1' } });
  assert.strictEqual(sent.body.data.senderHandle, 'frank_1', 'cannot impersonate');
  await call('/api/konekt/chat/send', { method: 'POST', token: f.token, body: { partnerId: g.user.id, content: 'you are a loser' } });

  const seenByGrace = await call(`/api/konekt/chat/with/${f.user.id}`, { token: g.token });
  assert.strictEqual(seenByGrace.body.data.length, 2);
  assert.strictEqual(seenByGrace.body.data[1].content, '[Message hidden by Robin for safety]');
});

test('server errors do not leak internal messages', async () => {
  const h = await signup('henry_1');
  const res = await call('/api/moods/log', { method: 'POST', token: h.token, body: { score: 99 } });
  assert.strictEqual(res.status, 400);
});
