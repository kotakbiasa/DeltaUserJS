import { getGroupConfig } from '../../../core/database.js';
import { InlineKeyboard } from 'grammy';
import { isAdmin } from '../admin/admin_bot.js';

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerCaptchaHandlers(bot) {
  const pendingCaptchas = new Map();

  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isAdmin(userId)) {
      return next();
    }
    return ctx.reply('❌ Anda bukan admin.');
  };

  // Command to enable/disable captcha
  bot.command('captcha', modCheck, async (ctx) => {
    const args = ctx.match.trim().toLowerCase();
    if (!['on', 'off'].includes(args)) {
      return ctx.reply('❌ Format: `/captcha on` atau `/captcha off`', { parse_mode: 'Markdown' });
    }

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.captcha_enabled = (args === 'on' ? 1 : 0);
    
    // updateGroupConfig is dynamically exported, we can just save it or call updateGroupConfig.
    // Wait, updateGroupConfig was imported in other plugins. Let's import it.
    const db = await import('../../../core/database.js');
    await db.updateGroupConfig(chatId, config);

    ctx.reply(`🛡️ Sistem Captcha Anti-Botnet berhasil di-${args === 'on' ? 'aktifkan' : 'matikan'}.`);
  });

  // Intercept new members
  bot.on('message:new_chat_members', async (ctx, next) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (!config.captcha_enabled) {
      return next();
    }

    for (const newMember of ctx.message.new_chat_members) {
      if (newMember.is_bot) continue;

      try {
        // Mute user
        await ctx.restrictChatMember(newMember.id, {
          can_send_messages: false
        });

        // Generate simple math question
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        const answer = num1 + num2;

        // Generate wrong options
        const options = [answer];
        while (options.length < 4) {
          const wrong = Math.floor(Math.random() * 20) + 1;
          if (!options.includes(wrong)) options.push(wrong);
        }
        options.sort(() => Math.random() - 0.5);

        // Build keyboard
        const keyboard = new InlineKeyboard();
        for (let i = 0; i < options.length; i++) {
          const isCorrect = (options[i] === answer);
          keyboard.text(options[i].toString(), `captcha_${newMember.id}_${isCorrect ? 'yes' : 'no'}`);
          if (i === 1) keyboard.row();
        }

        const msg = await ctx.reply(
          `Halo [${newMember.first_name}](tg://user?id=${newMember.id})! 🛡️\n\n` +
          `Untuk membuktikan Anda bukan bot, silakan jawab soal matematika berikut dalam waktu 2 menit:\n\n` +
          `**Berapa ${num1} + ${num2}?**`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );

        // Timeout handler
        const timeoutId = setTimeout(async () => {
          pendingCaptchas.delete(`${chatId}_${newMember.id}`);
          try {
            await ctx.api.deleteMessage(chatId, msg.message_id);
            await ctx.banChatMember(newMember.id);
            await ctx.unbanChatMember(newMember.id); // Kick
          } catch (e) {}
        }, 120000); // 2 mins

        pendingCaptchas.set(`${chatId}_${newMember.id}`, {
          timeoutId,
          messageId: msg.message_id
        });

      } catch (e) {
        // Missing permissions
      }
    }
    
    return next();
  });

  // Handle captcha buttons
  bot.callbackQuery(/captcha_(\d+)_(yes|no)/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    const isCorrect = ctx.match[2] === 'yes';

    if (ctx.from.id !== targetUserId) {
      return ctx.answerCallbackQuery('❌ Ini bukan Captcha Anda!');
    }

    const chatId = ctx.chat.id.toString();
    const key = `${chatId}_${targetUserId}`;
    const pending = pendingCaptchas.get(key);

    if (!pending) {
      return ctx.answerCallbackQuery('❌ Waktu Captcha telah habis.');
    }

    clearTimeout(pending.timeoutId);
    pendingCaptchas.delete(key);

    try {
      await ctx.api.deleteMessage(chatId, pending.messageId);
      
      if (isCorrect) {
        // Unmute
        await ctx.restrictChatMember(targetUserId, {
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
        });
        await ctx.answerCallbackQuery('✅ Berhasil diverifikasi. Selamat datang!');
      } else {
        // Kick
        await ctx.banChatMember(targetUserId);
        await ctx.unbanChatMember(targetUserId);
        await ctx.answerCallbackQuery('❌ Jawaban salah. Anda dikeluarkan.');
      }
    } catch (e) {
      console.error(e);
      await ctx.answerCallbackQuery('❌ Gagal memproses aksi.');
    }
  });
}
