import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

// ============================================================
// Meme v2 — kirim meme random dari Reddit via meme-api.com
// Command:
//   .meme            — meme random dari r/memes (default)
//   .meme <sub>      — meme dari subreddit tertentu (mis. .meme dankmemes)
//   (.meme2 juga diterima sebagai alias)
// Flow: fetch JSON https://meme-api.com/gimme/<sub> yang berisi
// { url, postLink, title } -> download gambarnya -> kirim sebagai
// photo dengan caption title + link sumber post.
// Nama file meme2.ts agar tidak bentrok dengan plugin meme lain;
// perintah utama tetap .meme.
// ============================================================

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_SUBREDDIT = 'memes';
const SUBREDDIT_RE = /^[A-Za-z0-9_]{2,40}$/;

interface MemeApiResponse {
  url?: string;
  postLink?: string;
  title?: string;
  subreddit?: string;
  message?: string;
}

function extFromContentType(ctype) {
  if (ctype.includes('png')) {return 'png';}
  if (ctype.includes('webp')) {return 'webp';}
  if (ctype.includes('gif')) {return 'gif';}
  if (ctype.includes('mp4')) {return 'mp4';}
  return 'jpg';
}

export default {
  name: 'meme2',
  version: '1.0.0',
  description: 'Kirim meme random Reddit (r/memes atau subreddit pilihan) via meme-api.com, lengkap dengan judul dan link sumber.',
  help: {
    title: '😂 Meme (.meme)',
    description: 'Mengambil satu meme random dari Reddit via meme-api.com lalu mengirimkannya sebagai photo dengan caption judul post dan link sumber.',
    usage:
      '• `.meme` — meme random dari r/memes\n' +
      '• `.meme <subreddit>` — meme dari subreddit lain, contoh: `.meme dankmemes`',
    detail:
      'Sumber data: meme-api.com/gimme/<subreddit> (JSON berisi url gambar, postLink, dan title). ' +
      'Gambar dikirim sebagai photo; GIF/video dikirim sebagai dokumen agar tetap beranimasi. ' +
      'Nama subreddit hanya boleh huruf, angka, dan underscore (2-40 karakter).'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}
    const match = message.message.match(/^\.meme2?(?:\s+(\S+))?\s*$/i);
    if (!match) {return;}

    const chatId = message.chatId;
    if (chatId === null || chatId === undefined) {return;}

    const subreddit = (match[1] || DEFAULT_SUBREDDIT).trim();
    if (!SUBREDDIT_RE.test(subreddit)) {
      await message.edit({
        text: '<blockquote>❌ Nama subreddit tidak valid. Gunakan huruf/angka/underscore, contoh: <code>.meme dankmemes</code></blockquote>',
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `<blockquote>⏳ Mengambil meme dari <b>r/${escapeHtml(subreddit)}</b>...</blockquote>`,
      parseMode: 'html'
    });

    try {
      // 1. Ambil metadata meme (url gambar + postLink + title)
      const apiRes = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(subreddit)}`, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(30000)
      });
      if (!apiRes.ok) {throw new Error(`API responded ${apiRes.status}`);}
      const data: MemeApiResponse = await apiRes.json();
      if (!data || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) {
        throw new Error(data && data.message ? `API: ${data.message}` : 'API tidak mengembalikan URL gambar');
      }

      // 2. Download gambarnya
      const imgRes = await fetch(data.url, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(60000)
      });
      if (!imgRes.ok) {throw new Error(`Gagal download gambar (${imgRes.status})`);}
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length < 1000) {throw new Error('gambar tidak valid');}

      // 3. Susun caption: title + link sumber
      const ctype = (imgRes.headers.get('content-type') || 'image/jpeg').toLowerCase();
      const isPhoto = ctype.startsWith('image/') && !ctype.includes('gif');
      const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Untitled';
      const source = typeof data.postLink === 'string' && /^https?:\/\//i.test(data.postLink)
        ? data.postLink
        : `https://reddit.com/r/${subreddit}`;
      const caption =
        `<blockquote>${escapeHtml(title)}</blockquote>\n\n` +
        `🔗 <a href="${escapeHtml(source)}">sumber</a>`;

      await client.sendMessage(chatId, {
        message: caption,
        file: { source: buf, filename: `meme_${Date.now()}.${extFromContentType(ctype)}` },
        parseMode: 'html',
        forceDocument: !isPhoto,
        linkPreview: false,
        replyTo: message.replyToMsgId
      });
      try { await message.delete(); } catch (_e) { /* ignore */ }
    } catch (err) {
      Logger.logUser(telegramId, `Error in meme2 plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal mengambil meme:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
