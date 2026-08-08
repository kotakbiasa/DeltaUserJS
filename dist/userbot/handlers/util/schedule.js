import { saveSchedule, deleteSchedule } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// Map untuk menyimpan status loop per akun telegram
// Struktur: telegramId -> Map<chatId, { intervalId, message, minutes, startedAt }>
export const loopStore = new Map();
/**
 * Memulai loop pesan untuk chatId tertentu.
 */
export function startLoop(client, telegramId, chatId, minutes, loopMessage, saveToDb = false) {
    const idNum = Number(telegramId);
    if (!loopStore.has(idNum)) {
        loopStore.set(idNum, new Map());
    }
    const myLoops = loopStore.get(idNum);
    const chatKey = String(chatId);
    // Hentikan loop lama jika ada di chat ini
    if (myLoops.has(chatKey)) {
        clearInterval(myLoops.get(chatKey).intervalId);
    }
    // Kirim pesan pertama kali secara langsung agar instan
    client.sendMessage(chatId, { message: loopMessage }).catch(err => {
        Logger.logUser(idNum, `Failed to send initial loop message: ${err.message}`, 'ERROR');
    });
    // Mulai interval baru
    const ms = minutes * 60 * 1000;
    const intervalId = setInterval(async () => {
        try {
            await client.sendMessage(chatId, {
                message: loopMessage
            });
        }
        catch (err) {
            Logger.logUser(idNum, `Loop Error [${chatKey}]: ${err.message}`, 'ERROR');
        }
    }, ms);
    myLoops.set(chatKey, {
        intervalId,
        message: loopMessage,
        minutes: minutes,
        startedAt: new Date()
    });
    if (saveToDb) {
        saveSchedule(idNum, chatKey, 'loop', minutes, loopMessage).catch(err => {
            Logger.logUser(idNum, `Failed to save schedule to DB: ${err.message}`, 'ERROR');
        });
    }
}
/**
 * Menghentikan loop pesan untuk chatId tertentu.
 */
export function stopLoop(telegramId, chatId, deleteFromDb = false) {
    const idNum = Number(telegramId);
    const myLoops = loopStore.get(idNum);
    if (!myLoops) {
        return false;
    }
    const chatKey = String(chatId);
    if (myLoops.has(chatKey)) {
        clearInterval(myLoops.get(chatKey).intervalId);
        myLoops.delete(chatKey);
        if (deleteFromDb) {
            deleteSchedule(idNum, chatKey, 'loop').catch(err => {
                Logger.logUser(idNum, `Failed to delete schedule from DB: ${err.message}`, 'ERROR');
            });
        }
        return true;
    }
    return false;
}
/**
 * Menghentikan semua loop untuk akun tertentu. Dipanggil saat userbot
 * disconnect/stop/crash agar tidak ada interval yang bocor.
 */
export function stopAllLoops(telegramId) {
    const idNum = Number(telegramId);
    const myLoops = loopStore.get(idNum);
    if (!myLoops) {
        return 0;
    }
    let count = 0;
    for (const [chatKey, data] of myLoops.entries()) {
        clearInterval(data.intervalId);
        myLoops.delete(chatKey);
        count++;
    }
    loopStore.delete(idNum);
    return count;
}
export default {
    name: 'schedule',
    help: {
        title: 'Schedule / Auto Post',
        description: 'Mengirimkan pesan secara otomatis dan berulang di sebuah obrolan (Loop). Sangat berguna untuk broadcast promosi atau keperluan roleplay.',
        usage: '• `.loop <menit> <pesan>` (Mulai loop)\n• `.rmloop` (Hentikan loop di chat ini)\n• `.listloop` (Lihat semua loop berjalan)',
        detail: 'Pesan loop disimpan di database dan akan dipulihkan otomatis ketika bot direstart.'
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const text = message.message.trim();
        const args = text.split(/\s+/);
        const cmd = args[0].toLowerCase();
        if (!['.loop', '.rmloop', '.listloop'].includes(cmd)) {
            return;
        }
        const chatId = message.chatId;
        const _chatKey = String(chatId);
        const idNum = Number(telegramId);
        if (!loopStore.has(idNum)) {
            loopStore.set(idNum, new Map());
        }
        const myLoops = loopStore.get(idNum);
        if (cmd === '.loop') {
            if (args.length < 3) {
                await message.edit({
                    text: `<blockquote>❌ <b>Format Salah:</b>\nPenggunaan: <code>.loop &lt;menit&gt; &lt;pesan&gt;</code>\nContoh: <code>.loop 10 Halo semua!</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const minutes = parseInt(args[1]);
            if (isNaN(minutes) || minutes < 1) {
                await message.edit({
                    text: `<blockquote>❌ <b>Menit Tidak Valid:</b> Harap masukkan angka menit minimal 1.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const loopMessage = text.substring(cmd.length + args[1].length + 2).trim();
            // Start loop in-memory
            startLoop(client, telegramId, chatId, minutes, loopMessage, false);
            // Persist synchronously to DB
            await saveSchedule(telegramId, chatId, 'loop', minutes, loopMessage);
            await message.edit({
                text: `<blockquote>🔁 <b>Loop Aktif!</b>\n\nBot akan otomatis mengirimkan pesan setiap <b>${escapeHtml(String(minutes))} menit</b> di obrolan ini.\n\nKetik <code>.rmloop</code> untuk menghentikan.</blockquote>`,
                parseMode: 'html'
            });
        }
        else if (cmd === '.rmloop') {
            const stopped = stopLoop(telegramId, chatId, false);
            await deleteSchedule(telegramId, chatId, 'loop');
            if (stopped) {
                await message.edit({
                    text: `<blockquote>⏹️ <b>Loop Dihentikan!</b>\nPesan otomatis di obrolan ini telah dimatikan.</blockquote>`,
                    parseMode: 'html'
                });
            }
            else {
                await message.edit({
                    text: `<blockquote>ℹ️ <b>Info:</b> Tidak ada loop yang berjalan di obrolan ini.</blockquote>`,
                    parseMode: 'html'
                });
            }
        }
        else if (cmd === '.listloop') {
            if (myLoops.size === 0) {
                await message.edit({
                    text: `<blockquote>ℹ️ <b>Info:</b> Anda tidak memiliki loop yang sedang berjalan.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            let listText = `<blockquote>🔁 <b>Daftar Loop Aktif Anda:</b>\n\n`;
            let i = 1;
            for (const [id, data] of myLoops.entries()) {
                const shortMsg = data.message.length > 20 ? data.message.substring(0, 20) + '...' : data.message;
                listText += `<b>${i}. Chat ID:</b> <code>${escapeHtml(String(id))}</code>\n`;
                listText += `├ Interval: ${escapeHtml(String(data.minutes))} menit\n`;
                listText += `└ Pesan: <i>"${escapeHtml(shortMsg)}"</i>\n\n`;
                i++;
            }
            listText += `</blockquote>`;
            await message.edit({
                text: listText,
                parseMode: 'html'
            });
        }
    }
};
