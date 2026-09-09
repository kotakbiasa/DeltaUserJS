/**
 * Streaming rich message helper — teks live ala ChatGPT di chat userbot.
 *
 * Mode (dari setting `stream_mode` sesi userbot, dikelola via Dashboard):
 *   0 = off      → kirim langsung (replyRich biasa)
 *   1 = full     → placeholder sesaat (▌) → seluruh teks muncul sekaligus
 *   2 = per-kata → teks muncul bertahap kata demi kata + cursor ▌
 *
 * Catatan lapangan (field-tested Sep 2026):
 * - Telegram membatasi draft update ±1 req/detik per chat → mode per-kata pakai delay 1.05s
 * - 429 ditangani dengan retry_after otomatis
 * - Draft hanya untuk chat privat (chat_id integer) — grup otomatis fallback kirim langsung
 * - Draft window ~30 detik; finalize wajib sebelum window habis
 *
 * @module utils/streamRich
 */

const DRAFT_BASE = process.env.BOT_API_URL || 'http://127.0.0.1:8081';
const DRAFT_DELAY_MS = 1050;

function botToken() {
  return process.env.BOT_TOKEN || '';
}

interface StreamOpts {
  mode?: number;
  replyTo?: number;
}

async function post(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${DRAFT_BASE}/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const err = new Error(String(data.description || `HTTP ${res.status}`)) as Error & { retryAfter?: number };
    err.retryAfter = (data.parameters as { retry_after?: number } | undefined)?.retry_after;
    throw err;
  }
  return data;
}

let draftCounter = 0;
function nextDraftId() {
  draftCounter = (draftCounter + 1) % 900000;
  return 100000 + draftCounter;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function draftUpdate(chatId, draftId, html) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await post('sendRichMessageDraft', {
        chat_id: chatId,
        draft_id: draftId,
        rich_message: { html },
      });
    } catch (err) {
      const wait = (err.retryAfter || 1.2) * 1000;
      if (attempt === 2) {throw err;}
      await sleep(wait);
    }
  }
  return null;
}

/**
 * Kirim pesan rich dengan efek streaming sesuai stream_mode.
 * @param {object} clientGrammy grammy ctx.api atau bot.api (harus punya sendRichMessage/editMessageText via Bot API lokal)
 * @param {number} chatId ID chat target (harus privat utk efek draft; grup → langsung final)
 * @param {string} html konten rich HTML final
 * @param {object} opts { mode: 0|1|2, replyTo?: number }
 * @returns {Promise<object>} pesan final terkirim
 */
export async function sendWithStreamEffect(api: { sendRichMessage: Function }, chatId: number, html: string, opts: StreamOpts = {}) {
  const mode = Number(opts.mode || 0);
  const isPrivate = Number.isInteger(chatId) && chatId > 0;
  const extra = opts.replyTo ? { reply_to_message_id: opts.replyTo } : {};

  // Mode off / grup / bukan chat pribadi → langsung final
  if (mode === 0 || !isPrivate) {
    return api.sendRichMessage(chatId, { html }, extra);
  }

  const draftId = nextDraftId();

  if (mode === 1) {
    // ⚡ Full instant: placeholder sesaat → finalize full
    await draftUpdate(chatId, draftId, '<blockquote>▌</blockquote>').catch(() => {});
    await sleep(900);
    return api.sendRichMessage(chatId, { html }, extra);
  }

  // 🎬 Per-kata: buang tag HTML untuk hitung kata, kirim progres tiap ±1 detik
  const tokens = html.split(/(<[^>]+>)/g);
  let plainAccum = '';
  const words = [];
  for (const tok of tokens) {
    if (tok.startsWith('<')) {plainAccum += tok; continue;}
    for (const w of tok.split(/(\s+)/)) {
      if (w.trim()) {words.push({ text: w, sep: ' ' });}
      else if (w) {words.push({ text: '', sep: w });}
    }
  }
  if (words.length <= 3) {
    return api.sendRichMessage(chatId, { html }, extra);
  }

  let htmlAccum = '';
  let plainCount = 0;
  const totalPlain = words.filter((w) => w.text).length;
  let lastSent = 0;

  await draftUpdate(chatId, draftId, '<blockquote>▌</blockquote>').catch(() => {});
  await sleep(DRAFT_DELAY_MS);

  for (const word of words) {
    if (word.text) {
      htmlAccum += (htmlAccum && !htmlAccum.endsWith('>') && !htmlAccum.endsWith(' ') ? ' ' : '') + word.text;
      plainCount++;
    } else {
      htmlAccum += word.sep;
    }
    // Tag penutup yng menempel di akhir teks akan ikut di finalize; cukup teks plain untuk draft
    if (plainCount - lastSent >= Math.max(1, Math.ceil(totalPlain / 25)) || plainCount === totalPlain) {
      await draftUpdate(chatId, draftId, `${htmlAccum} ▌`).catch(() => { /* ignore */ });
      lastSent = plainCount;
      await sleep(DRAFT_DELAY_MS);
    }
  }

  return api.sendRichMessage(chatId, { html }, extra);
}

/**
 * Baca stream_mode dari settings sesi userbot.
 * @param {object} session objek sesi dari getUserbotSession
 */
export function streamModeOf(session: { stream_mode?: number } | null | undefined): number {
  return Number(session?.stream_mode || 0);
}
