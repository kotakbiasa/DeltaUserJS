import fs from 'fs';
import path from 'path';
import { fileURLToPath }
 from 'url';
import mongoose from 'mongoose';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../database.json');

/**
 * ⚡ DELTAUBOTJS DATABASE LAYER
 *
 * Sumber kebenaran utama adalah in-memory cache (`dbCache`). Setiap mutasi:
 *   1. Memperbarui cache secara sinkron (read-after-write langsung konsisten).
 *   2. Mem-persist perubahan ke MongoDB (atau file JSON fallback) secara async.
 *
 * Semua fungsi mutasi mengembalikan Promise<boolean> yang merefleksikan
 * status penulisan sebenarnya — `await` jika butuh kepastian tersimpan.
 */

// --- Konstanta default (single source of truth) ---
const DEFAULT_AFK_REASON = 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.';
const DEFAULT_CUSTOM_NAME = 'DeltaUbotJS';
const SUBSCRIPTION_DAYS = 7;

// --- MongoDB Config ---
const MONGO_URI = config.mongoUri || process.env.MONGO_URI;
const DB_NAME = config.dbName || process.env.DB_NAME || 'DeltaUbotJS';

const dbCache = new Map();
let isMongo = false;

// --- Mongoose Schema ---
const UserbotSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true, unique: true },
  phone: { type: String, default: null },
  session_string: { type: String, required: true },
  is_active: { type: Number, default: 1 },
  auto_read: { type: Number, default: 0 },
  auto_reply: { type: Number, default: 0 },
  anti_pm: { type: Number, default: 0 },
  afk_reason: { type: String, default: DEFAULT_AFK_REASON },
  expired_at: { type: String, required: true },
  created_at: { type: String, required: true },
  inline_bot_token: { type: String, default: null },
  inline_bot_username: { type: String, default: null },
  custom_name: { type: String, default: DEFAULT_CUSTOM_NAME },
  approved_users: { type: [Number], default: [] },
  broadcast_blacklist: { type: [String], default: [] },
  disabled_plugins: { type: [String], default: [] },
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  lock_config: { type: mongoose.Schema.Types.Mixed, default: {} },
  schedules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chat_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  reputation_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  vars: { type: mongoose.Schema.Types.Mixed, default: {} }
}
);

export const UserbotModel = mongoose.models.Userbot || mongoose.model('Userbot', UserbotSchema);

const SystemConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'system' },
  vars: { type: mongoose.Schema.Types.Mixed, default: {} }
}
);
export const SystemConfigModel = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);

let systemConfigCache = { vars: {} };

const GroupConfigSchema = new mongoose.Schema({
  chat_id: { type: String, required: true, unique: true },
  welcome_enabled: { type: Number, default: 0 },
  welcome_text: { type: String, default: 'Halo {first_name}, selamat datang di {chat_title}!' },
  goodbye_text: { type: String, default: 'Selamat jalan {first_name}.' },
  anti_link: { type: Number, default: 0 },
  anti_spam: { type: Number, default: 0 },
  captcha_enabled: { type: Number, default: 0 },
  locks: { type: mongoose.Schema.Types.Mixed, default: {} },
  linked_fed: { type: String, default: null },
  rules_text: { type: String, default: 'Belum ada aturan grup yang ditetapkan.' },
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes: { type: mongoose.Schema.Types.Mixed, default: {} }
}
);
export const GroupConfigModel = mongoose.models.GroupConfig || mongoose.model('GroupConfig', GroupConfigSchema);

const FederationSchema = new mongoose.Schema({
  fed_id: { type: String, required: true, unique: true },
  fed_name: { type: String, required: true },
  owner_id: { type: Number, required: true },
  admins: { type: [Number], default: [] },
  banned_users: { type: mongoose.Schema.Types.Mixed, default: {} },
  linked_groups: { type: [String], default: [] }
});
export const FederationModel = mongoose.models.Federation || mongoose.model('Federation', FederationSchema);

