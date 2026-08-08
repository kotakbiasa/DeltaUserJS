/**
 * Crypto utility untuk enkripsi/dekripsi session string Telegram.
 * Menggunakan AES-256-GCM untuk enkripsi authenticated.
 */
import crypto from 'crypto';
const ALGORITHM = 'aes-256-gcm';
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
// Generate secure random key if not provided (logged once at startup)
if (!ENCRYPTION_KEY) {
    ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    console.log('⚠️ ENCRYPTION_KEY tidak diset — menggunakan random key (session tidak persisten antar restart). Setel ENCRYPTION_KEY di .env untuk persistensi.');
}
let keyBuffer;
try {
    // Gunakan salt yang tetap diturunkan dari ENCRYPTION_KEY,
    // tapi tidak sama persis dengan kunci itu sendiri agar scrypt tetap meaningful.
    const salt = crypto.createHash('sha256').update(`${ENCRYPTION_KEY}::salt`).digest().subarray(0, 16);
    keyBuffer = crypto.scryptSync(ENCRYPTION_KEY, salt, 32);
}
catch {
    keyBuffer = crypto.randomBytes(32);
}
/**
 * Enkripsi plaintext → hex string: <nonce>:<authTag>:<ciphertext>
 */
export function encrypt(plaintext) {
    if (!plaintext) {
        return '';
    }
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
export function decrypt(encrypted) {
    if (!encrypted) {
        return '';
    }
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
        return encrypted;
    } // not encrypted, return as-is
    const nonce = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ct = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, nonce);
    decipher.setAuthTag(authTag);
    const pt = decipher.update(ct, 'hex', 'utf8');
    return pt + decipher.final('utf8');
}
/**
 * Cek apakah string terenkripsi (format hex:hex:hex).
 */
export function isEncrypted(value) {
    return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}
