// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import config from '../config.js';
import { decrypt, isEncrypted } from '../utils/crypto.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../database.json');
// Per-key async lock to serialize read-modify-write operations on the same
// cache key. Each key's operations run strictly in order; a rejected op does
// not block later ops for that key (the lock pointer swallows settle state).
const keyLocks = new Map();
/**
 * Run `fn` while holding a per-key lock. All calls with the same `key` are
 * serialized in submission order. Returns fn's actual resolved value.
 * Usage:
 *   await withKeyLock(idNum, async () => { /* read-modify-write dbCache *\/ });
 */
export function withKeyLock(key, fn) {
    const prev = keyLocks.get(key) || Promise.resolve();
    const run = prev.then(fn, fn);
    keyLocks.set(key, run.then(() => undefined, () => undefined));
    return run;
}
export async function updateCacheField(idNum, field, value) {
    return withKeyLock(idNum, async () => {
        const existing = dbCache.get(idNum) || {};
        const updated = { ...existing, [field]: value };
        dbCache.set(idNum, updated);
        return persistDoc(idNum, updated);
    });
}
export function getFromCache(idNum) {
    return dbCache.get(idNum);
}
export const DEFAULT_AFK_REASON = 'AFK';
const MONGO_URI = config.mongoUri || process.env.MONGO_URI;
const DB_NAME = config.dbName || process.env.DB_NAME || 'DeltaUbotJS';
// Constants
export const DEFAULT_CUSTOM_NAME = 'Userbot';
export const SUBSCRIPTION_DAYS = 7;
// Mongoose Models (if using MongoDB)
const userbotSchema = new mongoose.Schema({
    telegram_id: { type: Number, required: true, unique: true, index: true },
    phone: String,
    session_string: String,
    is_active: { type: Number, default: 1 },
    auto_read: { type: Number, default: 0 },
    auto_reply: { type: Number, default: 0 },
    anti_pm: { type: Number, default: 0 },
    afk_reason: { type: String, default: DEFAULT_AFK_REASON },
    expired_at: Date,
    created_at: { type: Date, default: Date.now },
    inline_bot_token: String,
    inline_bot_username: String,
    custom_name: { type: String, default: DEFAULT_CUSTOM_NAME },
    approved_users: [Number],
    broadcast_blacklist: [Number],
    disabled_plugins: [String],
    vars: { type: Map, of: String, default: {} },
}, { strict: false });
const systemConfigSchema = new mongoose.Schema({
    _id: { type: String, default: 'system' },
    vars: { type: Map, of: String, default: {} },
}, { _id: false });
export const UserbotModel = mongoose.models.Userbot || mongoose.model('Userbot', userbotSchema);
export const SystemConfigModel = mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema);
const groupConfigSchema = new mongoose.Schema({
    chat_id: { type: String, required: true, unique: true, index: true },
    notes: { type: Map, of: String, default: {} }
}, { strict: false });
export const GroupConfigModel = mongoose.models.GroupConfig || mongoose.model('GroupConfig', groupConfigSchema);
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
export function normalizeBot(raw = {}, id) {
    const idNum = Number(id ?? raw.telegram_id);
    const createdAt = raw.created_at || new Date().toISOString();
    const pick = (key, fallback) => (raw[key] !== undefined && raw[key] !== null ? raw[key] : fallback);
    // Decrypt session_string if it's encrypted
    let sessionString = raw.session_string || null;
    if (sessionString && isEncrypted(sessionString)) {
        try {
            sessionString = decrypt(sessionString);
        }
        catch {
            // If decryption fails, keep raw value (migration or key mismatch)
        }
    }
    return {
        telegram_id: idNum,
        phone: raw.phone || null,
        session_string: sessionString,
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
        if (!parsed.systemConfig)
            parsed.systemConfig = { vars: {} };
        if (!parsed.groups)
            parsed.groups = {};
        return parsed;
    }
    catch (err) {
        console.error('❌ Error reading database file:', err);
        return { userbots: {}, systemConfig: { vars: {} }, groups: {} };
    }
}
export function writeDbToFile(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        return true;
    }
    catch (err) {
        console.error('❌ Error writing database file:', err);
        return false;
    }
}
// Global file-DB write lock to prevent interleaved read-modify-write cycles
// on database.json. Serializes every writeDbToFile() path. Returns fn's real
// resolved value, and a failed op never deadlocks the chain.
let writeLock = Promise.resolve();
export function withWriteLock(fn) {
    const run = writeLock.then(fn, fn);
    writeLock = run.then(() => undefined, () => undefined);
    return run;
}
export async function persistField(idNum, field, value) {
    if (isMongo) {
        try {
            // Use $set to update only the specific field (not replace entire doc)
            const update = {};
            update[field] = value;
            await UserbotModel.updateOne({ telegram_id: idNum }, { $set: update });
            return true;
        }
        catch (err) {
            console.error(`❌ MongoDB update error (${field}):`, err.message);
            return false;
        }
    }
    return withWriteLock(async () => {
        const data = readDbFromFile();
        if (!data.userbots[idNum])
            return false;
        data.userbots[idNum][field] = value;
        return writeDbToFile(data);
    });
}
export async function persistDoc(idNum, doc) {
    if (isMongo) {
        try {
            // Use $set so fields absent from `doc` are preserved instead of the
            // whole document being replaced (prevents field loss on restart).
            await UserbotModel.findOneAndUpdate({ telegram_id: idNum }, { $set: doc }, { upsert: true, returnDocument: 'after' });
            return true;
        }
        catch (err) {
            console.error('❌ MongoDB save error:', err.message);
            return false;
        }
    }
    return withWriteLock(async () => {
        const data = readDbFromFile();
        data.userbots[idNum] = doc;
        return writeDbToFile(data);
    });
}
export async function persistDelete(idNum) {
    if (isMongo) {
        try {
            await UserbotModel.deleteOne({ telegram_id: idNum });
            return true;
        }
        catch (err) {
            console.error('❌ MongoDB delete error:', err.message);
            return false;
        }
    }
    return withWriteLock(async () => {
        const data = readDbFromFile();
        if (!data.userbots[idNum])
            return false;
        delete data.userbots[idNum];
        return writeDbToFile(data);
    });
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
            if (sysConf)
                systemConfigCache = sysConf.toObject();
            const groups = await GroupConfigModel.find({});
            for (const group of groups) {
                groupConfigCache.set(group.chat_id, group.toObject());
            }
            console.log(`📦 Loaded ${dbCache.size} userbot sessions from MongoDB.`);
            return;
        }
        catch (err) {
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
// Module-level initialization: do NOT use top-level await.
// The application entry point (src/index.ts) calls this explicitly
// so startup order is controlled and testable.
// initDatabaseAndCache is exported for caller-side invocation.
// Placeholder so module load is instant; real init happens in main().
dbCache.clear();
systemConfigCache = { vars: {} };