const fedCache = new Map();


const groupConfigCache = new Map();

// --- Helpers umum ---
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;}


/**
 * Normalisasi record mentah (dari Mongo / file / parsial) menjadi objek userbot
 * lengkap dengan semua field & nilai default. Menghilangkan duplikasi default
 * yang sebelumnya tersebar di 3 tempat.
 */
function normalizeBot(raw = {}, id) {
  const idNum = Number(id ?? raw.telegram_id);
  const createdAt = raw.created_at || new Date().toISOString();
  const pick = (key, fallback) => (raw[key] !== undefined && raw[key] !== null ? raw[key] : fallback);

  return {
    telegram_id: idNum,
    phone: raw.phone || null,
    session_string: raw.session_string,
    is_active: pick('is_active', 1),
    auto_read: pick('auto_read', 0),
    auto_reply: pick('auto_reply', 0),
    anti_pm: pick('anti_pm', 0),
    afk_reason: raw.afk_reason || DEFAULT_AFK_REASON,
    expired_at: raw.expired_at || addDays(createdAt, SUBSCRIPTION_DAYS).toISOString(),
    created_at: createdAt,
    inline_bot_token: raw.inline_bot_token || null,
    inline_bot_username: raw.inline_bot_username || null,
    custom_name: raw.custom_name || DEFAULT_CUSTOM_NAME,
    approved_users: Array.from(raw.approved_users || []),
    broadcast_blacklist: Array.from(raw.broadcast_blacklist || []),
    disabled_plugins: Array.from(raw.disabled_plugins || []),
    warn_data: raw.warn_data || {},
    lock_config: raw.lock_config || {},
    schedules: Array.from(raw.schedules || []),
    chat_settings: raw.chat_settings || {},
    reputation_data: raw.reputation_data || {},
    vars: raw.vars || {}

  };}


// --- File JSON fallback I/O ---
function readDbFromFile() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify({ userbots: {}, systemConfig: { vars: {} }, groups: {} }, null, 2));
      return { userbots: {}, systemConfig: { vars: {} }, groups: {} };
    }

    const data = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(data || '{"userbots":{}, "systemConfig": {"vars": {}}, "groups": {}}');
    if (!parsed.systemConfig) parsed.systemConfig = { vars: {} };
    if (!parsed.groups) parsed.groups = {};
    return parsed;
  } catch (err) {
    console.error('❌ Error reading database file:', err);
    return { userbots: {}, systemConfig: { vars: {} }, groups: {} };
  }
}


function writeDbToFile(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Error writing database file:', err);
    return false;
  }
}


/**
 * ⚙️ Persistence primitives — satu-satunya tempat yang menyentuh Mongo / file.
 * Semua await (tidak lagi fire-and-forget) dan mengembalikan status sebenarnya.
 */
async function persistField(idNum, field, value) {
  if (isMongo) {
    try {
      await UserbotModel.updateOne({ telegram_id: idNum }, { [field]: value }
);
      return true;
    } catch (err) {
      console.error(`❌ MongoDB update error (${field}
):`, err.message);
      return false;
    }

  }

  const data = readDbFromFile();
  if (!data.userbots[idNum]) return false;
  data.userbots[idNum][field] = value;
  return writeDbToFile(data);}


async function persistDoc(idNum, doc) {
  if (isMongo) {
    try {
      await UserbotModel.findOneAndUpdate(
        { telegram_id: idNum },
        doc,
        { upsert: true, returnDocument: 'after' }

      );
      return true;
    } catch (err) {
      console.error('❌ MongoDB save error:', err.message);
      return false;
    }

  }

  const data = readDbFromFile();
  data.userbots[idNum] = doc;
  return writeDbToFile(data);}


