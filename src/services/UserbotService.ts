import { dbCache, persistDoc, persistField, persistDelete, normalizeBot, groupConfigCache, isMongo, readDbFromFile, writeDbToFile, GroupConfigModel, withKeyLock, withWriteLock } from '../infrastructure/dbCore.js';
import { encrypt } from '../utils/crypto.js';
import { deepClone } from '../utils/deepClone.js';
import { Logger } from '../utils/logger.js';


export async function saveUserbotSession(telegramId: number, phone: string, sessionString: string) {
  const idNum = Number(telegramId);
  const existing = dbCache.get(idNum) || {};

  // Encrypt session string before storing in database
  const encryptedSession = sessionString ? encrypt(sessionString) : sessionString;

  // Userbots have permanent access once approved; no expiration is enforced.
  const expDate = null;

  const botData = normalizeBot({
    ...existing,
    telegram_id: idNum,
    phone: phone || null,
    session_string: encryptedSession,
    is_active: 1,
    expired_at: expDate,
  }, idNum);

  dbCache.set(idNum, botData);
  return persistDoc(idNum, botData);
}

export function getUserbotSession(telegramId: number) {
  return dbCache.get(Number(telegramId));
}

export function getAllActiveUserbots() {
  return Array.from(dbCache.values()).filter(bot => bot.is_active === 1);
}

export function getAllRegisteredUsers() {
  return Array.from(dbCache.values());
}

export async function updateUserbotStatus(telegramId: number, isActive: boolean | number) {
  const idNum = Number(telegramId);
  const statusVal = isActive ? 1 : 0;

  const cached = dbCache.get(idNum);
  if (cached) {cached.is_active = statusVal;}

  return persistField(idNum, 'is_active', statusVal);
}

export async function updateTelegramPremiumStatus(telegramId: number | string, isPremium: boolean | number) {
  const idNum = Number(telegramId);
  const premVal = isPremium ? 1 : 0;

  const cached = dbCache.get(idNum);
  if (cached) {
    cached.is_telegram_premium = premVal;
  }

  return persistField(idNum, 'is_telegram_premium', premVal);
}

// Helper: safely update a complex object field in DB (deep clone before persist)
export async function updateUserbotFeature(telegramId: number, featureName: string, value: unknown) {
  const idNum = Number(telegramId);

  const cached = dbCache.get(idNum);
  if (cached) {
    // Use Object.defineProperty for protected fields to avoid corrupting Mongoose virtuals
    if (featureName === 'approved_users' || featureName === 'broadcast_blacklist' || featureName === 'disabled_plugins') {
      cached[featureName] = Array.isArray(value) ? [...value] : value;
    } else {
      cached[featureName] = value;
    }
  }

  return persistField(idNum, featureName, value);
}

export async function deleteUserbot(telegramId: number) {
  const idNum = Number(telegramId);
  dbCache.delete(idNum);
  return persistDelete(idNum);
}

type UserbotListField = 'approved_users' | 'broadcast_blacklist' | 'disabled_plugins';

async function addUserbotListItem(telegramId: number, field: UserbotListField, value: unknown) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}

    session[field] = session[field] || [];
    if (!session[field].includes(value)) {
      session[field].push(value);
      await persistField(idNum, field, [...session[field]]);
    }

    return true;
  });
}

async function removeUserbotListItem(telegramId: number, field: UserbotListField, value: unknown) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}
    if (!session[field]) {return true;}

    const index = session[field].indexOf(value);
    if (index > -1) {
      session[field].splice(index, 1);
      await persistField(idNum, field, [...session[field]]);
    }

    return true;
  });
}

export function addApprovedUser(telegramId: number, targetUserId: string | number | bigint) {
  return addUserbotListItem(telegramId, 'approved_users', targetUserId);
}

export function removeApprovedUser(telegramId: number, targetUserId: string | number | bigint) {
  return removeUserbotListItem(telegramId, 'approved_users', targetUserId);
}

export function getApprovedUsers(telegramId: number) {
  const session = dbCache.get(Number(telegramId));
  return session?.approved_users || [];
}

export function addBroadcastBlacklist(telegramId: number, chatId: string | number | bigint) {
  return addUserbotListItem(telegramId, 'broadcast_blacklist', String(chatId));
}

export function removeBroadcastBlacklist(telegramId: number, chatId: string | number | bigint) {
  return removeUserbotListItem(telegramId, 'broadcast_blacklist', String(chatId));
}

export function getBroadcastBlacklist(telegramId: number) {
  const session = dbCache.get(Number(telegramId));
  return session?.broadcast_blacklist || [];
}

export function disablePlugin(telegramId: number, pluginName: string) {
  return addUserbotListItem(telegramId, 'disabled_plugins', String(pluginName || '').toLowerCase());
}

export function enablePlugin(telegramId: number, pluginName: string) {
  return removeUserbotListItem(telegramId, 'disabled_plugins', String(pluginName || '').toLowerCase());
}

export function getDisabledPlugins(telegramId: number) {
  const session = dbCache.get(Number(telegramId));
  return session?.disabled_plugins || [];
}

export function getChatSettings(telegramId: number, chatId: string | number | bigint) {
  const session = dbCache.get(Number(telegramId));
  if (!session) {return {};}
  return (session.chat_settings || {})[String(chatId)] || {};
}

export async function updateChatSettings(telegramId: number, chatId: string | number | bigint, key: string, value: unknown) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}

    if (!session.chat_settings) {session.chat_settings = {};}
    const chatKey = String(chatId);
    if (!session.chat_settings[chatKey]) {session.chat_settings[chatKey] = {};}

    session.chat_settings[chatKey][key] = value;
    // Deep clone chat_settings before persist to avoid reference mutation
    await persistField(idNum, 'chat_settings', deepClone(session.chat_settings));
    return session.chat_settings[chatKey];
  });
}

