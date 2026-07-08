import { getBroadcastBlacklist } from '../../../infrastructure/database.js';
// Rate limiting: max 1 gcast per 60 seconds per user
const LAST_GCAST = new Map();
const GCAST_COOLDOWN_MS = 60_000; // 60 seconds
const MAX_GCAST_TARGETS = 50; // Max groups per broadcast
const MAX_MESSAGES_PER_MINUTE = 20; // Telegram API flood limit safety
export default {
    name: 'gcast',
    help: {
        title: 'Global Broadcast (.gcast)',
        description: 'Mengirim pesan promosi atau pengumuman ke seluruh grup yang Anda ikuti secara otomatis.',
        usage: '• `.gcast <teks>`\\n• Atau balas (reply) sebuah pesan/foto lalu ketik `.gcast`',
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
                text: `<blockquote>❌ <b>Rate Limit!</b> Tunggu <code>${remaining} detik</code> sebelum mengirim gcast lagi.</blockquote>`,
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
            text: `<blockquote>⏳ <b>Mempersiapkan Global Broadcast...</b>\\nSedang mengumpulkan data grup.</blockquote>`,
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
                text: `<blockquote>🚀 <b>Memulai Global Broadcast!</b>\\nTarget: ${targetGroups.length} Grup (maks ${MAX_GCAST_TARGETS}).\\nMengirim secara perlahan agar aman dari batas Spam Telegram.</blockquote>`,
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
                        const sendOpts = {
                            message: broadcastMsg ? broadcastMsg : repliedMsg.message,
                        };
                        // Only attach file if media actually exists
                        if (repliedMsg.media) {
                            sendOpts.message = ''; // If media, don't send text message
                        }
                        await client.sendMessage(group.id, sendOpts);
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
                text: `<blockquote>✅ <b>Global Broadcast Selesai!</b>\\n\\n` +
                    `📢 Terkirim ke: <b>${successCount} Grup</b>\\n` +
                    `🛡️ Diabaikan (Blacklist): <b>${skippedCount} Grup</b>\\n` +
                    `❌ Gagal kirim: <b>${failCount} Grup</b></blockquote>`,
                parseMode: 'html'
            });
        }
        catch (err) {
            console.error('Error in Gcast plugin:', err);
            await message.edit({
                text: `<blockquote>❌ <b>Gagal melakukan Broadcast:</b>\\n<i>${err.message}</i></blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