async function persistDelete(idNum) {
  if (isMongo) {
    try {
      await UserbotModel.deleteOne({ telegram_id: idNum }
);
      return true;
    } catch (err) {
      console.error('❌ MongoDB delete error:', err.message);
      return false;
    }

  }

  const data = readDbFromFile();
  if (!data.userbots[idNum]) return false;
  delete data.userbots[idNum];
  return writeDbToFile(data);}


// --- Inisialisasi (dipanggil via top-level await saat modul dimuat) ---
async function initDatabaseAndCache() {
  dbCache.clear();

  if (MONGO_URI && MONGO_URI !== 'YOUR_MONGO_URI') {
    try {
      console.log('🔌 Connecting to MongoDB Cluster...');
      await mongoose.connect(MONGO_URI, {
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 15000
      }
);
      isMongo = true;
      console.log(`✅ Connected successfully to MongoDB: "${mongoose.connection.name}
"`);

      const bots = await UserbotModel.find({}
);
      for (const bot of bots) {
        dbCache.set(bot.telegram_id, normalizeBot(bot.toObject(), bot.telegram_id));
      }

      
      const sysConf = await SystemConfigModel.findById('system');
      if (sysConf) systemConfigCache = sysConf.toObject();

      const groups = await GroupConfigModel.find({}
);
      for (const group of groups) {
        groupConfigCache.set(group.chat_id, group.toObject());
      }


      console.log(`📦 Loaded ${dbCache.size}
 userbot sessions from MongoDB.`);
      return;
    } catch (err) {
      console.error('❌ Failed to connect to MongoDB:', err.message);
      console.error('🛑 MONGO_URI is configured, so DeltaUbotJS will stop instead of falling back to empty local JSON database.');
      throw err;
    }

  }


  // Fallback ke file JSON lokal
  const data = readDbFromFile();
  for (const [id, bot] of Object.entries(data.userbots)) {
    dbCache.set(Number(id), normalizeBot(bot, id));
  }

  systemConfigCache = data.systemConfig || { vars: {} };

  if (data.groups) {
    for (const [chatId, groupData] of Object.entries(data.groups)) {
      groupConfigCache.set(chatId, groupData);
    }

  }


  console.log('📦 DeltaUbotJS Local JSON Database initialized.');
  console.log(`⚡ In-memory cache loaded with ${dbCache.size}
 userbot sessions.`);}


await initDatabaseAndCache();
await loadFederations();

// ==========================================================================
// CORE SESSION API
// ==========================================================================

/**
 * Simpan/perbarui sesi userbot.
 * @returns {Promise<boolean>}

 */
export async function saveUserbotSession(telegramId, phone, sessionString) {
  const idNum = Number(telegramId);
  const existing = dbCache.get(idNum) || {};

  const botData = normalizeBot({
    ...existing,
    telegram_id: idNum,
    phone: phone || null,
    session_string: sessionString,
    is_active: 1
  }, idNum);

  dbCache.set(idNum, botData);
  return persistDoc(idNum, botData);}


export function getUserbotSession(telegramId) {
  return dbCache.get(Number(telegramId));}


export function getAllActiveUserbots() {
  return Array.from(dbCache.values()).filter(bot => bot.is_active === 1);}


export function getAllRegisteredUsers() {
  return Array.from(dbCache.values());}


/**
 * Aktifkan / nonaktifkan userbot.
 * @returns {Promise<boolean>}

 */
export async function updateUserbotStatus(telegramId, isActive) {
  const idNum = Number(telegramId);
  const statusVal = isActive ? 1 : 0;

  const cached = dbCache.get(idNum);
  if (cached) cached.is_active = statusVal;

  return persistField(idNum, 'is_active', statusVal);}


/**
 * Perbarui satu fitur userbot (auto_read, auto_reply, anti_pm, afk_reason, dll).
 * @returns {Promise<boolean>}

 */
