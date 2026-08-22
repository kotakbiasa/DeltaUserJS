import { getChatSettings, updateChatSettings, getReputation, updateReputation } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { isTestEnv } from '../../../utils/env.js';
import { Logger } from '../../../utils/logger.js';
// Key: telegramId_chatId_voterId_targetId -> last voted timestamp
const cooldownMap = new Map();
// Periodic cleanup: remove stale cooldown entries (> 24 hours old) every 10 minutes
setInterval(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    let cleaned = 0;
    for (const [key, timestamp] of cooldownMap.entries()) {
        if (now - timestamp > oneDay) {
            cooldownMap.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        Logger.logSystem(`🧹 CooldownMap cleanup: removed ${cleaned} stale entries`, 'INFO');
    }
}, 10 * 60 * 1000); // every 10 minutes
export default {
    name: 'reputation',
    help: {
        title: 'Reputation System',
        description: 'Memberikan reputasi positif (+rep) atau negatif (-rep) kepada pengguna lain dengan membalas pesan mereka.',
        usage: '• Balas pesan target dengan: <code>+rep</code> atau <code>-rep</code>\n• `.reputation [userId]` (Lihat reputasi)\n• `.reps` (Lihat leaderboard)\n• `.setrepfloor <angka>` (Batas bawah reputasi)',
        detail: 'Mencegah pemungutan suara berulang (cooldown) dan pemungutan suara mandiri (self-vote).'
    },
    async execute(client, message, settings, telegramId) {
        const chatId = message.chatId;
        const _chatKey = String(chatId);
        // --- 1. Handle Settings & Query Commands ---
        if (message.out && message.message) {
            const text = message.message.trim();
            const args = text.split(/\s+/);
            const cmd = args[0].toLowerCase();
            if (cmd === '.setrepfloor') {
                if (args.length < 2) {
                    return;
                }
                const floor = parseInt(args[1]);
                if (isNaN(floor)) {
                    return;
                }
                await updateChatSettings(telegramId, chatId, 'rep_floor', floor);
                await message.edit({ text: `✅ <b>Berhasil:</b> Batas bawah reputasi diubah menjadi: <b>${escapeHtml(String(floor))}</b>`, parseMode: 'html' });
                return;
            }
            else if (cmd === '.setlogchannel') {
                if (args.length < 2) {
                    return;
                }
                const logChannel = args[1];
                await updateChatSettings(telegramId, chatId, 'log_channel', logChannel);
                await message.edit({ text: `✅ <b>Berhasil:</b> Channel log diubah menjadi: <code>${escapeHtml(logChannel)}</code>`, parseMode: 'html' });
                return;
            }
            else if (cmd === '.reputation') {
                if (args.length >= 2 && ['on', 'off'].includes(args[1].toLowerCase())) {
                    const val = args[1].toLowerCase() === 'on';
                    await updateChatSettings(telegramId, chatId, 'reputation', val);
                    await message.edit({ text: `✅ Fitur Reputation di chat ini diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
                    return;
                }
                let targetId = null;
                if (args.length >= 2) {
                    targetId = Number(args[1]);
                }
                else {
                    const replied = await message.getReplyMessage();
                    if (replied) {
                        targetId = Number(replied.senderId);
                    }
                }
                if (!targetId) {
                    await message.edit({ text: `❌ <b>Gagal:</b> Harap tentukan user ID atau balas pesan pengguna!`, parseMode: 'html' });
                    return;
                }
                const rep = getReputation(telegramId, targetId);
                let name = `User_${targetId}`;
                try {
                    const userEntity = await client.getEntity(targetId);
                    name = userEntity.firstName || userEntity.username || `User_${targetId}`;
                }
                catch (_e) { /* ignore: use default name */ }
                await message.edit({
                    text: `ℹ️ <b>Reputasi Pengguna:</b>\n` +
                        `<blockquote>` +
                        `Nama: <b>${name}</b>\n` +
                        `ID: <code>${targetId}</code>\n` +
                        `Skor Reputasi: <b>${rep}</b>` +
                        `</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            else if (cmd === '.reps') {
                const db = await import('../../../infrastructure/database.js');
                const session = db.getUserbotSession(telegramId);
                const repData = session?.reputation_data || {};
                const list = [];
                for (const [uId, score] of Object.entries(repData)) {
                    if (Number(score) !== 0) {
                        list.push({ userId: Number(uId), score: Number(score) });
                    }
                }
                if (list.length === 0) {
                    await message.edit({ text: `<blockquote>ℹ️ <b>Info:</b> Belum ada data Reputasi di database.</blockquote>`, parseMode: 'html' });
                    return;
                }
                // Sort descending
                list.sort((a, b) => b.score - a.score);
                let textList = `🏆 <b>Leaderboard Reputasi Teratas:</b>\n\n`;
                let i = 1;
                for (const entry of list) {
                    let name = `User_${entry.userId}`;
                    try {
                        const userEntity = await client.getEntity(entry.userId);
                        name = userEntity.firstName || userEntity.username || `User_${entry.userId}`;
                    }
                    catch (_e) { /* ignore: use default name */ }
                    textList += `${i}. <b>${escapeHtml(name)}</b> (ID: <code>${escapeHtml(String(entry.userId))}</code>) — <b>${entry.score} rep</b>\n`;
                    i++;
                }
                await message.edit({ text: textList, parseMode: 'html' });
                return;
            }
        }
        // --- 2. Handle Upvote / Downvote Replies ---
        if (!message.message) {
            return;
        }
        const text = message.message.toLowerCase().trim();
        const isUpvote = text === '+' || text.startsWith('+rep');
        const isDownvote = text === '-' || text.startsWith('-rep');
        if (isUpvote || isDownvote) {
            const chatSettings = getChatSettings(telegramId, chatId);
            const repEnabled = chatSettings.reputation !== undefined ? chatSettings.reputation : isTestEnv;
            if (!repEnabled) {
                return;
            }
            const replied = await message.getReplyMessage();
            if (!replied) {
                return;
            }
            const senderId = message.senderId;
            const targetId = replied.senderId;
            if (!senderId || !targetId) {
                return;
            }
            // Block self-voting
            if (senderId === targetId) {
                return;
            }
            // Cooldown check (30 seconds)
            const voterKey = `${telegramId}_${chatId}_${senderId}_${targetId}`;
            const lastVoteTime = cooldownMap.get(voterKey) || 0;
            if (Date.now() - lastVoteTime < 30000) {
                return;
            }
            cooldownMap.set(voterKey, Date.now());
            const currentRep = getReputation(telegramId, targetId);
            let newRep = currentRep + (isUpvote ? 1 : -1);
            // Floor check
            const floor = chatSettings.rep_floor !== undefined ? Number(chatSettings.rep_floor) : -Infinity;
            if (newRep < floor) {
                newRep = floor;
            }
            await updateReputation(telegramId, targetId, newRep);
            let targetName = `User_${targetId}`;
            try {
                const targetEntity = await client.getEntity(targetId);
                targetName = targetEntity.firstName || targetEntity.username || `User_${targetId}`;
            }
            catch (_e) { /* ignore: use default name */ }
            let voterName = `User_${senderId}`;
            try {
                const voterEntity = await client.getEntity(senderId);
                voterName = voterEntity.firstName || voterEntity.username || `User_${senderId}`;
            }
            catch (_e) { /* ignore: use default name */ }
            // Reply confirmation in chat
            await client.sendMessage(message.peerId, {
                message: `📢 <b>Reputasi Terupdate!</b>\n` +
                    `<blockquote>` +
                    `User <b>${targetName}</b> telah di-${isUpvote ? 'upvote' : 'downvote'} oleh <b>${voterName}</b>.\n` +
                    `Total Reputasi: <b>${newRep}</b>` +
                    `</blockquote>`
            });
            // Log to log channel if configured
            if (chatSettings.logging === true && chatSettings.log_channel) {
                try {
                    await client.sendMessage(Number(chatSettings.log_channel), {
                        message: `🔔 <b>Reputasi Log</b>\n` +
                            `<blockquote>` +
                            `Target: <b>${targetName}</b> (ID: <code>${targetId}</code>)\n` +
                            `Pemberi: <b>${voterName}</b> (ID: <code>${senderId}</code>)\n` +
                            `Aksi: ${isUpvote ? 'Upvote (+)' : 'Downvote (-)'}\n` +
                            `Total Skor: <b>${newRep}</b>` +
                            `</blockquote>`
                    });
                }
                catch (err) {
                    Logger.logUser(telegramId, `❌ Failed to send Reputation log to channel ${chatSettings.log_channel}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                }
            }
        }
    }
};
