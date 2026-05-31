import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../database.json');

/**
 * ⚡ IN-MEMORY CACHE LAYER FOR DELTAUBOTJS
 */
const dbCache = new Map();

// --- MongoDB Config ---
const MONGO_URI = process.env.MONGO_URI;
let isMongo = false;

// Define Mongoose Schema
const UserbotSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true, unique: true },
  phone: { type: String, default: null },
  session_string: { type: String, required: true },
  is_active: { type: Number, default: 1 },
  auto_read: { type: Number, default: 0 },
  auto_reply: { type: Number, default: 0 },
  anti_pm: { type: Number, default: 0 },
  afk_reason: { type: String, default: 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.' },
  expired_at: { type: String, required: true },
  created_at: { type: String, required: true }
});

const UserbotModel = mongoose.models.Userbot || mongoose.model('Userbot', UserbotSchema);

// Helper untuk membaca file JSON database secara fisik (Local Fallback)
function readDbFromFile() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify({ userbots: {} }, null, 2));
      return { userbots: {} };
    }
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data || '{"userbots":{}}');
  } catch (err) {
    console.error('❌ Error reading database file:', err);
    return { userbots: {} };
  }
}

// Helper untuk menulis ke file JSON database secara fisik (Local Fallback)
function writeDbToFile(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Error writing database file:', err);
    return false;
  }
}

// Inisialisasi Cache saat pertama kali file dimuat
async function initDatabaseAndCache() {
  dbCache.clear();

  if (MONGO_URI && MONGO_URI !== 'YOUR_MONGO_URI') {
    try {
      console.log(`🔌 Connecting to MongoDB Cluster...`);
      // Connection timeout set to 5000ms so it doesn't hang indefinitely if connection fails
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000
      });
      isMongo = true;
      console.log(`✅ Connected successfully to MongoDB: "${mongoose.connection.name}"`);

      // Load all records from MongoDB into dbCache Map
      const bots = await UserbotModel.find({});
      for (const bot of bots) {
        dbCache.set(bot.telegram_id, {
          telegram_id: bot.telegram_id,
          phone: bot.phone,
          session_string: bot.session_string,
          is_active: bot.is_active,
          auto_read: bot.auto_read,
          auto_reply: bot.auto_reply,
          anti_pm: bot.anti_pm,
          afk_reason: bot.afk_reason,
          expired_at: bot.expired_at,
          created_at: bot.created_at
        });
      }
      console.log(`📦 Loaded ${dbCache.size} userbot sessions from MongoDB.`);
      return;
    } catch (err) {
      console.error('❌ Failed to connect to MongoDB. Falling back to local JSON database...', err.message);
      isMongo = false;
    }
  }

  // Fallback to JSON File Database
  const data = readDbFromFile();
  for (const [id, bot] of Object.entries(data.userbots)) {
    const createdAt = bot.created_at || new Date().toISOString();
    const defaultExp = new Date(createdAt);
    defaultExp.setDate(defaultExp.getDate() + 30);

    const botData = {
      telegram_id: Number(id),
      phone: bot.phone || null,
      session_string: bot.session_string,
      is_active: bot.is_active !== undefined ? bot.is_active : 1,
      auto_read: bot.auto_read !== undefined ? bot.auto_read : 0,
      auto_reply: bot.auto_reply !== undefined ? bot.auto_reply : 0,
      anti_pm: bot.anti_pm !== undefined ? bot.anti_pm : 0,
      afk_reason: bot.afk_reason || 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.',
      expired_at: bot.expired_at || defaultExp.toISOString(),
      created_at: createdAt
    };
    dbCache.set(Number(id), botData);
  }
  
  console.log(`📦 DeltaUbotJS Local JSON Database initialized.`);
  console.log(`⚡ In-memory cache loaded with ${dbCache.size} userbot sessions.`);
}

// Inisialisasi dijalankan saat import
await initDatabaseAndCache();

/**
 * Save or update a userbot session
 * @param {number} telegramId 
 * @param {string|null} phone 
 * @param {string} sessionString 
 */
