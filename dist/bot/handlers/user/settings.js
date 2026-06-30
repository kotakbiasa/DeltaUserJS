import { getGroupConfig, updateGroupConfig } from '../../../infrastructure/database.js';
import { isAdmin } from '../admin/admin_bot.js';
import { replyRich, editRich } from '../../../utils/richMessage.js';
async function sendSettingsPanel(ctx, chatId, config, isEdit = false) {
    const text = `⚙️ <b>Pengaturan Grup</b>\nID: <code>${chatId}</code>\n\n` +
        `👋 Welcome: ${config.welcome_enabled ? '🟢 ON' : '🔴 OFF'}\n` +
        `🔗 Anti-Link: ${config.anti_link ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `<i>Untuk mengatur teks sambutan/aturan secara custom, fitur ini akan datang di pembaruan selanjutnya.</i>`;
    const keyboard = {
        inline_keyboard: [
            [{ text: `👋 Toggle Welcome`, callback_data: `grp_set:${chatId}:toggle_welcome` }],
            [{ text: `🔗 Toggle Anti-Link`, callback_data: `grp_set:${chatId}:toggle_antilink` }],
            [{ text: '❌ Tutup Panel', callback_data: `grp_set:${chatId}:close` }]
        ]
    };
    if (isEdit) {
        await editRich(ctx, text, { reply_markup: keyboard }).catch(() => { });
    }
    else {
        await replyRich(ctx, text, { reply_markup: keyboard }).catch(() => { });
    }
}
export function registerSettingsHandlers(bot) {
    // Callback dari tombol di PM Dashboard (Bantuan Manajemen)
    bot.callbackQuery('rich:group_help', async (ctx) => {
        await ctx.answerCallbackQuery();
        const helpText = `📚 <b>Bantuan Group Management</b>\n\n` +
            `<b>Moderasi:</b>\n` +
            `/ban - Banned member (balas pesan/ID)\n` +
            `/unban - Unban member\n` +
            `/mute - Mute member\n` +
            `/unmute - Unmute member\n` +
            `/kick - Tendang member\n` +
            `/pin - Sematkan pesan (balas pesan)\n` +
            `/unpin - Lepas sematan\n\n` +
            `<b>Pengaturan (Hanya di Grup):</b>\n` +
            `/settings - Buka panel konfigurasi grup\n` +
            `/rules - Lihat aturan grup`;
        await replyRich(ctx, helpText);
    });
    // Callback dari tombol di PM Dashboard (Pengaturan Grup)
    bot.callbackQuery('rich:group_settings', async (ctx) => {
        await ctx.answerCallbackQuery();
        await ctx.replyWithRichMessage({ html: `<blockquote>⚙️ <b>Cara Mengatur Grup:</b>\n\nTambahkan bot ini ke grup Anda, pastikan bot menjadi Admin, lalu ketik perintah <code>/settings</code> di dalam grup tersebut. Panel pengaturan interaktif akan muncul di sana.</blockquote>` });
    });
    // Command /settings di dalam grup
    bot.command('settings', async (ctx) => {
        if (ctx.chat.type === 'private') {
            return ctx.reply('❌ Perintah ini hanya bisa digunakan di dalam grup.');
        }
        if (!(await isAdmin(ctx))) {
            return ctx.reply('❌ Hanya admin grup yang dapat membuka pengaturan.');
        }
        const config = getGroupConfig(ctx.chat.id);
        await sendSettingsPanel(ctx, ctx.chat.id, config);
    });
    // Menangani klik tombol inline dari panel pengaturan grup
    bot.callbackQuery(/^grp_set:(.+):(.+)$/, async (ctx) => {
        const chatId = ctx.match[1];
        const action = ctx.match[2];
        // Verifikasi apakah yang mengklik tombol adalah admin di grup tersebut
        try {
            const member = await ctx.api.getChatMember(chatId, ctx.from.id);
            if (!['creator', 'administrator'].includes(member.status)) {
                return ctx.answerCallbackQuery({ text: '❌ Anda bukan admin di grup ini!', show_alert: true });
            }
        }
        catch (err) {
            return ctx.answerCallbackQuery({ text: '❌ Gagal memverifikasi status admin.', show_alert: true });
        }
        let config = getGroupConfig(chatId);
        if (action === 'toggle_welcome') {
            config = await updateGroupConfig(chatId, { welcome_enabled: config.welcome_enabled ? 0 : 1 });
            await ctx.answerCallbackQuery(`Welcome diubah menjadi ${config.welcome_enabled ? 'ON' : 'OFF'}`);
        }
        else if (action === 'toggle_antilink') {
            config = await updateGroupConfig(chatId, { anti_link: config.anti_link ? 0 : 1 });
            await ctx.answerCallbackQuery(`Anti-Link diubah menjadi ${config.anti_link ? 'ON' : 'OFF'}`);
        }
        else if (action === 'close') {
            await ctx.answerCallbackQuery();
            return ctx.deleteMessage().catch(() => { });
        }
        // Refresh panel setelah diubah
        await sendSettingsPanel(ctx, chatId, config, true);
    });
}
