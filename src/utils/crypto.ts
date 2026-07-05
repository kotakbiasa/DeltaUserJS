/**
 * Crypto utility untuk enkripsi/dekripsi session string Telegram.
 * Menggunakan AES-256-GCM untuk enkripsi authenticated.
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn('⚠️ ENCRYPTION_KEY belum diset di .env. Session strings tidak akan dienkripsi.');
}

let keyBuffer: Buffer;
try {
  // Gunakan unique salt dari ENCRYPTION_KEY itu sendiri untuk menghindari rainbow table
  const salt = ENCRYPTION_KEY
    ? crypto.createHash('sha256').update(ENCRYPTION_KEY).digest().subarray(0, 16)
    : Buffer.alloc(16);
  keyBuffer = crypto.scryptSync(ENCRYPTION_KEY || 'disabled', salt, 32);
} catch {
  keyBuffer = Buffer.alloc(32);
}

/**
 * Enkripsi plaintext → hex string: <nonce>:<authTag>:<ciphertext>
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, nonce);
  let ct = cipher.update(plaintext, 'utf8', 'hex');
  ct += cipher.final('hex');
  return `${nonce.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct}`;
}

/**
 * Dekripsi hex string → plaintext.
 * Throws if decryption fails.
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) return '';
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted; // not encrypted, return as-is
  const nonce = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ct = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, nonce);
  decipher.setAuthTag(authTag);
  let pt = decipher.update(ct, 'hex', 'utf8');
  return pt + decipher.final('utf8');
}

/**
 * Cek apakah string terenkripsi (format hex:hex:hex).
 */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}
