# Rkive — mental wellness backend

Express + SQLite backend for Rkive: mood tracking, private journaling rooms,
**Robin** (an AI companion running on Groq), and **Konekt** (moderated peer chat).

## Run it

```bash
npm install
cp .env.example .env      # then fill in GROQ_API_KEY and SECRET_KEY
npm start                 # http://localhost:3000
npm test                  # runs the automated tests
```

Generate a `SECRET_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For hackathon demos set `DEMO_MODE=true` in `.env`. This creates three demo users
and shows a "pick a user" button on the sign-in screen.

Your HTML pages load the helper script with:

```html
<script src="http://localhost:3000/rkive-frontend.js"></script>
```

To have the backend serve those pages too, set `FRONTEND_DIR` (and optionally
`HOME_PAGE`) in `.env`.

## How sign-in works

Users pick an anonymous handle (no email). The server returns a random token,
which the browser keeps in `localStorage` and sends as
`Authorization: Bearer <token>` on every request. The server works out who
you are from the token, so nobody can read another user's moods, rooms or chats
by changing an id in the URL. Only a hash of each token is stored.

## Privacy

- Mood notes, room entries and Robin chats are encrypted in the database
  (AES-256-GCM, a separate key per user, derived from `SECRET_KEY`).
- `.env` and the `local-db/` database are git-ignored and must never be committed.

## Safety

`crisis.js` checks every message for crisis phrases, on whole words only, so
"diet" or "skill" don't trigger it. The AI model also flags crises. If **either**
one flags a message, Robin's reply includes India helplines and the page shows a
support panel. This still works when the AI service is down. The helplines are:

| Service | Number | Hours |
|---|---|---|
| Tele-MANAS (Govt. of India) | 14416 / 1-800-891-4416 | 24x7 |
| iCALL (TISS) | 9152987821 | Mon–Sat, 10 AM – 8 PM |
| Emergency | 112 | 24x7 |

Re-check these numbers before any public launch.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | `{ handle? }` → `{ user, token }` |
| POST | `/api/auth/logout` | |
| GET | `/api/me` | current user |
| GET/POST | `/api/demo/users`, `/api/demo/login` | only when `DEMO_MODE=true` |
| POST | `/api/moods/log` | `{ score 1-10, note? }` |
| GET | `/api/moods/:userId`, `/api/moods/:userId/average` | your own id only |
| POST | `/api/rooms/create` | `{ title, type }` |
| GET | `/api/rooms/:userId` | your own id only |
| GET/POST | `/api/rooms/:roomId/entries` | your own rooms only |
| POST | `/api/robin/chat` | `{ roomId, message }` → `{ reply, isCrisis }` |
| GET | `/api/konekt/matches` | |
| POST | `/api/konekt/chat/send` | `{ partnerId, content }` |
| GET | `/api/konekt/chat/with/:partnerId` | |
