import { getGroupConfig, updateGroupConfig } from '../../../core/database.js';
import { parseRichText } from '../../../utils/richParser.js';
import { isAdmin } from '../admin/admin_bot.js';

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerWelcomeHandlers(bot) {
  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isAdmin(userId)) {
      return next();
    }
    return ctx.reply('❌ Anda bukan admin.');
  };

  // Enable/Disable Welcome
  bot.command('welcome', modCheck, async (ctx) => {
    const args = ctx.match.trim().toLowerCase();
    if (!['on', 'off'].includes(args)) {
      return ctx.reply('❌ Format: `/welcome on` atau `/welcome off`', { parse_mode: 'Markdown' });
    }
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.welcome_enabled = (args === 'on' ? 1 : 0);
    await updateGroupConfig(chatId, config);
    ctx.reply(`Pesan Welcome berhasil di-${args === 'on' ? 'aktifkan' : 'matikan'}.`);
  });

  // Set Welcome Message
  bot.command('setwelcome', modCheck, async (ctx) => {
    const text = ctx.match.trim();
    if (!text) {
      return ctx.reply('❌ Berikan pesan welcome.\nContoh: `/setwelcome Halo {first_name} di {chat_title}! [Aturan](buttonurl://google.com)`', { parse_mode: 'Markdown' });
    }
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.welcome_text = text;
    await updateGroupConfig(chatId, config);
    ctx.reply('✅ Pesan Welcome berhasil diatur!');
  });

  // Set Goodbye Message
  bot.command('setgoodbye', modCheck, async (ctx) => {
    const text = ctx.match.trim();
    if (!text) {
      return ctx.reply('❌ Berikan pesan goodbye.\nContoh: `/setgoodbye Selamat tinggal {first_name}.`', { parse_mode: 'Markdown' });
    }
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.goodbye_text = text;
    await updateGroupConfig(chatId, config);
    ctx.reply('✅ Pesan Goodbye berhasil diatur!');
  });

  bot.on('message:new_chat_members', async (ctx, next) => {
    const config = getGroupConfig(ctx.chat.id);
    if (!config || !config.welcome_enabled) return next();

    for (const member of ctx.message.new_chat_members) {
      if (member.id === ctx.me.id) {
        await ctx.reply(`<blockquote>Terima kasih telah menambahkan saya ke grup! Jadikan saya Admin agar fitur moderasi berfungsi optimal.</blockquote>`, { parse_mode: 'HTML' }).catch(()=>{});
        continue;
      }
      
      const { text, keyboard } = parseRichText(config.welcome_text, member, ctx.chat);
      const options = { parse_mode: 'Markdown' };
      if (keyboard) options.reply_markup = keyboard;
        
      await ctx.reply(text, options).catch(() => {});
    }
    return next();
  });

  bot.on('message:left_chat_member', async (ctx, next) => {
    const config = getGroupConfig(ctx.chat.id);
    if (!config || !config.welcome_enabled) return next();

    const member = ctx.message.left_chat_member;
    if (member.id === ctx.me.id) return next();

    const { text, keyboard } = parseRichText(config.goodbye_text, member, ctx.chat);
    const options = { parse_mode: 'Markdown' };
    if (keyboard) options.reply_markup = keyboard;
      
    await ctx.reply(text, options).catch(() => {});
    return next();
  });
}
