import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
export default {
    name: 'clearnotif',
    version: '1.0.0',
    description: 'Membersihkan notifikasi angka tag/mention dan reaksi yang menumpuk.',
    help: {
        title: 'Clear Notifications',
        description: 'Membersihkan semua tag (mention) dan reaksi yang menumpuk agar notifikasi chat kembali bersih.',
        usage: '`.clear_@` - Bersihkan mention chat ini\n`.clear_all_@` - Bersihkan semua mention\n`.clear_reacts` - Bersihkan reaksi chat ini\n`.clear_all_reacts` - Bersihkan semua reaksi',
        detail: 'Berguna saat notifikasi angka tag/mention dan reaksi menumpuk terlalu banyak. Perintah ini akan menandai semuanya sudah dibaca.'
    },
    async execute(client, message, _settings, _telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const cmd = message.message.split(' ')[0].toLowerCase();
        const validCommands = ['.clear_@', '.clear_all_@', '.clear_reacts', '.clear_all_reacts'];
        if (!validCommands.includes(cmd)) {
            return;
        }
        // Helper untuk jeda waktu guna menghindari FloodWait
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        try {
            if (cmd === '.clear_@') {
                await message.delete().catch(() => { });
                await client.invoke(new Api.messages.ReadMentions({ peer: message.chatId }));
            }
            else if (cmd === '.clear_reacts') {
                await message.delete().catch(() => { });
                await client.invoke(new Api.messages.ReadReactions({ peer: message.chatId }));
            }
            else if (cmd === '.clear_all_@') {
                let counter = 0;
                await message.edit({ text: '⏳ <b>Menyapu bersih semua mention (tag)...</b>', parseMode: 'html' });
                const dialogs = await client.getDialogs();
                for (const dialog of dialogs) {
                    // Hanya bersihkan jika benar-benar ada mention yang belum dibaca
                    if (dialog.unreadMentionsCount > 0) {
                        await client.invoke(new Api.messages.ReadMentions({ peer: dialog.entity || dialog.id }));
                        counter++;
                        // Update pesan hanya per 5 pembersihan & beri jeda agar TIDAK terkena FloodWait
                        if (counter % 5 === 0) {
                            await message.edit({ text: `⏳ <b>Menyapu bersih semua mention (tag)...</b>\n\n✅ <b>Dibersihkan:</b> <code>${escapeHtml(String(counter))}</code> chat`, parseMode: 'html' }).catch(() => { });
                            await sleep(1500);
                        }
                    }
                }
                await message.edit({ text: `<blockquote>🧹 <b>Selesai!</b> ${escapeHtml(String(counter))} grup/chat dengan mention telah dibersihkan.</blockquote>`, parseMode: 'html' });
            }
            else if (cmd === '.clear_all_reacts') {
                let counter = 0;
                await message.edit({ text: '⏳ <b>Menyapu bersih semua reaksi...</b>', parseMode: 'html' });
                const dialogs = await client.getDialogs();
                for (const dialog of dialogs) {
                    // Hanya bersihkan chat yang berpotensi memiliki reaksi belum dibaca
                    if (dialog.unreadMark || dialog.unreadCount > 0) {
                        try {
                            await client.invoke(new Api.messages.ReadReactions({ peer: dialog.entity || dialog.id }));
                            counter++;
                            if (counter % 5 === 0) {
                                await message.edit({ text: `⏳ <b>Menyapu bersih semua reaksi...</b>\n\n✅ <b>Dibersihkan:</b> <code>${escapeHtml(String(counter))}</code> chat`, parseMode: 'html' }).catch(() => { });
                                await sleep(1500);
                            }
                        }
                        catch (_err) {
                            // Abaikan error pada entitas yang tidak mendukung ReadReactions
                        }
                    }
                }
                await message.edit({ text: `<blockquote>🧹 <b>Selesai!</b> ${escapeHtml(String(counter))} grup/chat dengan reaksi telah dibersihkan.</blockquote>`, parseMode: 'html' });
            }
        }
        catch (err) {
            await message.edit({ text: `<blockquote>❌ <b>Terjadi kesalahan:</b> ${escapeHtml(err.message)}</blockquote>`, parseMode: 'html' });
        }
    }
};