export async function updateUserbotFeature(telegramId, featureName, value) {
  const idNum = Number(telegramId);

  const cached = dbCache.get(idNum);
  if (cached) cached[featureName] = value;

  return persistField(idNum, featureName, value);}


/**
 * Hapus sesi userbot sepenuhnya.
 * @returns {Promise<boolean>}

 */
export async function deleteUserbot(telegramId) {
  const idNum = Number(telegramId);
  dbCache.delete(idNum);
  return persistDelete(idNum);}


// ==========================================================================
// LIST FIELD HELPERS (approved users, broadcast blacklist, disabled plugins)
// ==========================================================================

export async function addApprovedUser(telegramId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  session.approved_users = session.approved_users || [];
  if (!session.approved_users.includes(targetUserId)) {
    session.approved_users.push(targetUserId);
    await persistField(idNum, 'approved_users', session.approved_users);
  }

  return true;}


export async function removeApprovedUser(telegramId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;
  if (!session.approved_users) return true;

  const index = session.approved_users.indexOf(targetUserId);
  if (index > -1) {
    session.approved_users.splice(index, 1);
    await persistField(idNum, 'approved_users', session.approved_users);
  }

  return true;}


export function getApprovedUsers(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.approved_users || [];}


export async function addBroadcastBlacklist(telegramId, chatId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  session.broadcast_blacklist = session.broadcast_blacklist || [];
  const chatStr = String(chatId);
  if (!session.broadcast_blacklist.includes(chatStr)) {
    session.broadcast_blacklist.push(chatStr);
    await persistField(idNum, 'broadcast_blacklist', session.broadcast_blacklist);
  }

  return true;}


export async function removeBroadcastBlacklist(telegramId, chatId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;
  if (!session.broadcast_blacklist) return true;

  const chatStr = String(chatId);
  const index = session.broadcast_blacklist.indexOf(chatStr);
  if (index > -1) {
    session.broadcast_blacklist.splice(index, 1);
    await persistField(idNum, 'broadcast_blacklist', session.broadcast_blacklist);
  }

  return true;}


export function getBroadcastBlacklist(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.broadcast_blacklist || [];}


export async function disablePlugin(telegramId, pluginName) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  const name = String(pluginName || '').toLowerCase();
  session.disabled_plugins = session.disabled_plugins || [];
  if (!session.disabled_plugins.includes(name)) {
    session.disabled_plugins.push(name);
    await persistField(idNum, 'disabled_plugins', session.disabled_plugins);
  }

  return true;}


export async function enablePlugin(telegramId, pluginName) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;
  if (!session.disabled_plugins) return true;

  const name = String(pluginName || '').toLowerCase();
  const index = session.disabled_plugins.indexOf(name);
  if (index > -1) {
    session.disabled_plugins.splice(index, 1);
    await persistField(idNum, 'disabled_plugins', session.disabled_plugins);
  }

  return true;}


export function getDisabledPlugins(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.disabled_plugins || [];}


// ==========================================================================
// WARN SYSTEM
// ==========================================================================

export async function addWarn(telegramId, chatId, targetUserId, reason = 'Tidak ada alasan') {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return null;

  const chatKey = String(chatId);
  const userKey = String(targetUserId);
  if (!session.warn_data) session.warn_data = {};
  if (!session.warn_data[chatKey]) session.warn_data[chatKey] = {};

  const current = session.warn_data[chatKey][userKey] || { count: 0, reasons: [] };
  current.count = Number(current.count || 0) + 1;
  current.reasons = Array.isArray(current.reasons) ? current.reasons : [];
  current.reasons.push({ reason, at: new Date().toISOString() }
);
  current.reasons = current.reasons.slice(-10);
  current.lastWarnedAt = new Date().toISOString();

  session.warn_data[chatKey][userKey] = current;
  await persistField(idNum, 'warn_data', session.warn_data);
  return current;}


export async function removeWarn(telegramId, chatId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
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


  await persistField(idNum, 'warn_data', session.warn_data);
  return current.count === 0 ? null : current;}


