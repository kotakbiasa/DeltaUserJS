import { getGroupConfig, updateGroupConfig } from '../../../infrastructure/database.js';
import { isAdmin } from '../admin/admin_bot.js';
import { replyRich } from '../../../utils/richMessage.js';

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerLocksHandlers(bot) {
  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isAdmin(userId)) {
      return next();
    }
    return replyRich(ctx, '❌ Anda bukan admin.');
  };

  const validLocks = ['url', 'forward', 'sticker', 'arabic', 'bots'];

  bot.command('lock', modCheck, async (ctx) => {
    const args = ctx.match.trim().toLowerCase();
    if (!validLocks.includes(args)) {
      return replyRich(ctx, `❌ Kunci tidak valid. Pilih: \`${validLocks.join(', ')}\``, { markdown: true });
    }

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.locks) config.locks = {};
    
    config.locks[args] = 1;
    await updateGroupConfig(chatId, config);

    replyRich(ctx, `🔒 Gembok \`${args}\` berhasil diaktifkan.`, { markdown: true });
  });

  bot.command('unlock', modCheck, async (ctx) => {
    const args = ctx.match.trim().toLowerCase();
    if (!validLocks.includes(args)) {
      return replyRich(ctx, `❌ Kunci tidak valid. Pilih: \`${validLocks.join(', ')}\``, { markdown: true });
    }

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.locks) config.locks = {};
    
    config.locks[args] = 0;
    await updateGroupConfig(chatId, config);

    replyRich(ctx, `🔓 Gembok \`${args}\` berhasil dinonaktifkan.`, { markdown: true });
  });

  // Lock logic interceptor
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    
    // Ignore admins and bot owner
    const userId = ctx.from?.id;
    if (!userId) return next();
    if (isAdmin(userId)) return next();
    if (await isGroupAdmin(ctx, userId)) return next();

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.locks) return next();

    const msg = ctx.message;
    let shouldDelete = false;

    // 1. URL Lock
    if (config.locks['url']) {
      if (msg.entities && msg.entities.some(e => ['url', 'text_link'].includes(e.type))) {
        shouldDelete = true;
      } else if (msg.caption_entities && msg.caption_entities.some(e => ['url', 'text_link'].includes(e.type))) {
        shouldDelete = true;
      }
    }

    // 2. Forward Lock
    if (config.locks['forward'] && !shouldDelete) {
      if (msg.forward_date || msg.forward_origin) {
        shouldDelete = true;
      }
    }

    // 3. Sticker Lock
    if (config.locks['sticker'] && !shouldDelete) {
      if (msg.sticker) {
        shouldDelete = true;
      }
    }

    // 4. Arabic Lock
    if (config.locks['arabic'] && !shouldDelete) {
      const text = msg.text || msg.caption || '';
      const arabicRegex = /[\u0600-\u06FF]/;
      if (arabicRegex.test(text)) {
        shouldDelete = true;
      }
    }

    // 5. Bots Lock (when user adds bot)
    if (config.locks['bots'] && msg.new_chat_members) {
      for (const m of msg.new_chat_members) {
        if (m.is_bot) {
          try {
            await ctx.banChatMember(m.id);
            await ctx.unbanChatMember(m.id);
          } catch (e) {}
        }
      }
    }

    if (shouldDelete) {
      try {
        await ctx.deleteMessage();
      } catch (e) {}
    } else {
      return next();
    }
  });
}
