/**
 * Notification service — kirim notifikasi Telegram ke user/owner dari service layer.
 * Menghindari circular import: bot instance di-set sekali dari bot/index.ts.
 */

let botRef = null;

/** Set bot instance (dipanggil dari bot/index.ts setelah bot dibuat). */
export function setNotifyBot(bot) {
  botRef = bot;
}

function resolveChatId(userId) {
  const id = Number(userId);
  return Number.isFinite(id) && id !== 0 ? id : null;
}

/**
 * Kirim notifikasi ke seorang user. Return true jika terkirim.
 * Silent-fail: kegagalan (user block bot, dsb) hanya di-log.
 */
export async function notifyUser(userId, html) {
  const chatId = resolveChatId(userId);
  if (!botRef || !chatId) {return false;}
  try {
    await botRef.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[NOTIFY] gagal kirim ke ${chatId}: ${msg}`);
    return false;
  }
}

/** Kirim notifikasi ke owner (config.ownerId). */
export async function notifyOwner(html) {
  const { default: config } = await import('../config.js');
  return notifyUser(config.ownerId, html);
}

/**
 * Kirim notifikasi ke channel/grup log (config.logGroupId atau config.ownerId).
 * Mendukung forum topic (config.logTopicId) dan tombol inline (reply_markup).
 */
export async function notifyChannel(html: string, options?: { reply_markup?: any }) {
  const { default: config } = await import('../config.js');
  const targetChat = config.logGroupId || config.ownerId;
  if (!botRef || !targetChat) {return false;}
  try {
    const extraParams: Record<string, unknown> = {
      parse_mode: 'HTML',
    };
    if (options?.reply_markup) {
      extraParams.reply_markup = options.reply_markup;
    }
    if (config.logGroupId && config.logTopicId) {
      extraParams.message_thread_id = config.logTopicId;
    }
    await botRef.api.sendMessage(targetChat, html, extraParams);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[NOTIFY] gagal kirim ke channel log ${targetChat}: ${msg}`);
    return false;
  }
}
