import { dbCache, persistField } from '../../infrastructure/dbCore.js';
export async function saveSchedule(telegramId, chatKey, type, value, message) {
    const idNum = Number(telegramId);
    const session = dbCache.get(idNum);
    if (!session)
        return false;
    if (!session.schedules)
        session.schedules = [];
    const scheduleObj = {
        chatKey: String(chatKey),
        type: String(type),
        value,
        message,
        updatedAt: new Date().toISOString()
    };
    const existingIndex = session.schedules.findIndex(s => s.chatKey === String(chatKey) && s.type === String(type));
    if (existingIndex > -1) {
        session.schedules[existingIndex] = scheduleObj;
    }
    else {
        session.schedules.push(scheduleObj);
    }
    await persistField(idNum, 'schedules', session.schedules);
    return true;
}
export function getSchedules(telegramId) {
    const session = dbCache.get(Number(telegramId));
    return session?.schedules || [];
}
export async function deleteSchedule(telegramId, chatKey, type) {
    const idNum = Number(telegramId);
    const session = dbCache.get(idNum);
    if (!session)
        return false;
    if (!session.schedules) {
        session.schedules = [];
        return true;
    }
    session.schedules = session.schedules.filter(s => !(s.chatKey === String(chatKey) && s.type === String(type)));
    await persistField(idNum, 'schedules', session.schedules);
    return true;
}
