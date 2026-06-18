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

import config from '../config.js';

// --- MongoDB Config ---
const MONGO_URI = config.mongoUri || process.env.MONGO_URI;
const DB_NAME = config.dbName || process.env.DB_NAME || 'DeltaUbotJS';
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
  created_at: { type: String, required: true },
  inline_bot_token: { type: String, default: null },
  inline_bot_username: { type: String, default: null },
  custom_name: { type: String, default: 'DeltaUbotJS' },
  approved_users: { type: [Number], default: [] },
  broadcast_blacklist: { type: [String], default: [] },
  disabled_plugins: { type: [String], default: [] },
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  lock_config: { type: mongoose.Schema.Types.Mixed, default: {} },
  schedules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chat_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  reputation_data: { type: mongoose.Schema.Types.Mixed, default: {} }
});

export const UserbotModel = mongoose.models.Userbot || mongoose.model('Userbot', UserbotSchema);

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
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 15000
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
          created_at: bot.created_at,
          inline_bot_token: bot.inline_bot_token,
          inline_bot_username: bot.inline_bot_username,
          custom_name: bot.custom_name,
          approved_users: Array.from(bot.approved_users || []),
          broadcast_blacklist: Array.from(bot.broadcast_blacklist || []),
          disabled_plugins: Array.from(bot.disabled_plugins || []),
          warn_data: bot.warn_data || {},
          lock_config: bot.lock_config || {},
          schedules: Array.from(bot.schedules || []),
          chat_settings: bot.chat_settings || {},
          reputation_data: bot.reputation_data || {}
        });
      }
      console.log(`📦 Loaded ${dbCache.size} userbot sessions from MongoDB.`);
      return;
    } catch (err) {
      console.error('❌ Failed to connect to MongoDB:', err.message);
      console.error('🛑 MONGO_URI is configured, so DeltaUbotJS will stop instead of falling back to empty local JSON database.');
      throw err;
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
      created_at: createdAt,
      inline_bot_token: bot.inline_bot_token || null,
      inline_bot_username: bot.inline_bot_username || null,
      custom_name: bot.custom_name || 'DeltaUbotJS',
      approved_users: bot.approved_users || [],
      broadcast_blacklist: bot.broadcast_blacklist || [],
      disabled_plugins: bot.disabled_plugins || [],
      warn_data: bot.warn_data || {},
      lock_config: bot.lock_config || {},
      schedules: bot.schedules || [],
      chat_settings: bot.chat_settings || {},
      reputation_data: bot.reputation_data || {}
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
    created_at: existing.created_at || new Date().toISOString(),
    inline_bot_token: existing.inline_bot_token || null,
    inline_bot_username: existing.inline_bot_username || null,
    custom_name: existing.custom_name || 'DeltaUbotJS',
    approved_users: existing.approved_users || [],
    broadcast_blacklist: existing.broadcast_blacklist || [],
    disabled_plugins: existing.disabled_plugins || [],
    warn_data: existing.warn_data || {},
    lock_config: existing.lock_config || {},
    schedules: existing.schedules || [],
    chat_settings: existing.chat_settings || {},
    reputation_data: existing.reputation_data || {}
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

// --- Approved Users Helpers ---
export async function addApprovedUser(telegramId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.approved_users) {
    session.approved_users = [];
  }

  if (!session.approved_users.includes(targetUserId)) {
    session.approved_users.push(targetUserId);
    dbCache.set(idNum, session);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { $push: { approved_users: targetUserId } });
      } catch (e) {
        console.error('Error adding approved user to Mongo:', e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum].approved_users = session.approved_users;
        writeDbToFile(data);
      }
    }
  }
  return true;
}

export async function removeApprovedUser(telegramId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.approved_users) return true;

  const index = session.approved_users.indexOf(targetUserId);
  if (index > -1) {
    session.approved_users.splice(index, 1);
    dbCache.set(idNum, session);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { $pull: { approved_users: targetUserId } });
      } catch (e) {
        console.error('Error removing approved user from Mongo:', e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum].approved_users = session.approved_users;
        writeDbToFile(data);
      }
    }
  }
  return true;
}

