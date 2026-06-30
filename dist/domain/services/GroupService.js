// @ts-nocheck
import { groupConfigCache, dbCache, persistField, isMongo, readDbFromFile, writeDbToFile } from '../../infrastructure/dbCore.js';
import { GroupConfigModel } from '../models/index.js';
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
            await GroupConfigModel.findOneAndUpdate({ chat_id: chatKey }, newData, { upsert: true, returnDocument: 'after' });
        }
        catch (e) {
            console.error('❌ MongoDB GroupConfig error:', e.message);
        }
    }
    else {
        const data = readDbFromFile();
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
    if (!config.notes)
        config.notes = {};
    config.notes[name] = text;
    await updateGroupConfig(chatId, { notes: config.notes });
    return true;
}
export async function deleteGroupNote(chatId, noteName) {
    const config = getGroupConfig(chatId);
    const name = String(noteName).toLowerCase();
    if (!config.notes || !config.notes[name])
        return false;
    delete config.notes[name];
    await updateGroupConfig(chatId, { notes: config.notes });
    return true;
}
export function getGroupNote(chatId, noteName) {
    const config = getGroupConfig(chatId);
    const name = String(noteName).toLowerCase();
    if (!config.notes)
        return null;
    return config.notes[name] || null;
}
export function getAllGroupNotes(chatId) {
    const config = getGroupConfig(chatId);
    if (!config.notes)
        return [];
    return Object.keys(config.notes);
}
export async function setChatLock(telegramId, chatId, lockType, enabled) {
    const idNum = Number(telegramId);
    const session = dbCache.get(idNum);
    if (!session)
        return null;
    const chatKey = String(chatId);
    if (!session.lock_config)
        session.lock_config = {};
    if (!session.lock_config[chatKey])
        session.lock_config[chatKey] = {};
    session.lock_config[chatKey][lockType] = enabled ? 1 : 0;
    await persistField(idNum, 'lock_config', session.lock_config);
    return session.lock_config[chatKey];
}
export function getChatLocks(telegramId, chatId) {
    const session = dbCache.get(Number(telegramId));
    return session?.lock_config?.[String(chatId)] || {};
}
