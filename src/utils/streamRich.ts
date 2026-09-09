/**
 * Streaming rich message helper — teks live ala ChatGPT untuk DASHBOARD BOT.
 *
 * PENTING: fitur ini untuk panel dashboard (@PanelDeltaUbot), BUKAN untuk
 * plugin userbot (keputusan user, Sep 2026). Dipanggil dari sendRich() di
 * dashboard.ts saat panel dikirim sebagai pesan BARU (bukan edit in-place).
 *
 * Mode (dari field `stream_mode` sesi userbot, toggle di Panel Userbot):
 *   0 = off      → kirim langsung
 *   1 = full     → placeholder sesaat (▌) → seluruh teks muncul sekaligus
 *   2 = per-kata → teks muncul bertahap kata demi kata + cursor ▌
 *
 * Mekanisme:
 * - Draft update via raw fetch ke Bot API lokal (sendRichMessageDraft).
 *   Draft tidak memuat tombol → tidak butuh style middleware.
 * - Pesan FINAL dikirim lewat closure finalSend() yang memakai ctx.api
 *   (grammy) → tg-button style tetap diproses middleware dashboard.
 * - Telegram membatasi draft ±1 req/detik → per-kata adaptif maks ±18
 *   update agar tidak melebihi draft window ~30 detik; 429 di-retry.
 * - Draft hanya jalan di chat privat (chat_id integer); selain itu langsung final.
 *
 * @module utils/streamRich
 */

const DRAFT_BASE = process.env.BOT_API_URL || 'http://127.0.0.1:8081';
const DRAFT_DELAY_MS = 1050;

function botToken(): string {
  return process.env.BOT_TOKEN || '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let draftCounter = 0;
function nextDraftId(): number {
  draftCounter = (draftCounter + 1) % 900000;
  return 100000 + draftCounter;
}

interface DraftError extends Error {
  retryAfter?: number;
}

async function draftPost(chatId: number, draftId: number, html: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${DRAFT_BASE}/bot${botToken()}/sendRichMessageDraft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, draft_id: draftId, rich_message: { html } }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        description?: string;
        parameters?: { retry_after?: number };
      };
      if (res.ok) {return;}
      const err: DraftError = new Error(String(data.description || `HTTP ${res.status}`));
      err.retryAfter = data.parameters?.retry_after;
      throw err;
    } catch (err) {
      if (attempt === 2) {return;} // draft gagal → biarkan finalize yang menampilkan pesan
      await sleep(((err as DraftError).retryAfter || 1.2) * 1000);
    }
  }
}

/**
 * Kirim pesan rich dengan efek streaming sesuai mode.
 * @param finalSend closure yang mengirim pesan final (harus lewat ctx.api agar style tg-button diproses)
 * @param chatId target chat
 * @param html konten rich HTML final (untuk streaming per-kata)
 * @param opts { mode: 0|1|2 }
 */
export async function sendWithStreamEffect(
  finalSend: () => Promise<unknown>,
  chatId: number,
  html: string,
  opts: { mode?: number } = {},
): Promise<unknown> {
  const mode = Number(opts.mode || 0);
  const isPrivate = Number.isInteger(chatId) && chatId > 0;
  if (mode === 0 || !isPrivate) {return finalSend();}

  const draftId = nextDraftId();

  if (mode === 1) {
    // ⚡ Full instant: placeholder sesaat → finalize full text
    await draftPost(chatId, draftId, '<blockquote>▌</blockquote>');
    await sleep(900);
    return finalSend();
  }

  // 🎬 Per-kata: pecah HTML pada batas tag/kata, stream adaptif ≤18 update
  const tokens = html.split(/(<[^>]*>)/g).filter((t) => t.length > 0);
  type Piece = { type: 'tag' | 'word' | 'space'; value: string };
  const pieces: Piece[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('<')) {
      pieces.push({ type: 'tag', value: tok });
      continue;
    }
    for (const w of tok.split(/(\s+)/)) {
      if (!w) {continue;}
      pieces.push(/^\s+$/.test(w) ? { type: 'space', value: w } : { type: 'word', value: w });
    }
  }
  const totalWords = pieces.filter((p) => p.type === 'word').length;
  if (totalWords <= 3) {return finalSend();}

  const step = Math.max(1, Math.ceil(totalWords / 18));
  let htmlAccum = '';
  let wordCount = 0;
  let sinceUpdate = 0;

  await draftPost(chatId, draftId, '<blockquote>▌</blockquote>');
  await sleep(DRAFT_DELAY_MS);

  for (const piece of pieces) {
    htmlAccum += piece.value;
    if (piece.type === 'word') {
      wordCount++;
      sinceUpdate++;
    }
    if (sinceUpdate >= step || (piece.type === 'word' && wordCount === totalWords)) {
      await draftPost(chatId, draftId, `${htmlAccum} ▌`);
      sinceUpdate = 0;
      if (wordCount < totalWords) {await sleep(DRAFT_DELAY_MS);}
    }
  }

  return finalSend();
}

/** Baca stream_mode dari sesi userbot (0=off, 1=full, 2=per-kata). */
export function streamModeOf(session: { stream_mode?: number } | null | undefined): number {
  return Number(session?.stream_mode || 0);
}