export async function resetWarns(telegramId, chatId, targetUserId = null) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  const chatKey = String(chatId);
  if (!session.warn_data) session.warn_data = {};

  if (targetUserId === null || targetUserId === undefined) {
    delete session.warn_data[chatKey];
  } else if (session.warn_data[chatKey]) {
    delete session.warn_data[chatKey][String(targetUserId)];
  }


  await persistField(idNum, 'warn_data', session.warn_data);
  return true;}


export function getWarns(telegramId, chatId, targetUserId = null) {
  const session = dbCache.get(Number(telegramId));
  const chatWarns = session?.warn_data?.[String(chatId)] || {};
  if (targetUserId === null || targetUserId === undefined) return chatWarns;
  return chatWarns[String(targetUserId)] || { count: 0, reasons: [] };}


// ==========================================================================
// LOCK SYSTEM
// ==========================================================================

export async function setChatLock(telegramId, chatId, lockType, enabled) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return null;

  const chatKey = String(chatId);
  if (!session.lock_config) session.lock_config = {};
  if (!session.lock_config[chatKey]) session.lock_config[chatKey] = {};

  session.lock_config[chatKey][lockType] = enabled ? 1 : 0;
  await persistField(idNum, 'lock_config', session.lock_config);
  return session.lock_config[chatKey];}


export function getChatLocks(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  return session?.lock_config?.[String(chatId)] || {};}


// ==========================================================================
// SCHEDULE SYSTEM
// ==========================================================================

export async function saveSchedule(telegramId, chatKey, type, value, message) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.schedules) session.schedules = [];

  const scheduleObj = {
    chatKey: String(chatKey),
    type: String(type),
    value,
    message,
    updatedAt: new Date().toISOString()
  };

  const existingIndex = session.schedules.findIndex(
    s => s.chatKey === String(chatKey) && s.type === String(type)
  );

  if (existingIndex > -1) {
    session.schedules[existingIndex] = scheduleObj;
  } else {
    session.schedules.push(scheduleObj);
  }


  await persistField(idNum, 'schedules', session.schedules);
  return true;}


export function getSchedules(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.schedules || [];}


export async function deleteSchedule(telegramId, chatKey, type) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.schedules) {
    session.schedules = [];
    return true;
  }


  session.schedules = session.schedules.filter(
    s => !(s.chatKey === String(chatKey) && s.type === String(type))
  );

  await persistField(idNum, 'schedules', session.schedules);
  return true;}


// ==========================================================================
// CHAT SETTINGS
// ==========================================================================

export function getChatSettings(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return {};
  return (session.chat_settings || {}
)[String(chatId)] || {};}


export async function updateChatSettings(telegramId, chatId, key, value) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.chat_settings) session.chat_settings = {};
  const chatKey = String(chatId);
  if (!session.chat_settings[chatKey]) session.chat_settings[chatKey] = {};

  session.chat_settings[chatKey][key] = value;
  await persistField(idNum, 'chat_settings', session.chat_settings);
  return session.chat_settings[chatKey];}


// ==========================================================================
// REPUTATION SYSTEM
// ==========================================================================

export function getReputation(telegramId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return 0;
  const score = (session.reputation_data || {}
)[String(targetUserId)];
  return score !== undefined ? score : 0;}


export async function updateReputation(telegramId, targetUserId, points) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return null;

  if (!session.reputation_data) session.reputation_data = {};
  session.reputation_data[String(targetUserId)] = Number(points);
  await persistField(idNum, 'reputation_data', session.reputation_data);
  return Number(points);}


// ==========================================================================
// VARS (ENVIRONMENT VARIABLES)
// ==========================================================================

export function getUserVar(telegramId, key) {
  const session = dbCache.get(Number(telegramId));
  return session?.vars ? session.vars[key] : undefined;}


