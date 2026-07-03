import { getBroadcastBlacklist } from '../../../infrastructure/database.js';
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
            const targetGroups = dialogs.filter(d => d.isGroup);
            const blacklist = getBroadcastBlacklist(telegramId);
            let successCount = 0;
            let failCount = 0;
            let skippedCount = 0;
            await message.edit({
                text: `<blockquote>🚀 <b>Memulai Global Broadcast!</b>\nTarget: ${targetGroups.length} Grup.\nMengirim secara perlahan agar aman dari batas Spam Telegram.</blockquote>`,
                parseMode: 'html'
            });
            for (const group of targetGroups) {
                // Ekstrak ID dari entitas dialog untuk dicocokkan dengan blacklist
                const chatIdStr = String(group.id);
                if (blacklist.includes(chatIdStr)) {
                    skippedCount++;
                    continue;
                }
                try {
                    if (repliedMsg) {
                        await client.sendMessage(group.id, {
                            message: broadcastMsg ? broadcastMsg : repliedMsg.message,
                            file: repliedMsg.media
                        });
                    }
                    else {
                        await client.sendMessage(group.id, {
                            message: broadcastMsg
                        });
                    }
                    successCount++;
                    // Delay wajib 2 detik per pesan untuk menghindari FloodWait
                    await new Promise(r => setTimeout(r, 2000));
                }
                catch (err) {
                    failCount++;
                }
            }
            await message.edit({
                text: `<blockquote>✅ <b>Global Broadcast Selesai!</b>\n\n` +
                    `📢 Terkirim ke: <b>${successCount} Grup</b>\n` +
                    `🛡️ Diabaikan (Blacklist): <b>${skippedCount} Grup</b>\n` +
                    `❌ Gagal kirim: <b>${failCount} Grup</b></blockquote>`,
                parseMode: 'html'
            });
        }
        catch (err) {
            console.error('Error in Gcast plugin:', err);
            await message.edit({
                text: `<blockquote>❌ <b>Gagal melakukan Broadcast:</b>\n<i>${err.message}</i></blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
