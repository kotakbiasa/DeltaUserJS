import { getGroupConfig, updateGroupConfig, addWarn } from '../../../infrastructure/database.js';
import { isAdmin, isOwner } from '../admin/admin_bot.js';
import { replyRich } from '../../../utils/richMessage.js';

const spamTracker = new Map();
const SPAM_LIMIT = 5;
const TIME_WINDOW = 3000;

// Helper to check if a user is admin in the group
async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerAntispamHandlers(bot) {
  // Command to toggle antispam
  bot.command('antispam', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return replyRich(ctx, '❌ Perintah ini hanya bisa digunakan di dalam grup.');
    }

    const userId = ctx.from?.id;
    if (!userId) return;

    const isAdminMember = await isGroupAdmin(ctx, userId);
    const isBotOwner = isOwner(userId);

    if (!isAdminMember && !isBotOwner) {
      return replyRich(ctx, '❌ Hanya admin grup yang bisa mengatur fitur ini.');
    }

    const args = ctx.match.trim().toLowerCase();
    if (!['on', 'off'].includes(args)) {
      return replyRich(ctx, '❌ Format salah.\nGunakan: `/antispam on` atau `/antispam off`', { markdown: true });
    }

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.antispam_enabled = (args === 'on');
    await updateGroupConfig(chatId, config);

    return replyRich(ctx, `🛡️ **Anti-Spam** berhasil di-${args === 'on' ? 'aktifkan' : 'matikan'} untuk grup ini.`, { markdown: true });
  });

  // Message listener for spam tracking
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    if (!config.antispam_enabled) return next();

    const userId = ctx.from?.id;
    if (!userId) return next();

    // Ignore admins
    const isAdminMember = await isGroupAdmin(ctx, userId);
    if (isAdminMember || isOwner(userId)) return next();

    const trackerKey = `${chatId}_${userId}`;
    let timestamps = spamTracker.get(trackerKey) || [];
    
    const now = Date.now();
    timestamps.push(now);
    timestamps = timestamps.filter(t => now - t <= TIME_WINDOW);
    spamTracker.set(trackerKey, timestamps);

    if (timestamps.length >= SPAM_LIMIT) {
      // Spam detected!
      spamTracker.delete(trackerKey);

      try {
        // Delete message
        await ctx.deleteMessage().catch(() => {});

        // Add Warn (pass null for telegramId since this is master bot, warn is tied to chat)
        const warnData = await addWarn(null, chatId, userId, 'Spamming messages');
        
        const targetName = ctx.from.first_name || String(userId);
        let replyText = `🛡️ <b>Sistem Anti-Spam</b>\nPengguna <b>${targetName}</b> terdeteksi melakukan spam.\n⚠️ Peringatan ke: <b>${warnData.count}/3</b>`;

        if (warnData.count >= 3) {
          replyText += `\n\n⛔ <b>Batas peringatan tercapai! Membisukan (Mute) pengguna selama 1 Jam...</b>`;
          const muteDurationSeconds = 3600;
          const untilDate = Math.floor(Date.now() / 1000) + muteDurationSeconds;

          try {
            await ctx.restrictChatMember(userId, {
              permissions: {
                can_send_messages: false
              },
              until_date: untilDate
            });
            replyText += `\n✅ <i>Berhasil dibungkam hingga 1 jam ke depan.</i>`;
          } catch (e) {
            replyText += `\n❌ <i>Gagal membungkam pengguna. Pastikan Master Bot adalah admin.</i>`;
          }
        }

        await replyRich(ctx, replyText);
      } catch (err) {
        console.error('Master Bot Antispam Error:', err);
      }
    } else {
      return next();
    }
  });
}