export function getAllUserVars(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.vars || {};}


export async function setUserVar(telegramId, key, value) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;
  
  if (!session.vars) session.vars = {};
  session.vars[key] = value;
  await persistField(idNum, 'vars', session.vars);
  return true;}


export async function deleteUserVar(telegramId, key) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session || !session.vars) return false;
  
  delete session.vars[key];
  await persistField(idNum, 'vars', session.vars);
  return true;}


export function getSystemVar(key) {
  return systemConfigCache.vars ? systemConfigCache.vars[key] : undefined;}


export function getAllSystemVars() {
  return systemConfigCache.vars || {};}


export async function setSystemVar(key, value) {
  if (!systemConfigCache.vars) systemConfigCache.vars = {};
  systemConfigCache.vars[key] = value;
  
  if (isMongo) {
    await SystemConfigModel.updateOne({ _id: 'system' }, { vars: systemConfigCache.vars }, { upsert: true }
);
  } else {
    const data = readDbFromFile();
    data.systemConfig = systemConfigCache;
    writeDbToFile(data);
  }

  return true;}


export async function deleteSystemVar(key) {
  if (!systemConfigCache.vars) return false;
  delete systemConfigCache.vars[key];
  
  if (isMongo) {
    await SystemConfigModel.updateOne({ _id: 'system' }, { vars: systemConfigCache.vars }, { upsert: true }
);
  } else {
    const data = readDbFromFile();
    data.systemConfig = systemConfigCache;
    writeDbToFile(data);
  }

  return true;}


// ==========================================================================
// TRIAL SYSTEM HELPERS
// ==========================================================================

export function hasClaimedTrial(telegramId) {
  const claims = getSystemVar('trial_claims') || {};
  return !!claims[telegramId];}


export async function setTrialClaimed(telegramId) {
  const claims = getSystemVar('trial_claims') || {};
  claims[telegramId] = true;
  return setSystemVar('trial_claims', claims);}

// ==========================================================================
// GROUP MANAGEMENT SETTINGS
// ==========================================================================

export function getGroupConfig(chatId) {
  const chatKey = String(chatId);
  return groupConfigCache.get(chatKey) || {
    chat_id: chatKey,
    welcome_enabled: 0,
    welcome_text: 'Halo {first_name}, selamat datang di {chat_title}!',
    goodbye_text: 'Selamat jalan {first_name}.',
    anti_link: 0,
    anti_spam: 0,
    captcha_enabled: 0,
    locks: {},
    linked_fed: null,
    rules_text: 'Belum ada aturan grup yang ditetapkan.',
    warn_data: {},
    notes: {}

  };}


export async function updateGroupConfig(chatId, updates) {
  const chatKey = String(chatId);
  const existing = getGroupConfig(chatId);
  const newData = { ...existing, ...updates, chat_id: chatKey };
  
  groupConfigCache.set(chatKey, newData);

  if (isMongo) {
    try {
      await GroupConfigModel.findOneAndUpdate(
        { chat_id: chatKey },
        newData,
        { upsert: true, returnDocument: 'after' }

      );
    } catch (e) {
      console.error('❌ MongoDB GroupConfig error:', e.message);
    }

  } else {
    const data = readDbFromFile();
    data.groups[chatKey] = newData;
    writeDbToFile(data);
  }

  
  return newData;}


// ==========================================================================
// GROUP WARN SYSTEM
// ==========================================================================

export async function addGroupWarn(chatId, targetUserId, reason = 'Tidak ada alasan') {
  const chatKey = String(chatId);
  const userKey = String(targetUserId);
  const config = getGroupConfig(chatId);

  if (!config.warn_data) config.warn_data = {};
  
  const current = config.warn_data[userKey] || { count: 0, reasons: [] };
  current.count += 1;
  if (!Array.isArray(current.reasons)) current.reasons = [];
  current.reasons.push({ reason, at: new Date().toISOString() }
);
  current.reasons = current.reasons.slice(-10); // Keep max 10 reasons
  current.lastWarnedAt = new Date().toISOString();

  config.warn_data[userKey] = current;
  await updateGroupConfig(chatId, { warn_data: config.warn_data }
);
  
  return current;}