export function getApprovedUsers(telegramId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return [];
  return session.approved_users || [];
}

// --- Broadcast Blacklist Helpers ---
export async function addBroadcastBlacklist(telegramId, chatId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.broadcast_blacklist) {
    session.broadcast_blacklist = [];
  }

  const chatStr = String(chatId);
  if (!session.broadcast_blacklist.includes(chatStr)) {
    session.broadcast_blacklist.push(chatStr);
    dbCache.set(idNum, session);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { $push: { broadcast_blacklist: chatStr } });
      } catch (e) {
        console.error('Error adding to broadcast_blacklist in Mongo:', e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum].broadcast_blacklist = session.broadcast_blacklist;
        writeDbToFile(data);
      }
    }
  }
  return true;
}

export async function removeBroadcastBlacklist(telegramId, chatId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.broadcast_blacklist) return true;

  const chatStr = String(chatId);
  const index = session.broadcast_blacklist.indexOf(chatStr);
  if (index > -1) {
    session.broadcast_blacklist.splice(index, 1);
    dbCache.set(idNum, session);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { $pull: { broadcast_blacklist: chatStr } });
      } catch (e) {
        console.error('Error removing from broadcast_blacklist in Mongo:', e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum].broadcast_blacklist = session.broadcast_blacklist;
        writeDbToFile(data);
      }
    }
  }
  return true;
}

export function getBroadcastBlacklist(telegramId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return [];
  return session.broadcast_blacklist || [];
}

// --- Plugin Toggle Helpers ---
export async function disablePlugin(telegramId, pluginName) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  const name = String(pluginName || '').toLowerCase();
  if (!session.disabled_plugins) session.disabled_plugins = [];

  if (!session.disabled_plugins.includes(name)) {
    session.disabled_plugins.push(name);
    dbCache.set(idNum, session);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { $addToSet: { disabled_plugins: name } });
      } catch (e) {
        console.error('Error disabling plugin in Mongo:', e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum].disabled_plugins = session.disabled_plugins;
        writeDbToFile(data);
      }
    }
  }
  return true;
}

export async function enablePlugin(telegramId, pluginName) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  const name = String(pluginName || '').toLowerCase();
  if (!session.disabled_plugins) return true;

  const index = session.disabled_plugins.indexOf(name);
  if (index > -1) {
    session.disabled_plugins.splice(index, 1);
    dbCache.set(idNum, session);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { $pull: { disabled_plugins: name } });
      } catch (e) {
        console.error('Error enabling plugin in Mongo:', e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum].disabled_plugins = session.disabled_plugins;
        writeDbToFile(data);
      }
    }
  }
  return true;
}

export function getDisabledPlugins(telegramId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  return session?.disabled_plugins || [];
}

// --- Warn System Helpers ---
async function persistNestedFeature(telegramId, featureName, value) {
  const idNum = Number(telegramId);

  if (isMongo) {
    try {
      await UserbotModel.updateOne({ telegram_id: idNum }, { [featureName]: value });
    } catch (e) {
      console.error(`Error persisting ${featureName} to Mongo:`, e.message);
    }
  } else {
    const data = readDbFromFile();
    if (data.userbots[idNum]) {
      data.userbots[idNum][featureName] = value;
      writeDbToFile(data);
    }
  }
}

export async function addWarn(telegramId, chatId, targetUserId, reason = 'Tidak ada alasan') {
  const session = dbCache.get(Number(telegramId));
  if (!session) return null;

  const chatKey = String(chatId);
  const userKey = String(targetUserId);
  if (!session.warn_data) session.warn_data = {};
  if (!session.warn_data[chatKey]) session.warn_data[chatKey] = {};

  const current = session.warn_data[chatKey][userKey] || { count: 0, reasons: [] };
  current.count = Number(current.count || 0) + 1;
  current.reasons = Array.isArray(current.reasons) ? current.reasons : [];
  current.reasons.push({ reason, at: new Date().toISOString() });
  current.reasons = current.reasons.slice(-10);
  current.lastWarnedAt = new Date().toISOString();

  session.warn_data[chatKey][userKey] = current;
  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'warn_data', session.warn_data);
  return current;
}

