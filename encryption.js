const crypto = require('crypto');

/**
 * At-rest encryption for private content (room entries, Robin chats, mood notes).
 *
 * - AES-256-GCM (authenticated: tampered data fails to decrypt instead of
 *   returning garbage).
 * - One key per user, derived from the server's SECRET_KEY with HMAC. Without
 *   SECRET_KEY nobody can derive a key - not even with the user's id.
 * - Stored format: "v2:<iv hex>:<auth tag hex>:<ciphertext hex>".
 * - Never silently stores plain text: if encryption fails, it throws.
 */

const PREFIX = 'v2';

function masterKey() {
  const secret = process.env.SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SECRET_KEY must be set to a random string of at least 32 characters (see .env.example).',
    );
  }
  return secret;
}

function keyForUser(userId) {
  return crypto.createHmac('sha256', masterKey()).update(`rkive-user:${userId}`).digest();
}

function encrypt(text, userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyForUser(userId), iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':');
}

/**
 * Decrypts a value written by encrypt(). Values without the "v2:" prefix are
 * treated as old, unencrypted rows and returned as they are, so existing local
 * databases keep working.
 */
function decrypt(stored, userId) {
  if (typeof stored !== 'string' || !stored.startsWith(`${PREFIX}:`)) return stored;
  const [, ivHex, tagHex, dataHex] = stored.split(':');
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyForUser(userId),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    return '[This entry could not be decrypted]';
  }
}

module.exports = { encrypt, decrypt, masterKey };
