import { dbCache, persistField } from '../../infrastructure/dbCore.js';
import { getChatSettings } from './UserbotService.js';
import { getGroupConfig, updateGroupConfig } from './GroupService.js';
export async function addWarn(telegramId, chatId, targetUserId, reason = 'Tidak ada alasan') {
    const idNum = Number(telegramId);
    const session = dbCache.get(idNum);
    if (!session)
        return null;
    const chatKey = String(chatId);
    const userKey = String(targetUserId);
    if (!session.warn_data)
        session.warn_data = {};
    if (!session.warn_data[chatKey])
        session.warn_data[chatKey] = {};
    const current = session.warn_data[chatKey][userKey] || { count: 0, reasons: [] };
    current.count = Number(current.count || 0) + 1;
    current.reasons = Array.isArray(current.reasons) ? current.reasons : [];
    current.reasons.push({ reason, at: new Date().toISOString() });
    current.reasons = current.reasons.slice(-10);
    current.lastWarnedAt = new Date().toISOString();
    session.warn_data[chatKey][userKey] = current;
    await persistField(idNum, 'warn_data', session.warn_data);
    return current;
}
export async function removeWarn(telegramId, chatId, targetUserId) {
    const idNum = Number(telegramId);
    const session = dbCache.get(idNum);
    if (!session?.warn_data)
        return null;
    const chatKey = String(chatId);
    const userKey = String(targetUserId);
    const current = session.warn_data[chatKey]?.[userKey];
    if (!current)
        return null;
    current.count = Math.max(0, Number(current.count || 0) - 1);
    current.lastWarnedAt = new Date().toISOString();
    if (current.count === 0) {
        delete session.warn_data[chatKey][userKey];
    }
    else {
        session.warn_data[chatKey][userKey] = current;
    }
    await persistField(idNum, 'warn_data', session.warn_data);
    return current.count === 0 ? null : current;
}
export async function resetWarns(telegramId, chatId, targetUserId = null) {
    const idNum = Number(telegramId);
    const session = dbCache.get(idNum);
    if (!session)
        return false;
    const chatKey = String(chatId);
    if (!session.warn_data)
        session.warn_data = {};
    if (targetUserId === null || targetUserId === undefined) {
        delete session.warn_data[chatKey];
    }
    else if (session.warn_data[chatKey]) {
        delete session.warn_data[chatKey][String(targetUserId)];
    }
    await persistField(idNum, 'warn_data', session.warn_data);
    return true;
}
export function getWarns(telegramId, chatId, targetUserId = null) {
    const session = dbCache.get(Number(telegramId));
    const chatWarns = session?.warn_data?.[String(chatId)] || {};
    if (targetUserId === null || targetUserId === undefined)
        return chatWarns;
    const warn = chatWarns[String(targetUserId)];
    if (!warn)
        return { count: 0, reasons: [] };
    const chatSettings = getChatSettings(telegramId, chatId);
    const timeWindow = Number(chatSettings.flood_time_window || 3) * 1000;
    if (warn.lastWarnedAt && (Date.now() - new Date(warn.lastWarnedAt).getTime() > timeWindow)) {
        warn.count = 0;
        warn.reasons = [];
    }
    return warn;
}
export async function addGroupWarn(chatId, targetUserId, reason = 'Tidak ada alasan') {
    const chatKey = String(chatId);
    const userKey = String(targetUserId);
    const config = getGroupConfig(chatId);
    if (!config.warn_data)
        config.warn_data = {};
    const current = config.warn_data[userKey] || { count: 0, reasons: [] };
    current.count += 1;
    if (!Array.isArray(current.reasons))
        current.reasons = [];
    current.reasons.push({ reason, at: new Date().toISOString() });
    current.reasons = current.reasons.slice(-10); // Keep max 10 reasons
    current.lastWarnedAt = new Date().toISOString();
    config.warn_data[userKey] = current;
    await updateGroupConfig(chatId, { warn_data: config.warn_data });
    return current;
}
export async function removeGroupWarn(chatId, targetUserId) {
    const chatKey = String(chatId);
    const userKey = String(targetUserId);
    const config = getGroupConfig(chatId);
    if (!config.warn_data || !config.warn_data[userKey])
        return null;
    const current = config.warn_data[userKey];
    current.count = Math.max(0, current.count - 1);
    current.lastWarnedAt = new Date().toISOString();
    if (current.count === 0) {
        delete config.warn_data[userKey];
    }
    else {
        config.warn_data[userKey] = current;
    }
    await updateGroupConfig(chatId, { warn_data: config.warn_data });
    return current.count === 0 ? null : current;
}
export async function resetGroupWarns(chatId, targetUserId) {
    const chatKey = String(chatId);
    const config = getGroupConfig(chatId);
    if (!config.warn_data)
        return true;
    if (targetUserId) {
        delete config.warn_data[String(targetUserId)];
    }
    else {
        config.warn_data = {}; // Reset all
    }
    await updateGroupConfig(chatId, { warn_data: config.warn_data });
    return true;
}
export function getGroupWarns(chatId, targetUserId) {
    const config = getGroupConfig(chatId);
    if (!config.warn_data)
        return { count: 0, reasons: [] };
    if (targetUserId) {
        return config.warn_data[String(targetUserId)] || { count: 0, reasons: [] };
    }
    return config.warn_data; // All warns in group
}
