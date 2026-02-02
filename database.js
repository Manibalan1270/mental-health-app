const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'local-db', 'rkive.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          handle TEXT UNIQUE NOT NULL,
          avatar TEXT NOT NULL,
          color TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Users table error:', err);
      });

      // Moods table
      db.run(`
        CREATE TABLE IF NOT EXISTS moods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          score INTEGER NOT NULL CHECK(score >= 1 AND score <= 10),
          note TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id)
        )
      `, (err) => {
        if (err) console.error('Moods table error:', err);
      });

      // Rooms table
      db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          contextData TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id)
        )
      `, (err) => {
        if (err) console.error('Rooms table error:', err);
      });

      // Room entries table
      db.run(`
        CREATE TABLE IF NOT EXISTS room_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          roomId INTEGER NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(roomId) REFERENCES rooms(id)
        )
      `, (err) => {
        if (err) console.error('Room entries table error:', err);
      });

      // Room chats table
      db.run(`
        CREATE TABLE IF NOT EXISTS room_chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          roomId INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          isCrisis INTEGER DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(roomId) REFERENCES rooms(id)
        )
      `, (err) => {
        if (err) console.error('Room chats table error:', err);
      });

      // Konekt chats table
      db.run(`
        CREATE TABLE IF NOT EXISTS konekt_chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chatRoomId TEXT NOT NULL,
          senderHandle TEXT NOT NULL,
          content TEXT NOT NULL,
          isFlagged INTEGER DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Konekt chats table error:', err);
      });

      // Seed users
      const seededUsers = [
        { id: 'user_bluejay_293', handle: 'BlueJay_293', avatar: 'BJ', color: '#4A90D9' },
        { id: 'user_silentecho_18', handle: 'SilentEcho_18', avatar: 'SE', color: '#50C878' },
        { id: 'user_nightowl_22', handle: 'NightOwl_22', avatar: 'NO', color: '#9B59B6' }
      ];

      seededUsers.forEach(user => {
        db.run(
          `INSERT OR IGNORE INTO users (id, handle, avatar, color) VALUES (?, ?, ?, ?)`,
          [user.id, user.handle, user.avatar, user.color],
          (err) => {
            if (err) console.error('Seed user error:', err);
          }
        );
      });

      resolve();
    });
  });
};

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

module.exports = {
  db,
  initDatabase,
  dbRun,
  dbGet,
  dbAll
};