export function getSchedules(telegramId: number) {
  const session = dbCache.get(Number(telegramId));
  return session?.schedules || [];
}

export function getReputation(telegramId: number, targetUserId: string | number | bigint) {
  const session = dbCache.get(Number(telegramId));
  if (!session) {return 0;}
  return (session.reputation_data || {})[String(targetUserId)] || 0;
}

export function getWarns(telegramId: number, chatId: string | number | bigint, targetUserId: string | number | bigint) {
  const session = dbCache.get(Number(telegramId));
  if (!session) {return { count: 0 };}
  const chatWarns = (session.warn_data || {})[String(chatId)] || {};
  return chatWarns[String(targetUserId)] || { count: 0 };
}

export function getChatLocks(telegramId: number, chatId: string | number | bigint) {
  const session = dbCache.get(Number(telegramId));
  if (!session) {return {};}
  return (session.lock_config || {})[String(chatId)] || {};
}

export async function saveSchedule(telegramId: number, chatId: string | number | bigint, type: string, value: unknown, message: string) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}

    session.schedules = session.schedules || [];
    const chatKey = String(chatId);
    session.schedules = session.schedules.filter((s: { chatKey?: string; type?: string }) => !(s.chatKey === chatKey && s.type === type));

    session.schedules.push({
      chatKey,
      type,
      value,
      message
    });

    await persistField(idNum, 'schedules', session.schedules);
    return true;
  });
}

export async function deleteSchedule(telegramId: number, chatId: string | number | bigint, type: string) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}

    session.schedules = session.schedules || [];
    const chatKey = String(chatId);
    session.schedules = session.schedules.filter((s: { chatKey?: string; type?: string }) => !(s.chatKey === chatKey && s.type === type));

    await persistField(idNum, 'schedules', session.schedules);
    return true;
  });
}

export async function updateReputation(telegramId: number, targetUserId: string | number | bigint, points: number) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}

    session.reputation_data = session.reputation_data || {};
    session.reputation_data[String(targetUserId)] = points;
    // Deep clone to avoid reference mutation
    await persistField(idNum, 'reputation_data', deepClone(session.reputation_data));
    return true;
  });
}

export async function addWarn(telegramId: number, chatId: string | number | bigint, targetUserId: string | number | bigint, reason = '') {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return { count: 0 };}

    if (!session.warn_data) {session.warn_data = {};}
    const chatKey = String(chatId);
    if (!session.warn_data[chatKey]) {session.warn_data[chatKey] = {};}
    const userKey = String(targetUserId);
    const existing = session.warn_data[chatKey][userKey] || { count: 0, reasons: [] };

    const newCount = existing.count + 1;
    session.warn_data[chatKey][userKey] = {
      count: newCount,
      reasons: [...(existing.reasons || []), reason]
    };

    // Deep clone to avoid reference mutation
    await persistField(idNum, 'warn_data', deepClone(session.warn_data));
    return session.warn_data[chatKey][userKey];
  });
}

export async function resetWarns(telegramId: number, chatId: string | number | bigint, targetUserId: string | number | bigint) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return true;}

    if (!session.warn_data) {return true;}
    const chatKey = String(chatId);
    if (!session.warn_data[chatKey]) {return true;}
    const userKey = String(targetUserId);

    if (session.warn_data[chatKey][userKey]) {
      delete session.warn_data[chatKey][userKey];
      // Deep clone to avoid reference mutation
      await persistField(idNum, 'warn_data', deepClone(session.warn_data));
    }
    return true;
  });
}

function getGroupConfig(chatId: string | number | bigint) {
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
  };
}

async function updateGroupConfig(chatId: string | number | bigint, updates: Record<string, unknown>) {
  const chatKey = String(chatId);
  // Serialize per-chat get-mutate-persist, and share the same file-write lock
  // as every other database.json writer to avoid interleaved file writes.
  return withKeyLock(`group:${chatKey}`, async () => {
    const existing = getGroupConfig(chatId);
    const newData = { ...existing, ...updates, chat_id: chatKey };

    groupConfigCache.set(chatKey, newData);

    if (isMongo) {
      try {
        // $set so partial updates don't wipe unspecified fields.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (GroupConfigModel as any).findOneAndUpdate(
          { chat_id: chatKey },
          { $set: newData },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (e) {
        Logger.logSystem(`❌ MongoDB GroupConfig error: ${e.message}`, 'ERROR');
      }
    } else {
      await withWriteLock(async () => {
        const data = await readDbFromFile();
        if (!data.groups) {data.groups = {};}
        data.groups[chatKey] = newData;
        await writeDbToFile(data);
      });
    }

    return newData;
  });
}

export async function saveGroupNote(chatId: string | number | bigint, noteName: string, text: string) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();

  if (!config.notes) {config.notes = {};}
  config.notes[name] = text;
  
  await updateGroupConfig(chatId, { notes: config.notes });
  return true;
}

export async function deleteGroupNote(chatId: string | number | bigint, noteName: string) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();

  if (!config.notes || !config.notes[name]) {return false;}

  delete config.notes[name];
  await updateGroupConfig(chatId, { notes: config.notes });
  return true;
}

export function getGroupNote(chatId: string | number | bigint, noteName: string) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();
  if (!config.notes) {return null;}
  return config.notes[name] || null;
}

export function getAllGroupNotes(chatId: string | number | bigint) {
  const config = getGroupConfig(chatId);
  if (!config.notes) {return [];}
  return Object.keys(config.notes);
}




