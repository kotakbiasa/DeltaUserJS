/**
 * Navigasi inti dan kontrol daya userbot.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import userbotManager from '../../../../../userbot/engine/manager.js';
import { escapeHtml } from '../../../../../utils/richMessage.js';
import { getUserbotSession, updateUserbotStatus } from '../../../../../infrastructure/database.js';
import { keyboardPanelMenu, keyboardUserbot } from '../keyboards.js';
import { openMain, sendRich } from '../richRuntime.js';
import { panelMenuList, panelUserbot } from '../panels.js';
import { NOT_HANDLED } from './types.js';

export async function handleNavigationRoutes(ctx) {
  const action = ctx.match[1];

  if (action === 'main') {return openMain(ctx, { edit: true });}

  if (action === 'noop') {return;}

  if (action === 'panel_menu') {return sendRich(ctx, panelMenuList(ctx), keyboardPanelMenu(ctx), { edit: true });}

  if (action === 'ubot') {
    return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
  }

  if (action === 'toggle_power') {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}

    const isRunning = userbotManager.isRunning(telegramId);
    if (isRunning) {
      await ctx.answerCallbackQuery('Mematikan Bot...');
      await userbotManager.stopUserbot(telegramId);
      updateUserbotStatus(telegramId, false);
    } else {
      await ctx.answerCallbackQuery('Menghidupkan Bot...');
      try {
        await userbotManager.startUserbot(telegramId, session.session_string);
        updateUserbotStatus(telegramId, true);
      } catch (err) {
        return ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal menghidupkan:</b> ${escapeHtml(err.message)}</p>` });
      }
    }
    return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
  }

  if (action === 'user_restart_ubot') {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {
      return ctx.answerCallbackQuery({ text: 'Sesi tidak ditemukan.', show_alert: true });
    }
    if (!userbotManager.isRunning(telegramId)) {
      return ctx.answerCallbackQuery({ text: 'Userbot sedang offline. Ketuk Hidupkan Userbot terlebih dahulu.', show_alert: true });
    }

    await ctx.answerCallbackQuery({ text: '🔄 Merestart koneksi userbot...' });
    try {
      await userbotManager.restartUserbot(telegramId);
      await updateUserbotStatus(telegramId, true);
      await ctx.answerCallbackQuery({ text: '✅ Userbot berhasil direstart & online!' });
    } catch (err) {
      return ctx.replyWithRichMessage({
        html: `<p>❌ <b>Gagal restart:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`
      });
    }
    return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
  }

  return NOT_HANDLED;
}
