import dotenv from 'dotenv';
// Load .env file
dotenv.config();
/**
 * Konfigurasi Utama
 * Semua nilai diambil dari file .env
 */
const config = {
    botToken: process.env.BOT_TOKEN,
    apiId: process.env.API_ID ? parseInt(process.env.API_ID) : 2496,
    apiHash: process.env.API_HASH || '8da85b0d5bfe62527e5b244c209159c3',
    ownerId: process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : 0,
    logGroupId: process.env.LOG_GROUP_ID ? parseInt(process.env.LOG_GROUP_ID) : 0,
    logTopicId: process.env.LOG_TOPIC_ID ? parseInt(process.env.LOG_TOPIC_ID) : 0,
    mongoUri: process.env.MONGO_URI,
    dbName: 'DeltaUbotJS',
};
// Check if credentials are set
if (!config.botToken || config.botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.warn('⚠️ WARNING: BOT_TOKEN is not set or using default value in .env');
}
if (!config.ownerId || config.ownerId === 0) {
    console.warn('⚠️ WARNING: Mohon setel variabel OWNER_ID di file .env dengan ID Telegram Anda untuk mengakses Panel Admin.');
}
export default config;
