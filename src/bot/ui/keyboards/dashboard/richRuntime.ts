/**
 * Helper runtime dashboard: pengiriman rich message, pembuka panel, dan
 * utilitas plugin yang dipakai bersama oleh handlers.ts dan modul routes/.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 * Tinggal di modul terpisah agar routes/ dan handlers.ts tidak saling impor
 * (menghindari circular import).
 */
import { getUserbotSession, updateUserbotFeature } from '../../../../infrastructure/database.js';
import { loadedPlugins } from '../../../../userbot/engine/pluginRegistry.js';
import { Logger } from '../../../../utils/logger.js';
import { sendWithNativeDraft } from '../../../../utils/streamRich.js';
import { panelAccessDenied, panelMain, panelPlugins } from './panels.js';
import { keyboardAccessDenied, keyboardMain } from './keyboards.js';

export async function mongoStatusLabel() {
  try {
    const mongoose = await import('mongoose');
    return mongoose.default.connection.readyState === 1
      ? `🟢 Connected (${mongoose.default.connection.name})`
      : `🔴 State ${mongoose.default.connection.readyState}`;
  } catch (_e) {
    return '🔴 Disconnected';
  }
}

export async function sendRich(ctx, rich, reply_markup, { deleteOld = false, edit = true } = {}) {
  if (ctx.inlineMessageId) {
    if (ctx.answerCallbackQuery) {
      await ctx.answerCallbackQuery({ text: '⚠️ Akses menu ini melalui Private Chat (DM) bot.', show_alert: true }).catch(()=>{});
    }
    return;
  }
  const rich_message = typeof rich === 'string' ? { html: rich } : rich;
  // Edit in-place kalau berasal dari callback pada pesan bot (message_id ada) & opsi edit aktif
  const cbMsgId = ctx.callbackQuery?.message?.message_id;
  if (edit && cbMsgId) {
    try {
      await ctx.api.editMessageText(ctx.callbackQuery.message.chat.id, cbMsgId, rich_message, { reply_markup });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('message is not modified')) {
        return;
      }
      Logger.logSystem(`editMessageText(rich) failed: ${msg}`, 'WARN');
      // fallback: kirim pesan baru di bawah
    }
  }
  // Efek draft native hanya untuk pengiriman pesan BARU di chat privat. Edit in-place tidak perlu draft.
  const chatId = ctx.chat?.id;
  const doSend = () => ctx.replyWithRichMessage(rich_message, { reply_markup });
  try {
    if (chatId && typeof chatId === 'number' && chatId > 0) {
      await sendWithNativeDraft(doSend, ctx.api, chatId, 'Memuat dashboard…');
    } else {
      await doSend();
    }
    if (deleteOld) {
      try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
    }
  } catch (err) {
    Logger.logSystem(`sendRichMessage failed: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    await ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal kirim pesan.</b> Silakan kirim /menu kembali.</p>` });
  }
}

export async function openMain(ctx, options = {}) {
  await sendRich(ctx, panelMain(ctx), keyboardMain(ctx), options);
}

export async function toggleUserbotSetting(ctx, field, label, panel, keyboard) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}

  const newStatus = session[field] === 1 ? 0 : 1;
  await updateUserbotFeature(ctx.from.id, field, newStatus);
  await ctx.answerCallbackQuery(`${label}: ${newStatus === 1 ? 'ON' : 'OFF'}`);
  return sendRich(ctx, panel(ctx), keyboard(ctx));
}

export function findPlugin(name) {
  const target = decodeURIComponent(String(name || '')).trim().toLowerCase();
  return loadedPlugins.find(plugin => String(plugin.name).toLowerCase() === target);
}

export function pluginNotice(pluginName, enabled) {
  return `${enabled ? 'Plugin diaktifkan' : 'Plugin dinonaktifkan'}: ${pluginName}`;
}

export async function openPluginStudio(ctx, page = 1, category = 'all', notice = '', options = {}) {
  const result = panelPlugins(ctx, page, category, notice);
  // edit: true → kalau dipicu callback (tombol toggle/page), pesan diedit in-place, bukan hapus-kirim-ulang
  await sendRich(ctx, result.rich, result.keyboard, { edit: true, ...options });
}

export async function sendAccessDeniedRich(ctx) {
  await sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx), { edit: true });
}
