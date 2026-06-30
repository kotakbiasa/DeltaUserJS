import { isOwner } from '../admin/admin_bot.js';
async function isGroupAdmin(ctx, userId) {
    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, userId);
        return ['creator', 'administrator'].includes(member.status);
    }
    catch (err) {
        return false;
    }
}
export function registerZombiesHandlers(bot) {
    const modCheck = async (ctx, next) => {
        if (ctx.chat.type === 'private')
            return;
        const userId = ctx.from?.id;
        if (!userId)
            return;
        if (await isGroupAdmin(ctx, userId) || isOwner(userId)) {
            return next();
        }
        return ctx.reply('❌ Anda bukan admin.');
    };
    bot.command('zombies', modCheck, async (ctx) => {
        // Standard Telegram Bot API doesn't have a method to get all members of a supergroup.
        // We can only check administrators, or users we already know about.
        await ctx.reply('🧟‍♂️ **Info Pemburu Zombie**\n\n' +
            'Sistem Bot Telegram resmi (Master Bot) tidak diberikan izin oleh Telegram untuk mengambil seluruh daftar member grup.\n\n' +
            'Untuk menyapu bersih akun "Deleted Account", **gunakan perintah `.zombies` dari akun Userbot kamu**. Userbot memiliki jalur akses khusus (MTProto) yang mampu mendeteksi dan menendang ribuan zombie sekaligus! 🚀', { parse_mode: 'Markdown' });
    });
}
