import dotenv from 'dotenv';

// Load .env file
dotenv.config();

/**
 * TELEGRAM API ID & API HASH (Hardcoded dari proyek Python Anda)
 */
const HARDCODED_API_ID = 2496; // <-- API ID tepat sesuai potongan kode Python Anda
const HARDCODED_API_HASH = '8da85b0d5bfe62527e5b244c209159c3'; // <-- API Hash dari potongan kode Python Anda

/**
 * TELEGRAM OWNER ID (Hardcoded)
 * Masukkan ID Telegram Anda (tipe: Angka/Number) agar Anda mendapatkan akses
 * eksklusif ke Panel Admin (Broadcast, Restart Semua Ubot, dll.).
 * Dapatkan ID Anda lewat bot @MissRose_bot atau @userinfobot di Telegram.
 */
const HARDCODED_OWNER_ID = 1025855210; // <-- GANTI DENGAN ID TELEGRAM ANDA (Contoh: 12345678)

/**
 * TELEGRAM LOG GROUP & TOPIC ID (Opsional)
 * Jika diisi, semua log permintaan registrasi akan dikirim ke Grup/Topic ini,
 * alih-alih ke PM Owner. (Pastikan Master Bot sudah dimasukkan ke grup)
 */
const HARDCODED_LOG_GROUP_ID = 1025855210; // <-- Ganti dengan ID Grup, contoh: -1001234567890
const HARDCODED_LOG_TOPIC_ID = 112781; // <-- Ganti dengan ID Topic, contoh: 2

const config = {
  botToken: process.env.BOT_TOKEN,
  apiId: HARDCODED_API_ID,
  apiHash: HARDCODED_API_HASH,
  ownerId: HARDCODED_OWNER_ID,
  logGroupId: HARDCODED_LOG_GROUP_ID,
  logTopicId: HARDCODED_LOG_TOPIC_ID,
};

// Check if credentials are set
if (!config.botToken || config.botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
  console.warn('⚠️ WARNING: BOT_TOKEN is not set or using default value in .env');
}

if (config.ownerId === 0) {
  console.warn('⚠️ WARNING: Mohon sesuaikan HARDCODED_OWNER_ID di src/config.js dengan ID Telegram Anda untuk mengakses Panel Admin.');
}

export default config;
