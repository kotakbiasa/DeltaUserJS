import { dbCache, persistDoc, persistField, persistDelete, normalizeBot } from '../infrastructure/dbCore.js';

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
