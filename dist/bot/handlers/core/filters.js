import { getGroupConfig } from '../../../infrastructure/database.js';
import { isAdmin } from '../admin/admin_bot.js';
export function registerFilterHandlers(bot) {
    // Command untuk melihat aturan grup
    bot.command('rules', async (ctx) => {
        if (ctx.chat.type === 'private')
            return;
        const config = getGroupConfig(ctx.chat.id);
        if (!config)
            return;
        await ctx.replyWithRichMessage({ html: `<blockquote>📜 <b>Aturan Grup:</b>\n\n${config.rules_text}</blockquote>` });
    });
    // Middleware / event listener untuk teks masuk (Anti-Link)
    bot.on('message:text', async (ctx, next) => {
        if (ctx.chat.type === 'private')
            return next();
        const config = getGroupConfig(ctx.chat.id);
        if (config && config.anti_link) {
            const text = ctx.message.text.toLowerCase();
            const hasLink = text.includes('http://') || text.includes('https://') || text.includes('t.me/');
            if (hasLink) {
                // Jika pengirim bukan admin, hapus pesannya
                const senderIsAdmin = await isAdmin(ctx);
                if (!senderIsAdmin) {
                    try {
                        await ctx.deleteMessage();
                        const warnMsg = await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br><b>${ctx.from.first_name}</b>, dilarang mengirim link di grup ini!</blockquote>` });
                        // Hapus pesan peringatan setelah 5 detik agar grup tidak kotor
                        setTimeout(() => {
                            ctx.api.deleteMessage(ctx.chat.id, warnMsg.message_id).catch(() => { });
                        }, 5000);
                    }
                    catch (e) {
                        // Error biasanya terjadi jika bot tidak punya hak admin untuk menghapus pesan
                    }
                    return; // Stop eksekusi agar command lain tidak berjalan pada pesan spam ini
                }
            }
        }
        // Lanjutkan ke handler lain jika aman
        return next();
    });
}
