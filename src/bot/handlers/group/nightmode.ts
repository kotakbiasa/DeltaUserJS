// @ts-nocheck
import { getGroupConfig, updateGroupConfig, getAllGroupConfigs } from '../../../infrastructure/database.js';
import { isAdmin, isOwner } from '../admin/admin_bot.js';

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerNightmodeHandlers(bot) {
  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isOwner(userId)) {
      return next();
    }
    return ctx.reply('❌ Anda bukan admin.');
  };

  bot.command('nightmode', modCheck, async (ctx) => {
    const args = ctx.match.trim().toLowerCase();
    if (!['on', 'off'].includes(args)) {
      return ctx.reply('❌ Format: `/nightmode on` atau `/nightmode off`', { parse_mode: 'Markdown' });
    }

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    config.nightmode_enabled = (args === 'on');
    await updateGroupConfig(chatId, config);

    ctx.reply(`🌙 Night Mode berhasil di-${args === 'on' ? 'aktifkan' : 'matikan'}. Grup akan dikunci secara otomatis dari jam 23:00 hingga 06:00.`);
  });

  // Background interval to check time every minute
  setInterval(async () => {
    const now = new Date();
    // Use UTC+7 (WIB) since it's an Indonesian bot context
    // This server is running UTC+8 or UTC+0. Let's just use local time for simplicity,
    // or calculate UTC+7:
    const utcHour = now.getUTCHours();
    const wibHour = (utcHour + 7) % 24;
    
    // 23 to 5 is night time (23:00 to 05:59) -> unlock at 6:00
    const isNight = wibHour >= 23 || wibHour < 6;

    const allConfigs = getAllGroupConfigs();
    for (const [chatId, config] of Object.entries(allConfigs)) {
      if (!config.nightmode_enabled) continue;

      // We need to track the current state to avoid spamming the API
      if (!config.nightmode_state) config.nightmode_state = 'open';

      if (isNight && config.nightmode_state === 'open') {
        try {
          // Lock group
          await bot.api.setChatPermissions(chatId, {
            can_send_messages: false
          });
          await bot.api.sendMessage(chatId, '🌙 **Night Mode Aktif**\n\nGrup ini dikunci sementara untuk waktu istirahat (23:00 - 06:00). Selamat malam!', { parse_mode: 'Markdown' });
          config.nightmode_state = 'closed';
          await updateGroupConfig(chatId, config);
        } catch (e) {
          // No admin rights or group deleted
        }
      } else if (!isNight && config.nightmode_state === 'closed') {
        try {
          // Unlock group
          await bot.api.setChatPermissions(chatId, {
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
          await bot.api.sendMessage(chatId, '☀️ **Selamat Pagi!**\n\nNight Mode dinonaktifkan. Grup dibuka kembali. Silakan mengobrol!', { parse_mode: 'Markdown' });
          config.nightmode_state = 'open';
          await updateGroupConfig(chatId, config);
        } catch (e) {
          // No admin rights
        }
      }
    }
  }, 60000); // Check every minute
}
