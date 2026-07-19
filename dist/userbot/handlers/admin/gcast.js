import { getBroadcastBlacklist } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// Rate limiting: max 1 gcast per 60 seconds per user
const LAST_GCAST = new Map();
const GCAST_COOLDOWN_MS = 60_000; // 60 seconds
const MAX_GCAST_TARGETS = 50; // Max groups per broadcast
const MAX_MESSAGES_PER_MINUTE = 20; // Telegram API flood limit safety
// Periodic cleanup: remove stale entries (> 10 minutes old) every 5 minutes
// Since cooldown is 60s, entries older than 10 min are definitively stale.
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [uid, ts] of LAST_GCAST.entries()) {
        if (now - ts > 600_000) {
            LAST_GCAST.delete(uid);
            cleaned++;
        }
    }
    if (cleaned > 0)
        Logger.logSystem(`🧹 LAST_GCAST cleanup: removed ${cleaned} stale entries`, 'INFO');
}, 300_000).unref();
export default {
    name: 'gcast',
    help: {
        title: 'Global Broadcast (.gcast)',
        description: 'Mengirim pesan promosi atau pengumuman ke seluruh grup yang Anda ikuti secara otomatis.',
        usage: '• `.gcast <teks>`\n• Atau balas (reply) sebuah pesan/foto lalu ketik `.gcast`',
        detail: 'Modul ini akan mengabaikan grup yang ada di daftar Blacklist Anda. Sistem dilengkapi dengan Anti-Spam Delay untuk melindungi akun.'
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message)
            return;
        const text = message.message.trim();
        if (!text.toLowerCase().startsWith('.gcast'))
            return;
        const userId = Number(telegramId);
        // Rate limit: prevent spam gcast
        const lastGcast = LAST_GCAST.get(userId) || 0;
        const elapsed = Date.now() - lastGcast;
        if (elapsed < GCAST_COOLDOWN_MS) {
            const remaining = Math.ceil((GCAST_COOLDOWN_MS - elapsed) / 1000);
            await message.edit({
                text: `<blockquote>❌ <b>Rate Limit!</b> Tunggu <code>${escapeHtml(String(remaining))}</code> detik sebelum mengirim gcast lagi.</blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        let broadcastMsg = text.substring(6).trim();
        let repliedMsg = await message.getReplyMessage();
        if (!broadcastMsg && !repliedMsg) {
            await message.edit({
                text: `<blockquote>❌ <b>Gagal:</b> Harap masukkan teks pesan atau balas sebuah pesan untuk di-broadcast!</blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Mempersiapkan Global Broadcast...</b>\nSedang mengumpulkan data grup.</blockquote>`,
            parseMode: 'html'
        });
        try {
            // Ambil daftar semua obrolan
            const dialogs = await client.getDialogs();
            // Filter hanya grup dan supergrup (abaikan private chat dan channel broadcast)
            let targetGroups = dialogs.filter(d => d.isGroup);
            const blacklist = getBroadcastBlacklist(telegramId);
            let successCount = 0;
            let failCount = 0;
            let skippedCount = 0;
            // Cap target to prevent flooding
            if (targetGroups.length > MAX_GCAST_TARGETS) {
                targetGroups = targetGroups.slice(0, MAX_GCAST_TARGETS);
            }
            await message.edit({
                text: `<blockquote>🚀 <b>Memulai Global Broadcast!</b>\nTarget: ${escapeHtml(String(targetGroups.length))} Grup (maks ${escapeHtml(String(MAX_GCAST_TARGETS))}).\nMengirim secara perlahan agar aman dari batas Spam Telegram.</blockquote>`,
                parseMode: 'html'
            });
            for (let i = 0; i < targetGroups.length; i++) {
                const group = targetGroups[i];
                const chatIdStr = String(group.id);
                if (blacklist.includes(chatIdStr)) {
                    skippedCount++;
                    continue;
                }
                try {
                    if (repliedMsg) {
                        if (repliedMsg.media) {
                            // Forward media with its caption (or the override text) so the
                            // broadcast isn't an empty message. Passing the replied message
                            // as `file` lets GramJS resend the media payload correctly.
                            await client.sendFile(group.id, {
                                file: repliedMsg.media,
                                caption: broadcastMsg || repliedMsg.message || '',
                            });
                        }
                        else {
                            await client.sendMessage(group.id, {
                                message: broadcastMsg || repliedMsg.message,
                            });
                        }
                    }
                    else {
                        await client.sendMessage(group.id, { message: broadcastMsg });
                    }
                    successCount++;
                    // Dynamic delay: increase after every 10 messages to stay under Telegram limits
                    const delay = i >= MAX_MESSAGES_PER_MINUTE ? 5000 : 2000;
                    await new Promise(r => setTimeout(r, delay));
                }
                catch (err) {
                    failCount++;
                }
            }
            // Update last gcast timestamp
            LAST_GCAST.set(userId, Date.now());
            await message.edit({
                text: `<blockquote>✅ <b>Global Broadcast Selesai!</b>\n\n` +
                    `📢 Terkirim ke: <b>${escapeHtml(String(successCount))} Grup</b>\n` +
                    `🛡️ Diabaikan (Blacklist): <b>${escapeHtml(String(skippedCount))} Grup</b>\n` +
                    `❌ Gagal kirim: <b>${escapeHtml(String(failCount))} Grup</b></blockquote>`,
                parseMode: 'html'
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in Gcast plugin: ${err}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal melakukan Broadcast:</b>\n<i>${err.message}</i></blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
