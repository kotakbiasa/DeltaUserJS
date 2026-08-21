import dotenv from 'dotenv';

dotenv.config();

/**
 * Konfigurasi Utama
 * Semua nilai diambil dari file .env
 */
const config = {
  botToken: process.env.BOT_TOKEN,
  apiId: process.env.API_ID ? parseInt(process.env.API_ID) : 2496,
  apiHash: process.env.API_HASH || "8da85b0d5bfe62527e5b244c209159c3",
  ownerId: process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : undefined,
  logGroupId: process.env.LOG_GROUP_ID ? parseInt(process.env.LOG_GROUP_ID) : 0,
  logTopicId: process.env.LOG_TOPIC_ID ? parseInt(process.env.LOG_TOPIC_ID) : 0,
  mongoUri: process.env.MONGO_URI,
  dbName: 'DeltaUbotJS',
  muslimSalatApiKey: process.env.MUSLIM_SALAT_API_KEY || undefined,
};

// Check if credentials are set
if (!config.botToken || config.botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
  console.error('⛔ FATAL: BOT_TOKEN harus diset di file .env. Tidak boleh pakai default!');
  process.exit(1);
}

// Validate required Telegram API credentials
if (!config.apiId || !config.apiHash) {
  console.error('⛔ FATAL: API_ID dan API_HASH harus diset di file .env.');
  console.error('⛔ Daftar di https://my.telegram.org untuk mendapatkan credentials.');
  process.exit(1);
}

// Validate owner ID
if (!config.ownerId || config.ownerId === 0) {
  console.error('⛔ FATAL: OWNER_ID harus diset di .env. Fitur admin/owner akan dinonaktifkan.');
  console.error('⛔ Setel OWNER_ID ke ID Telegram Anda agar bisa menggunakan panel admin.');
  // Don't exit — let the bot run without admin features
}

export default config;