export async function removeWarn(telegramId, chatId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session?.warn_data) return null;

  const chatKey = String(chatId);
  const userKey = String(targetUserId);
  const current = session.warn_data[chatKey]?.[userKey];
  if (!current) return null;

  current.count = Math.max(0, Number(current.count || 0) - 1);
  current.lastWarnedAt = new Date().toISOString();
  if (current.count === 0) {
    delete session.warn_data[chatKey][userKey];
  } else {
    session.warn_data[chatKey][userKey] = current;
  }

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'warn_data', session.warn_data);
  return current.count === 0 ? null : current;
}

export async function resetWarns(telegramId, chatId, targetUserId = null) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  const chatKey = String(chatId);
  if (!session.warn_data) session.warn_data = {};

  if (targetUserId === null || targetUserId === undefined) {
    delete session.warn_data[chatKey];
  } else if (session.warn_data[chatKey]) {
    delete session.warn_data[chatKey][String(targetUserId)];
  }

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'warn_data', session.warn_data);
  return true;
}

export function getWarns(telegramId, chatId, targetUserId = null) {
  const session = dbCache.get(Number(telegramId));
  const chatWarns = session?.warn_data?.[String(chatId)] || {};
  if (targetUserId === null || targetUserId === undefined) return chatWarns;
  return chatWarns[String(targetUserId)] || { count: 0, reasons: [] };
}

// --- Lock System Helpers ---
export async function setChatLock(telegramId, chatId, lockType, enabled) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return null;

  const chatKey = String(chatId);
  if (!session.lock_config) session.lock_config = {};
  if (!session.lock_config[chatKey]) session.lock_config[chatKey] = {};

  session.lock_config[chatKey][lockType] = enabled ? 1 : 0;
  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'lock_config', session.lock_config);
  return session.lock_config[chatKey];
}

export function getChatLocks(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  return session?.lock_config?.[String(chatId)] || {};
}

// --- Schedule Helpers ---
export async function saveSchedule(telegramId, chatKey, type, value, message) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.schedules) {
    session.schedules = [];
  }

  const updatedAt = new Date().toISOString();
  const existingIndex = session.schedules.findIndex(
    s => s.chatKey === String(chatKey) && s.type === String(type)
  );

  const scheduleObj = {
    chatKey: String(chatKey),
    type: String(type),
    value,
    message,
    updatedAt
  };

  if (existingIndex > -1) {
    session.schedules[existingIndex] = scheduleObj;
  } else {
    session.schedules.push(scheduleObj);
  }

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'schedules', session.schedules);
  return true;
}

export function getSchedules(telegramId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return [];
  return session.schedules || [];
}

export async function deleteSchedule(telegramId, chatKey, type) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.schedules) {
    session.schedules = [];
    return true;
  }

  session.schedules = session.schedules.filter(
    s => !(s.chatKey === String(chatKey) && s.type === String(type))
  );

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'schedules', session.schedules);
  return true;
}

// --- Chat Settings Helpers ---
export function getChatSettings(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return {};
  const chatSettings = session.chat_settings || {};
  return chatSettings[String(chatId)] || {};
}

export async function updateChatSettings(telegramId, chatId, key, value) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.chat_settings) {
    session.chat_settings = {};
  }

  const chatKey = String(chatId);
  if (!session.chat_settings[chatKey]) {
    session.chat_settings[chatKey] = {};
  }

  session.chat_settings[chatKey][key] = value;
  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'chat_settings', session.chat_settings);
  return session.chat_settings[chatKey];
}

// --- Reputation Helpers ---
export function getReputation(telegramId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return 0;
  const reputationData = session.reputation_data || {};
  const score = reputationData[String(targetUserId)];
  return score !== undefined ? score : 0;
}

export async function updateReputation(telegramId, targetUserId, points) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return null;

  if (!session.reputation_data) {
    session.reputation_data = {};
  }

  const userKey = String(targetUserId);
  session.reputation_data[userKey] = Number(points);
  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'reputation_data', session.reputation_data);
  return Number(points);
}