export function saveUserbotSession(telegramId, phone, sessionString) {
  const idNum = Number(telegramId);
  const existing = dbCache.get(idNum) || {};

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 30);

  const botData = {
    telegram_id: idNum,
    phone: phone || null,
    session_string: sessionString,
    is_active: 1,
    auto_read: existing.auto_read !== undefined ? existing.auto_read : 0,
    auto_reply: existing.auto_reply !== undefined ? existing.auto_reply : 0,
    anti_pm: existing.anti_pm !== undefined ? existing.anti_pm : 0,
    afk_reason: existing.afk_reason || 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.',
    expired_at: existing.expired_at || expDate.toISOString(),
    created_at: existing.created_at || new Date().toISOString()
  };

  // 1. Update Cache
  dbCache.set(idNum, botData);

  // 2. Sync to DB
  if (isMongo) {
    UserbotModel.findOneAndUpdate(
      { telegram_id: idNum },
      botData,
      { upsert: true, new: true }
    ).catch(err => console.error('❌ MongoDB save error:', err));
    return true;
  } else {
    const data = readDbFromFile();
    data.userbots[idNum] = botData;
    return writeDbToFile(data);
  }
}

/**
 * Get a specific userbot session by Telegram ID
 * @param {number} telegramId 
 * @returns {object|undefined}
 */
export function getUserbotSession(telegramId) {
  const idNum = Number(telegramId);
  return dbCache.get(idNum);
}

/**
 * Get all active userbots to restart them
 * @returns {Array<object>}
 */
export function getAllActiveUserbots() {
  return Array.from(dbCache.values()).filter(bot => bot.is_active === 1);
}

/**
 * Get all registered users (active or inactive)
 * @returns {Array<object>}
 */
export function getAllRegisteredUsers() {
  return Array.from(dbCache.values());
}

/**
 * Enable or disable a userbot
 * @param {number} telegramId 
 * @param {boolean} isActive 
 */
export function updateUserbotStatus(telegramId, isActive) {
  const idNum = Number(telegramId);
  const statusVal = isActive ? 1 : 0;

  // Update Cache
  const cachedBot = dbCache.get(idNum);
  if (cachedBot) {
    cachedBot.is_active = statusVal;
  }

  // Sync to DB
  if (isMongo) {
    UserbotModel.findOneAndUpdate(
      { telegram_id: idNum },
      { is_active: statusVal }
    ).catch(err => console.error('❌ MongoDB status update error:', err));
    return true;
  } else {
    const data = readDbFromFile();
    if (data.userbots[idNum]) {
      data.userbots[idNum].is_active = statusVal;
      return writeDbToFile(data);
    }
    return false;
  }
}

/**
 * Update userbot specific feature setting (auto_read, auto_reply, anti_pm, afk_reason, expired_at)
 * @param {number} telegramId 
 * @param {string} featureName 
 * @param {any} value 
 */
export function updateUserbotFeature(telegramId, featureName, value) {
  const idNum = Number(telegramId);

  // Update Cache
  const cachedBot = dbCache.get(idNum);
  if (cachedBot) {
    cachedBot[featureName] = value;
  }

  // Sync to DB
  if (isMongo) {
    UserbotModel.findOneAndUpdate(
      { telegram_id: idNum },
      { [featureName]: value }
    ).catch(err => console.error(`❌ MongoDB feature update error (${featureName}):`, err));
    return true;
  } else {
    const data = readDbFromFile();
    if (data.userbots[idNum]) {
      data.userbots[idNum][featureName] = value;
      return writeDbToFile(data);
    }
    return false;
  }
}

/**
 * Delete a userbot session entirely
 * @param {number} telegramId 
 */
export function deleteUserbot(telegramId) {
  const idNum = Number(telegramId);

  // Remove from Cache
  dbCache.delete(idNum);

  // Sync to DB
  if (isMongo) {
    UserbotModel.deleteOne({ telegram_id: idNum })
      .catch(err => console.error('❌ MongoDB delete error:', err));
    return true;
  } else {
    const data = readDbFromFile();
    if (data.userbots[idNum]) {
      delete data.userbots[idNum];
      return writeDbToFile(data);
    }
    return false;
  }
}
