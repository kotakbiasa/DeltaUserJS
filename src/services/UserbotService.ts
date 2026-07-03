import { dbCache, persistDoc, persistField, persistDelete, normalizeBot, groupConfigCache, isMongo, readDbFromFile, writeDbToFile, GroupConfigModel } from '../infrastructure/dbCore.js';


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
  return persistDoc(idNum, botData);
}

export function getUserbotSession(telegramId) {
  return dbCache.get(Number(telegramId));
}

export function getAllActiveUserbots() {
  return Array.from(dbCache.values()).filter(bot => bot.is_active === 1);
}

export function getAllRegisteredUsers() {
  return Array.from(dbCache.values());
}

export async function updateUserbotStatus(telegramId, isActive) {
  const idNum = Number(telegramId);
  const statusVal = isActive ? 1 : 0;

  const cached = dbCache.get(idNum);
  if (cached) cached.is_active = statusVal;

  return persistField(idNum, 'is_active', statusVal);
}

export async function updateUserbotFeature(telegramId, featureName, value) {
  const idNum = Number(telegramId);

  const cached = dbCache.get(idNum);
  if (cached) cached[featureName] = value;

  return persistField(idNum, featureName, value);
}

export async function deleteUserbot(telegramId) {
  const idNum = Number(telegramId);
  dbCache.delete(idNum);
  return persistDelete(idNum);
}

export async function addApprovedUser(telegramId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  session.approved_users = session.approved_users || [];
  if (!session.approved_users.includes(targetUserId)) {
    session.approved_users.push(targetUserId);
    await persistField(idNum, 'approved_users', session.approved_users);
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
    await persistField(idNum, 'approved_users', session.approved_users);
  }

  return true;
}

export function getApprovedUsers(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.approved_users || [];
}

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
    await persistField(idNum, 'broadcast_blacklist', session.broadcast_blacklist);
  }

  return true;
}

export function getBroadcastBlacklist(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.broadcast_blacklist || [];
}

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

  return true;
}

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

  return true;
}

export function getDisabledPlugins(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.disabled_plugins || [];
}

export function getChatSettings(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return {};
  return (session.chat_settings || {})[String(chatId)] || {};
}

export async function updateChatSettings(telegramId, chatId, key, value) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  if (!session.chat_settings) session.chat_settings = {};
  const chatKey = String(chatId);
  if (!session.chat_settings[chatKey]) session.chat_settings[chatKey] = {};

  session.chat_settings[chatKey][key] = value;
  await persistField(idNum, 'chat_settings', session.chat_settings);
  return session.chat_settings[chatKey];
}

export function getSchedules(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.schedules || [];
}

export function getReputation(telegramId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return 0;
  return (session.reputation_data || {})[String(targetUserId)] || 0;
}

export function getWarns(telegramId, chatId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return { count: 0 };
  const chatWarns = (session.warn_data || {})[String(chatId)] || {};
  return chatWarns[String(targetUserId)] || { count: 0 };
}

export function getChatLocks(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return {};
  return (session.lock_config || {})[String(chatId)] || {};
}

export async function saveSchedule(telegramId, chatId, type, value, message) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  session.schedules = session.schedules || [];
  const chatKey = String(chatId);
  session.schedules = session.schedules.filter(s => !(s.chatKey === chatKey && s.type === type));

  session.schedules.push({
    chatKey,
    type,
    value,
    message
  });

  await persistField(idNum, 'schedules', session.schedules);
  return true;
}

export async function deleteSchedule(telegramId, chatId, type) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  session.schedules = session.schedules || [];
  const chatKey = String(chatId);
  session.schedules = session.schedules.filter(s => !(s.chatKey === chatKey && s.type === type));

  await persistField(idNum, 'schedules', session.schedules);
  return true;
}

export async function updateReputation(telegramId, targetUserId, points) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;

  session.reputation_data = session.reputation_data || {};
  session.reputation_data[String(targetUserId)] = points;

  await persistField(idNum, 'reputation_data', session.reputation_data);
  return true;
}

export async function addWarn(telegramId, chatId, targetUserId, reason = '') {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return { count: 0 };

  if (!session.warn_data) session.warn_data = {};
  const chatKey = String(chatId);
  if (!session.warn_data[chatKey]) session.warn_data[chatKey] = {};
  const userKey = String(targetUserId);
  const existing = session.warn_data[chatKey][userKey] || { count: 0, reasons: [] };

  const newCount = existing.count + 1;
  session.warn_data[chatKey][userKey] = {
    count: newCount,
    reasons: [...(existing.reasons || []), reason]
  };

  await persistField(idNum, 'warn_data', session.warn_data);
  return session.warn_data[chatKey][userKey];
}

export async function resetWarns(telegramId, chatId, targetUserId) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return true;

  if (!session.warn_data) return true;
  const chatKey = String(chatId);
  if (!session.warn_data[chatKey]) return true;
  const userKey = String(targetUserId);

  if (session.warn_data[chatKey][userKey]) {
    delete session.warn_data[chatKey][userKey];
    await persistField(idNum, 'warn_data', session.warn_data);
  }
  return true;
}

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
  };
}

export async function updateGroupConfig(chatId, updates) {
  const chatKey = String(chatId);
  const existing = getGroupConfig(chatId);
  const newData = { ...existing, ...updates, chat_id: chatKey };
  
  groupConfigCache.set(chatKey, newData);

  if (isMongo) {
    try {
      await (GroupConfigModel as any).findOneAndUpdate(
        { chat_id: chatKey },
        newData,
        { upsert: true, returnDocument: 'after' }
      );
    } catch (e) {
      console.error('❌ MongoDB GroupConfig error:', e.message);
    }
  } else {
    const data = readDbFromFile();
    if (!data.groups) data.groups = {};
    data.groups[chatKey] = newData;
    writeDbToFile(data);
  }
  
  return newData;
}

export function getAllGroupConfigs() {
  return Object.fromEntries(groupConfigCache);
}

export async function saveGroupNote(chatId, noteName, text) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();

  if (!config.notes) config.notes = {};
  config.notes[name] = text;
  
  await updateGroupConfig(chatId, { notes: config.notes });
  return true;
}

export async function deleteGroupNote(chatId, noteName) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();

  if (!config.notes || !config.notes[name]) return false;

  delete config.notes[name];
  await updateGroupConfig(chatId, { notes: config.notes });
  return true;
}

export function getGroupNote(chatId, noteName) {
  const config = getGroupConfig(chatId);
  const name = String(noteName).toLowerCase();
  if (!config.notes) return null;
  return config.notes[name] || null;
}

export function getAllGroupNotes(chatId) {
  const config = getGroupConfig(chatId);
  if (!config.notes) return [];
  return Object.keys(config.notes);
}