export async function removeGroupWarn(chatId, targetUserId) {
  const chatKey = String(chatId);
  const userKey = String(targetUserId);
  const config = getGroupConfig(chatId);

  if (!config.warn_data || !config.warn_data[userKey]) return null;

  const current = config.warn_data[userKey];
  current.count = Math.max(0, current.count - 1);
  current.lastWarnedAt = new Date().toISOString();

  if (current.count === 0) {
    delete config.warn_data[userKey];
  } else {
    config.warn_data[userKey] = current;
  }


  await updateGroupConfig(chatId, { warn_data: config.warn_data }
);
  return current.count === 0 ? null : current;}


export async function resetGroupWarns(chatId, targetUserId) {
  const chatKey = String(chatId);
  const config = getGroupConfig(chatId);

  if (!config.warn_data) return true;

  if (targetUserId) {
    delete config.warn_data[String(targetUserId)];
  } else {
    config.warn_data = {}; // Reset all
  }


  await updateGroupConfig(chatId, { warn_data: config.warn_data }
);
  return true;}


export function getGroupWarns(chatId, targetUserId) {
  const config = getGroupConfig(chatId);
  if (!config.warn_data) return { count: 0, reasons: [] };
  
  if (targetUserId) {
    return config.warn_data[String(targetUserId)] || { count: 0, reasons: [] };
  }

  return config.warn_data; // All warns in group
}


// ==========================================================================
// GROUP NOTES SYSTEM
// ==========================================================================

export async function saveGroupNote(chatId, noteName, text) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();

  if (!config.notes) config.notes = {};
  config.notes[name] = text;
  
  await updateGroupConfig(chatId, { notes: config.notes }
);
  return true;}


export async function deleteGroupNote(chatId, noteName) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();

  if (!config.notes || !config.notes[name]) return false;

  delete config.notes[name];
  await updateGroupConfig(chatId, { notes: config.notes }
);
  return true;}


export function getGroupNote(chatId, noteName) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();
  if (!config.notes) return null;
  return config.notes[name] || null;}


export function getAllGroupNotes(chatId) {
  const config = getGroupConfig(chatId);
  if (!config.notes) return [];
  return Object.keys(config.notes);}



export function getAllGroupConfigs() {
  return Object.fromEntries(groupConfigCache);
}


// ==========================================================================
// FEDERATION SYSTEM
// ==========================================================================

export function getFederation(fedId) {
  return fedCache.get(String(fedId)) || null;
}

export function getAllFederations() {
  return Array.from(fedCache.values());
}

export async function saveFederation(fedData) {
  const fedId = String(fedData.fed_id);
  fedCache.set(fedId, fedData);
  
  // NOTE: In a full app, you check isMongo and save to Mongo or JSON.
  // For simplicity we will rely on Mongo since it's the primary backend here.
  // We assume isMongo is accessible or we just run it directly.
  try {
    await FederationModel.updateOne({ fed_id: fedId }, fedData, { upsert: true });
  } catch(e) {}
  return true;
}

export async function deleteFederation(fedId) {
  fedCache.delete(String(fedId));
  try {
    await FederationModel.deleteOne({ fed_id: String(fedId) });
  } catch(e) {}
  return true;
}

// Load federations on init
// Wait, we need to inject the loading logic into initDatabaseAndCache...
// For now, let's just expose a function to load them lazily if needed, or rely on bot init.
export async function loadFederations() {
  try {
    const feds = await FederationModel.find({});
    for (const f of feds) {
      fedCache.set(f.fed_id, f.toObject());
    }
  } catch(e) {}
}
