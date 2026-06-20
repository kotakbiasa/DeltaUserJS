import { getGroupConfig, updateGroupConfig } from '../../../core/database.js';
import { isAdmin } from '../admin/admin_bot.js';

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
    if (await isGroupAdmin(ctx, userId) || isAdmin(userId)) {
      return next();
    }
    return ctx.reply('❌ Anda bukan admin.');
  };

  bot.command('addbl', modCheck, async (ctx) => {
    const word = ctx.match.trim().toLowerCase();
    if (!word) return ctx.reply('❌ Format: `/addbl <kata>`', { parse_mode: 'Markdown' });

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.blacklist) config.blacklist = [];
    
    if (config.blacklist.includes(word)) {
      return ctx.reply(`⚠️ Kata "${word}" sudah ada di blacklist.`);
    }

    config.blacklist.push(word);
    await updateGroupConfig(chatId, config);
    ctx.reply(`✅ Kata "${word}" berhasil ditambahkan ke blacklist.`);
  });

  bot.command('rmbl', modCheck, async (ctx) => {
    const word = ctx.match.trim().toLowerCase();
    if (!word) return ctx.reply('❌ Format: `/rmbl <kata>`', { parse_mode: 'Markdown' });

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.blacklist || !config.blacklist.includes(word)) {
      return ctx.reply(`⚠️ Kata "${word}" tidak ditemukan di blacklist.`);
    }

    config.blacklist = config.blacklist.filter(w => w !== word);
    await updateGroupConfig(chatId, config);
    ctx.reply(`✅ Kata "${word}" berhasil dihapus dari blacklist.`);
  });

  bot.command('listbl', modCheck, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    const bl = config.blacklist || [];

    if (bl.length === 0) {
      return ctx.reply('📋 Blacklist di grup ini kosong.');
    }

    ctx.reply(`📋 **Daftar Blacklist:**\n\n${bl.map(w => `- \`${w}\``).join('\n')}`, { parse_mode: 'Markdown' });
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
      if (isAdm || isAdmin(userId)) return next();
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
