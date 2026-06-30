import { isOwner } from '../admin/admin_bot.js';
// Helper to check if a user is admin in the group
async function isGroupAdmin(ctx, userId) {
    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, userId);
        return ['creator', 'administrator'].includes(member.status);
    }
    catch (err) {
        return false;
    }
}
// Helper to check if bot has permission
async function botHasPermission(ctx, perm) {
    try {
        const me = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id);
        if (me.status === 'creator')
            return true;
        if (me.status === 'administrator') {
            if (perm === 'ban')
                return me.can_restrict_members;
            if (perm === 'pin')
                return me.can_pin_messages;
            return true;
        }
        return false;
    }
    catch (err) {
        return false;
    }
}
export function registerModerationHandlers(bot) {
    // Common check for all moderation commands
    const modCheck = async (ctx, next) => {
        if (ctx.chat.type === 'private') {
            return ctx.reply('❌ Perintah ini hanya bisa digunakan di grup.');
        }
        const userId = ctx.from?.id;
        if (!userId)
            return;
        const isAdminMember = await isGroupAdmin(ctx, userId);
        const isBotOwner = isOwner(userId);
        if (!isAdminMember && !isBotOwner) {
            return ctx.reply('❌ Anda bukan admin grup ini.');
        }
        return next();
    };
    const getTarget = (ctx) => {
        if (ctx.message.reply_to_message) {
            return ctx.message.reply_to_message.from.id;
        }
        const text = ctx.match.trim();
        if (text && !isNaN(text)) {
            return parseInt(text, 10);
        }
        return null;
    };
    bot.command('ban', modCheck, async (ctx) => {
        const targetId = getTarget(ctx);
        if (!targetId)
            return ctx.reply('❌ Balas pesan pengguna atau ketikkan ID untuk di-ban.');
        if (!(await botHasPermission(ctx, 'ban')))
            return ctx.reply('❌ Bot tidak memiliki hak untuk memblokir pengguna.');
        try {
            await ctx.banChatMember(targetId);
            ctx.reply(`✅ Berhasil memblokir (Ban) pengguna ID: ${targetId}`);
        }
        catch (e) {
            ctx.reply('❌ Gagal memblokir pengguna. Pastikan jabatan bot lebih tinggi darinya.');
        }
    });
    bot.command('unban', modCheck, async (ctx) => {
        const targetId = getTarget(ctx);
        if (!targetId)
            return ctx.reply('❌ Balas pesan pengguna atau ketikkan ID untuk di-unban.');
        if (!(await botHasPermission(ctx, 'ban')))
            return ctx.reply('❌ Bot tidak memiliki hak admin.');
        try {
            await ctx.unbanChatMember(targetId);
            ctx.reply(`✅ Berhasil membuka blokir (Unban) pengguna ID: ${targetId}`);
        }
        catch (e) {
            ctx.reply('❌ Gagal membuka blokir.');
        }
    });
    bot.command('kick', modCheck, async (ctx) => {
        const targetId = getTarget(ctx);
        if (!targetId)
            return ctx.reply('❌ Balas pesan pengguna atau ketikkan ID untuk di-kick.');
        if (!(await botHasPermission(ctx, 'ban')))
            return ctx.reply('❌ Bot tidak memiliki hak admin.');
        try {
            await ctx.unbanChatMember(targetId); // in TG, unban = kick
            ctx.reply(`✅ Berhasil menendang (Kick) pengguna ID: ${targetId}`);
        }
        catch (e) {
            ctx.reply('❌ Gagal menendang pengguna.');
        }
    });
    bot.command('mute', modCheck, async (ctx) => {
        const targetId = getTarget(ctx);
        if (!targetId)
            return ctx.reply('❌ Balas pesan pengguna untuk di-mute.');
        if (!(await botHasPermission(ctx, 'ban')))
            return ctx.reply('❌ Bot tidak memiliki hak admin.');
        try {
            await ctx.restrictChatMember(targetId, {
                permissions: { can_send_messages: false }
            });
            ctx.reply(`✅ Berhasil membisukan (Mute) pengguna ID: ${targetId}`);
        }
        catch (e) {
            ctx.reply('❌ Gagal membisukan pengguna.');
        }
    });
    bot.command('unmute', modCheck, async (ctx) => {
        const targetId = getTarget(ctx);
        if (!targetId)
            return ctx.reply('❌ Balas pesan pengguna untuk di-unmute.');
        if (!(await botHasPermission(ctx, 'ban')))
            return ctx.reply('❌ Bot tidak memiliki hak admin.');
        try {
            await ctx.restrictChatMember(targetId, {
                permissions: {
                    can_send_messages: true,
                    can_send_audios: true,
                    can_send_documents: true,
                    can_send_photos: true,
                    can_send_videos: true,
                    can_send_video_notes: true,
                    can_send_voice_notes: true,
                    can_send_polls: true,
                    can_send_other_messages: true,
                    can_add_web_page_previews: true
                }
            });
            ctx.reply(`✅ Berhasil membuka bisu (Unmute) pengguna ID: ${targetId}`);
        }
        catch (e) {
            ctx.reply('❌ Gagal membuka bisu pengguna.');
        }
    });
    bot.command('pin', modCheck, async (ctx) => {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ Balas pesan yang ingin disematkan.');
        }
        if (!(await botHasPermission(ctx, 'pin')))
            return ctx.reply('❌ Bot tidak memiliki hak pin.');
        try {
            await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
            ctx.reply('✅ Pesan berhasil disematkan.');
        }
        catch (e) {
            ctx.reply('❌ Gagal menyematkan pesan.');
        }
    });
    bot.command('unpin', modCheck, async (ctx) => {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ Balas pesan yang ingin dilepas pinnya, atau ketik /unpinall.');
        }
        if (!(await botHasPermission(ctx, 'pin')))
            return ctx.reply('❌ Bot tidak memiliki hak pin.');
        try {
            await ctx.unpinChatMessage(ctx.message.reply_to_message.message_id);
            ctx.reply('✅ Pesan berhasil dilepas sematannya.');
        }
        catch (e) {
            ctx.reply('❌ Gagal melepas sematan pesan.');
        }
    });
    bot.command('unpinall', modCheck, async (ctx) => {
        if (!(await botHasPermission(ctx, 'pin')))
            return ctx.reply('❌ Bot tidak memiliki hak pin.');
        try {
            await ctx.unpinAllChatMessages();
            ctx.reply('✅ Semua pesan sematan berhasil dihapus.');
        }
        catch (e) {
            ctx.reply('❌ Gagal menghapus sematan.');
        }
    });
    bot.command('del', modCheck, async (ctx) => {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ Balas pesan yang ingin dihapus.');
        }
        try {
            await ctx.api.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
            await ctx.deleteMessage().catch(() => { }); // delete the /del command too
        }
        catch (e) {
            ctx.reply('❌ Gagal menghapus pesan. Pastikan bot adalah admin dengan hak hapus pesan.');
        }
    });
    bot.command('purge', modCheck, async (ctx) => {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ Balas pesan pertama yang ingin dihapus untuk memulai purge.');
        }
        const startId = ctx.message.reply_to_message.message_id;
        const endId = ctx.message.message_id;
        let messageIds = [];
        for (let i = startId; i <= endId; i++) {
            messageIds.push(i);
        }
        // Telegram API allows deleting up to 100 messages at once
        try {
            const thinkingMsg = await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Menyapu bersih ${messageIds.length} pesan...</blockquote>` });
            // Split into chunks of 100
            for (let i = 0; i < messageIds.length; i += 100) {
                const chunk = messageIds.slice(i, i + 100);
                await ctx.api.deleteMessages(ctx.chat.id, chunk).catch(() => { });
            }
            await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => { });
            const msg = await ctx.reply(`✅ Berhasil menghapus ${messageIds.length} pesan secara permanen.`);
            // Delete success message after 3 seconds
            setTimeout(() => {
                ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { });
            }, 3000);
        }
        catch (e) {
            ctx.reply('❌ Terjadi kesalahan saat menghapus (Purge) pesan.');
        }
    });
}
