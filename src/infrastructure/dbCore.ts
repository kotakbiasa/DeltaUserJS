// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import config from '../config.js';
import {
  DEFAULT_AFK_REASON,
  DEFAULT_CUSTOM_NAME,
  SUBSCRIPTION_DAYS,
  UserbotModel,
  SystemConfigModel,
  GroupConfigModel,
  FederationModel
} from '../domain/models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../database.json');

const MONGO_URI = config.mongoUri || process.env.MONGO_URI;
const DB_NAME = config.dbName || process.env.DB_NAME || 'DeltaUbotJS';

export const dbCache = new Map();
export let isMongo = false;
export let systemConfigCache = { vars: {} };
export const fedCache = new Map();
export const groupConfigCache = new Map();

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function normalizeBot(raw: any = {}, id?: any) {
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
  };
}

export function readDbFromFile() {
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

export function writeDbToFile(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Error writing database file:', err);
    return false;
  }
}

export async function persistField(idNum, field, value) {
  if (isMongo) {
    try {
      await UserbotModel.updateOne({ telegram_id: idNum }, { [field]: value });
      return true;
    } catch (err) {
      console.error(`❌ MongoDB update error (${field}):`, err.message);
      return false;
    }
  }

  const data = readDbFromFile();
  if (!data.userbots[idNum]) return false;
  data.userbots[idNum][field] = value;
  return writeDbToFile(data);
}

export async function persistDoc(idNum, doc) {
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
  return writeDbToFile(data);
}

export async function persistDelete(idNum) {
  if (isMongo) {
    try {
      await UserbotModel.deleteOne({ telegram_id: idNum });
      return true;
    } catch (err) {
      console.error('❌ MongoDB delete error:', err.message);
      return false;
    }
  }

  const data = readDbFromFile();
  if (!data.userbots[idNum]) return false;
  delete data.userbots[idNum];
  return writeDbToFile(data);
}

export async function initDatabaseAndCache() {
  dbCache.clear();

  if (MONGO_URI && MONGO_URI !== 'YOUR_MONGO_URI') {
    try {
      console.log('🔌 Connecting to MongoDB Cluster...');
      await mongoose.connect(MONGO_URI, {
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 15000
      });
      isMongo = true;
      console.log(`✅ Connected successfully to MongoDB: "${mongoose.connection.name}"`);

      const bots = await UserbotModel.find({});
      for (const bot of bots) {
        dbCache.set(bot.telegram_id, normalizeBot(bot.toObject(), bot.telegram_id));
      }

      const sysConf = await SystemConfigModel.findById('system');
      if (sysConf) systemConfigCache = sysConf.toObject();

      const groups = await GroupConfigModel.find({});
      for (const group of groups) {
        groupConfigCache.set(group.chat_id, group.toObject());
      }

      console.log(`📦 Loaded ${dbCache.size} userbot sessions from MongoDB.`);
      return;
    } catch (err) {
      console.error('❌ Failed to connect to MongoDB:', err.message);
      console.error('🛑 MONGO_URI is configured, so DeltaUbotJS will stop instead of falling back to empty local JSON database.');
      throw err;
    }
  }

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
  console.log(`⚡ In-memory cache loaded with ${dbCache.size} userbot sessions.`);
}

export async function loadFederations() {
  try {
    const feds = await FederationModel.find({});
    for (const f of feds) {
      fedCache.set(f.fed_id, f.toObject());
    }
  } catch(e) {}
}

await initDatabaseAndCache();
await loadFederations();
