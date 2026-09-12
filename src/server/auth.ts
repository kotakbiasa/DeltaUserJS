import crypto from 'crypto';
import config from '../config.js';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface ValidatedInitData {
  query_id?: string;
  user: TelegramUser;
  auth_date: number;
  hash: string;
  raw: Record<string, string>;
}

/**
 * Memvalidasi raw initData string dari Telegram WebApp.
 * 
 * Sesuai spesifikasi resmi Telegram:
 * 1. Parse string query: 'auth_date=...&hash=...&user=...'
 * 2. Pisahkan parameter 'hash'.
 * 3. Urutkan parameter sisa secara alfabetis (k=v) dipisahkan '\n'.
 * 4. Secret key = HMAC_SHA256("WebAppData", bot_token).
 * 5. Hash pembanding = hex(HMAC_SHA256(secret_key, data_check_string)).
 * 6. Bandingkan secara timing-safe dengan hash yang dikirim.
 */
export function validateTelegramInitData(
  initDataRaw: string,
  botToken: string = config.botToken || ''
): { valid: boolean; data?: ValidatedInitData; error?: string } {
  if (!initDataRaw || typeof initDataRaw !== 'string') {
    return { valid: false, error: 'Header initData kosong atau tidak valid' };
  }

  // Khusus dev mode jika diizinkan untuk debugging lokal
  if (process.env.NODE_ENV !== 'production' && initDataRaw.startsWith('dev_user_')) {
    const devId = Number(initDataRaw.replace('dev_user_', '')) || Number(config.ownerId) || 12345678;
    return {
      valid: true,
      data: {
        user: {
          id: devId,
          first_name: 'Developer (Dev Mode)',
          username: 'dev_user',
          is_premium: true,
        },
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'dev_mode_mock_hash',
        raw: {},
      },
    };
  }

  try {
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { valid: false, error: 'Parameter hash tidak ditemukan pada initData' };
    }

    // Ekstrak semua field selain hash
    const pairs: string[] = [];
    const rawObj: Record<string, string> = {};

    urlParams.forEach((val, key) => {
      if (key !== 'hash') {
        pairs.push(`${key}=${val}`);
        rawObj[key] = val;
      }
    });

    // Urutkan alfabetis
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    // 1. Secret key: HMAC-SHA256 dengan key "WebAppData" dan message bot_token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // 2. Hash yang dihitung dari data_check_string
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // 3. Timing-safe comparison
    const calculatedBuf = Buffer.from(calculatedHash, 'hex');
    const receivedBuf = Buffer.from(hash, 'hex');

    if (calculatedBuf.length !== receivedBuf.length) {
      return { valid: false, error: 'Panjang hash tidak cocok' };
    }

    const isValid = crypto.timingSafeEqual(calculatedBuf, receivedBuf);

    if (!isValid) {
      return { valid: false, error: 'Tanda tangan hash HMAC-SHA256 tidak cocok' };
    }

    // 4. Validasi auth_date (maks 24 jam = 86400 detik)
    const authDate = Number(urlParams.get('auth_date')) || 0;
    const now = Math.floor(Date.now() / 1000);
    const maxAgeSec = 86400; // 24 jam

    if (now - authDate > maxAgeSec) {
      return { valid: false, error: 'Sesi initData telah kadaluwarsa (> 24 jam)' };
    }

    // 5. Parse user object
    const userJson = urlParams.get('user');
    if (!userJson) {
      return { valid: false, error: 'Objek user tidak ditemukan dalam initData' };
    }

    const user: TelegramUser = JSON.parse(userJson);

    return {
      valid: true,
      data: {
        query_id: urlParams.get('query_id') || undefined,
        user,
        auth_date: authDate,
        hash,
        raw: rawObj,
      },
    };
  } catch (err) {
    return { valid: false, error: `Gagal memvalidasi initData: ${err instanceof Error ? err.message : String(err)}` };
  }
}
