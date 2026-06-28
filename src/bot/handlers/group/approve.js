import { getGroupConfig, updateGroupConfig } from '../../../infrastructure/database.js';
import { isAdmin } from '../admin/admin_bot.js';
import { replyRich } from '../../../utils/richMessage.js';

async function isGroupAdmin(ctx, userId) {
  try {
    if (!ctx.chat) return false;
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerApproveHandlers(bot) {
  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isAdmin(userId)) {
      return next();
    }
    return replyRich(ctx, '❌ Anda bukan admin.');
  };

  bot.command('autoapprove', modCheck, async (ctx) => {
    const args = ctx.match.trim().toLowerCase();
    if (!['on', 'off'].includes(args)) {
      return replyRich(ctx, '❌ Format: `/autoapprove on` atau `/autoapprove off`', { markdown: true });
    }

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.autoapprove_enabled = (args === 'on');
    await updateGroupConfig(chatId, config);

    replyRich(ctx, `✅ Auto-Approve berhasil di-${args === 'on' ? 'aktifkan' : 'matikan'}. Bot akan otomatis menyetujui Chat Join Request.`);
  });

  bot.on('chat_join_request', async (ctx) => {
    const chatId = ctx.chatJoinRequest.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (config && config.autoapprove_enabled) {
      try {
        await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id);
      } catch (err) {
        console.error('Failed to auto-approve:', err);
      }
    }
  });
}
