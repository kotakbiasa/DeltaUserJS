import { InlineKeyboard } from 'grammy';
import { getUserbotSession, updateUserbotFeature } from '../database/db.js';
import { createFeaturesKeyboard } from './keypads.js';

/**
 * Render and send the features menu
 * @param {import('grammy').Context} ctx 
 * @param {boolean} editMessage 
 */
export async function sendFeaturesMenu(ctx, editMessage = true) {
  const telegramId = ctx.from.id;
  const dbSession = getUserbotSession(telegramId);

  if (!dbSession) {
    if (editMessage) {
      try { await ctx.editMessageText('Sesi tidak ditemukan.'); } catch (e) {}
    } else {
      await ctx.reply('Sesi tidak ditemukan.');
    }
    return;
  }

  const autoReadVal = dbSession.auto_read === 1;
  const autoReplyVal = dbSession.auto_reply === 1;
  const antiPmVal = dbSession.anti_pm === 1;
  const botName = dbSession?.custom_name || 'DeltaUbotJS';
  const headerName = botName.toUpperCase().split('').join(' ');

  const text = 
    `🔺 <b>${headerName}</b> 🔺\n` +
    `───────────────────────\n` +
    `⚙️ <b>PENGATURAN (SETTINGS)</b>\n\n` +
    `Konfigurasikan preferensi akun Userbot Anda di sini:\n\n` +
    `<blockquote>` +
    `• <b>Anti-PM</b>: Otomatis menghapus chat dari orang tak dikenal.\n` +
    `• <b>Nama Ubot</b>: Mengubah signature / nama ubot.\n` +
    `• <b>Token Bot</b>: Memasang bot custom untuk membalas pesan.` +
    `</blockquote>\n` +
    `───────────────────────\n` +
    `Nama Ubot Aktif: <code>"${dbSession.custom_name || 'DeltaUbotJS'}"</code>\n` +
    `Token Bot Inline: <code>${dbSession.inline_bot_token ? '✅ Terpasang' : '❌ Belum Ada'}</code>`;

  const keyboard = createFeaturesKeyboard(autoReadVal, autoReplyVal, antiPmVal);

  if (editMessage) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    } catch (e) {}
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

/**
 * Setup all callback queries related to the settings menu.
 * Can be attached to the Master Bot or a Custom User Bot.
 * @param {import('grammy').Bot} bot 
 */
export function setupSettingsHandlers(bot) {
  // Manage features sub-menu
  bot.callbackQuery('manage_features', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendFeaturesMenu(ctx, true);
  });

  // Toggle Anti-PM Mode
  bot.callbackQuery('toggle_anti_pm', async (ctx) => {
    const telegramId = ctx.from.id;
    const dbSession = getUserbotSession(telegramId);

    if (!dbSession) {
      await ctx.answerCallbackQuery('Sesi tidak ditemukan.');
      return;
    }

    const currentVal = dbSession.anti_pm;
    const newVal = currentVal === 1 ? 0 : 1;

    updateUserbotFeature(telegramId, 'anti_pm', newVal);
    await ctx.answerCallbackQuery(newVal === 1 ? 'Anti-PM diaktifkan (Warning & Delete)' : 'Anti-PM dinonaktifkan');
    await sendFeaturesMenu(ctx, true);
  });

  // Set custom inline bot conversation trigger
  bot.callbackQuery('set_custom_inline_bot', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('inline-bot-conv');
  });

  // Set custom userbot name conversation trigger
  bot.callbackQuery('set_custom_name', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('custom-name-conv');
  });
}
