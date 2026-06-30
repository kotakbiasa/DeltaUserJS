import { getGroupConfig, updateGroupConfig } from '../../../infrastructure/database.js';
import { isAdmin, isOwner } from '../admin/admin_bot.js';
import { replyRich } from '../../../utils/richMessage.js';

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerBlacklistHandlers(bot) {
  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isOwner(userId)) {
      return next();
    }
    return replyRich(ctx, '❌ Anda bukan admin.');
  };

  bot.command('addbl', modCheck, async (ctx) => {
    const word = ctx.match.trim().toLowerCase();
    if (!word) return replyRich(ctx, '❌ Format: `/addbl <kata>`', { markdown: true });

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.blacklist) config.blacklist = [];
    
    if (config.blacklist.includes(word)) {
      return replyRich(ctx, `⚠️ Kata "${word}" sudah ada di blacklist.`);
    }

    config.blacklist.push(word);
    await updateGroupConfig(chatId, config);
    replyRich(ctx, `✅ Kata "${word}" berhasil ditambahkan ke blacklist.`);
  });

  bot.command('rmbl', modCheck, async (ctx) => {
    const word = ctx.match.trim().toLowerCase();
    if (!word) return replyRich(ctx, '❌ Format: `/rmbl <kata>`', { markdown: true });

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.blacklist || !config.blacklist.includes(word)) {
      return replyRich(ctx, `⚠️ Kata "${word}" tidak ditemukan di blacklist.`);
    }

    config.blacklist = config.blacklist.filter(w => w !== word);
    await updateGroupConfig(chatId, config);
    replyRich(ctx, `✅ Kata "${word}" berhasil dihapus dari blacklist.`);
  });

  bot.command('listbl', modCheck, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    const bl = config.blacklist || [];

    if (bl.length === 0) {
      return replyRich(ctx, '📋 Blacklist di grup ini kosong.');
    }

    replyRich(ctx, `📋 **Daftar Blacklist:**\n\n${bl.map(w => `- \`${w}\``).join('\n')}`, { markdown: true });
  });

  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    const bl = config.blacklist || [];

    if (bl.length === 0) return next();

    const userId = ctx.from?.id;
    if (userId) {
      const isAdm = await isGroupAdmin(ctx, userId);
      if (isAdm || isOwner(userId)) return next();
    }

    const text = ctx.message.text.toLowerCase();
    const found = bl.some(word => text.includes(word));

    if (found) {
      try {
        await ctx.deleteMessage();
      } catch (err) {
        // failed to delete (maybe not admin)
      }
    } else {
      return next();
    }
  });
}
