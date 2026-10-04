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
import type { BotContext } from '../../../context.js';

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

/**
 * Payload rich message Delta: HTML mentah, objek { html }, atau struktur
 * blocks yang dirakit panel builder.
 */
type RichPayload = string | { html: string } | { blocks: unknown[] };

/**
 * Keyboard dashboard memakai field tambahan `style` di luar Bot API standar
 * (dirender transformer richMessage), jadi tipenya dideklarasikan sendiri.
 */
export type DashboardMarkup = {
  inline_keyboard: Array<Array<{
    text: string;
    callback_data?: string;
    url?: string;
    style?: string;
  }>>;
};
type ReplyMarkup = DashboardMarkup | undefined;
type ApiReplyMarkup = NonNullable<Parameters<BotContext['api']['editMessageText']>[3]>['reply_markup'];

export async function sendRich(ctx: BotContext, rich: RichPayload, reply_markup?: ReplyMarkup, { deleteOld = false, edit = true } = {}) {
  if (ctx.inlineMessageId) {
    if (ctx.answerCallbackQuery) {
      await ctx.answerCallbackQuery({ text: '⚠️ Akses menu ini melalui Private Chat (DM) bot.', show_alert: true }).catch(()=>{});
    }
    return;
  }
  const rich_message = (typeof rich === 'string' ? { html: rich } : rich) as { html: string };
  // Edit in-place kalau berasal dari callback pada pesan bot (message_id ada) & opsi edit aktif
  const cbMessage = ctx.callbackQuery?.message;
  const cbMsgId = cbMessage?.message_id;
  if (edit && cbMessage && cbMsgId) {
    try {
      await ctx.api.editMessageText(cbMessage.chat.id, cbMsgId, rich_message, { reply_markup: reply_markup as ApiReplyMarkup });
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
  const doSend = () => ctx.replyWithRichMessage(rich_message, { reply_markup: reply_markup as ApiReplyMarkup });
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

export async function openMain(ctx: BotContext, options = {}) {
  await sendRich(ctx, panelMain(ctx), keyboardMain(ctx), options);
}

export async function toggleUserbotSetting(
  ctx: BotContext,
  field: string,
  label: string,
  panel: (ctx: BotContext) => RichPayload | Promise<RichPayload>,
  keyboard: (ctx: BotContext) => ReplyMarkup,
) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}

  const newStatus = session[field] === 1 ? 0 : 1;
  await updateUserbotFeature(ctx.from.id, field, newStatus);
  await ctx.answerCallbackQuery(`${label}: ${newStatus === 1 ? 'ON' : 'OFF'}`);
  return sendRich(ctx, await panel(ctx), keyboard(ctx));
}

export function findPlugin(name: string) {
  const target = decodeURIComponent(String(name || '')).trim().toLowerCase();
  return loadedPlugins.find(plugin => String(plugin.name).toLowerCase() === target);
}

export function pluginNotice(pluginName: string, enabled: boolean) {
  return `${enabled ? 'Plugin diaktifkan' : 'Plugin dinonaktifkan'}: ${pluginName}`;
}

export async function openPluginStudio(ctx: BotContext, page = 1, category = 'all', notice = '', options = {}) {
  const result = panelPlugins(ctx, page, category, notice);
  // edit: true → kalau dipicu callback (tombol toggle/page), pesan diedit in-place, bukan hapus-kirim-ulang
  await sendRich(ctx, result.rich, result.keyboard, { edit: true, ...options });
}

export async function sendAccessDeniedRich(ctx: BotContext) {
  await sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx), { edit: true });
}
