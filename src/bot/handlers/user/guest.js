import { getUserbotSession } from '../../../infrastructure/database.js';
import userbotManager from '../../../userbot/engine/manager.js';
import { TiktokService } from '../../../domain/services/TiktokService.js';

export function registerGuestHandler(bot) {
  bot.use(async (ctx, next) => {
    const guestMsg = ctx.update.guest_message;
    if (!guestMsg) return next();

    try {
      const guestQueryId = guestMsg.guest_query_id;
      const callerUser = guestMsg.guest_bot_caller_user;
      const text = (guestMsg.text || '').trim().toLowerCase();
      if (!guestQueryId || !callerUser) return;

      const telegramId = callerUser.id;
      const userSession = getUserbotSession(telegramId);
      const botUsername = ctx.me?.username || 'Bot';

      if (text.startsWith('dl ') || text.startsWith('/dl ')) {
        const cmdParts = text.split(' ');
        const url = cmdParts.length > 1 ? cmdParts[1] : '';
        if (!url || !TiktokService.supports(url)) {
          await ctx.api.answerGuestQuery(guestQueryId, {
            text: `❌ <b>URL tidak valid!</b>\nHarap masukkan link TikTok yang benar (tiktok.com/vt.tiktok.com).`,
            parse_mode: 'HTML',
          });
          return;
        }

        await ctx.api.answerGuestQuery(guestQueryId, {
          text: `⏳ <b>Mendownload TikTok...</b>\n\nMohon tunggu sebentar, file akan dikirim ke chat pribadi Anda.`,
          parse_mode: 'HTML',
        });

        try {
          const meta = await TiktokService.getMetadata(url);
          if (meta.isSlideshow) {
            const mediaGroup = meta.mediaUrls.map((url, i) => ({
              type: 'photo',
              media: url,
              caption: i === 0 ? `📸 <b>${meta.title}</b>\n\n<i>Diunduh via @${botUsername}</i>` : '',
              parse_mode: 'HTML'
            }));
            await ctx.api.sendMediaGroup(telegramId, mediaGroup);
          } else {
            await ctx.api.sendVideo(telegramId, meta.videoUrl, {
              caption: `🎥 <b>${meta.title}</b>\n\n<i>Diunduh via @${botUsername}</i>`,
              parse_mode: 'HTML'
            });
          }
        } catch (err) {
          await ctx.api.sendMessage(telegramId, `❌ <b>Gagal Mendownload:</b>\n\n${err.message}`, { parse_mode: 'HTML' });
        }
        return;
      }

      if (text.startsWith('status')) {
        const running = userbotManager.isRunning(telegramId);
        await ctx.api.answerGuestQuery(guestQueryId, {
          text: `🤖 <b>${ctx.me?.first_name || 'Bot'} Status</b>\n\nUserbot: ${userSession ? (running ? '🟢 Running' : '🔴 Stopped') : 'Belum terdaftar'}\nOwner: <b>${callerUser.first_name}</b>`,
          parse_mode: 'HTML',
        });
        return;
      }

      if (text.startsWith('verify')) {
        await ctx.api.answerGuestQuery(guestQueryId, {
          text: userSession
            ? `✅ <b>Verified ${ctx.me?.first_name || 'Bot'} User</b>\n\nAkun <b>${callerUser.first_name}</b> memiliki sesi aktif.`
            : `⚠️ <b>Belum Terverifikasi</b>\n\nAkun <b>${callerUser.first_name}</b> belum punya sesi aktif.`,
          parse_mode: 'HTML',
        });
        return;
      }

      if (text.startsWith('stop')) {
        if (!userSession) {
          await ctx.api.answerGuestQuery(guestQueryId, { text: '❌ Anda belum mendaftarkan userbot.', parse_mode: 'HTML' });
          return;
        }
        if (userbotManager.isRunning(telegramId)) await userbotManager.stopUserbot(telegramId);
        await ctx.api.answerGuestQuery(guestQueryId, {
          text: '🛑 <b>Emergency Stop</b>\n\nUserbot berhasil dimatikan.',
          parse_mode: 'HTML',
        });
        return;
      }

      await ctx.api.answerGuestQuery(guestQueryId, {
        text: `📖 <b>${ctx.me?.first_name || 'Bot'} Guest Commands</b>\n\n@${botUsername} status\n@${botUsername} verify\n@${botUsername} stop\n@${botUsername} dl [url tiktok]`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: 'Buka Panel', url: `https://t.me/${botUsername}` }]] },
      });
    } catch (err) {
      console.error('Guest mode error:', err);
    }
  });
}
