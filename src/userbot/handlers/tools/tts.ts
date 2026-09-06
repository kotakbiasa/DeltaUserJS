import fs from 'fs';
import os from 'os';
import path from 'path';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// Text to Speech — .tts
// Endpoint Google Translate TTS (terverifikasi hidup):
//   translate.google.com/translate_tts?ie=UTF-8&q=TEKS&tl=LANG&client=tw-ob
// Audio mp3, teks maksimal 200 karakter (dipotong otomatis).
// Mode:
//   .tts <teks>              — bahasa default Indonesia (id)
//   .tts <kode> <teks>       — mis. .tts en hello there
//   reply teks lalu .tts     — pakai isi pesan yang di-reply
//   reply teks lalu .tts ja  — pakai isi pesan, bahasa ja
// Token pertama hanya dianggap kode bahasa jika ada di daftar
// LANGS (mencegah ".tts halo dunia" salah baca "halo" sebagai kode).
// Hasil dikirim sebagai voice note. Pola kirim mengikuti
// convert.ts (sendFile voiceNote) + file temp di os.tmpdir().
// ============================================================

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TTS_ENDPOINT = 'https://translate.google.com/translate_tts';
const DEFAULT_LANG = 'id';
const MAX_TEXT_LEN = 200;
const TMP_DIR = path.join(os.tmpdir(), 'deltauserjs-tts');

const LANGS = new Set([
  'af', 'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'eo', 'es', 'et', 'fi',
  'fr', 'gu', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'iw', 'ja', 'jw', 'km', 'kn', 'ko', 'la',
  'lb', 'lo', 'lt', 'lv', 'mk', 'ml', 'mr', 'ms', 'my', 'ne', 'nl', 'no', 'pl', 'pt', 'ro', 'ru',
  'si', 'sk', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi',
  'zh-cn', 'zh-tw'
]);

/** Hapus file temp dengan aman (abaikan error). */
function cleanup(...files) {
  for (const f of files) {
    if (!f) {continue;}
    try {
      if (fs.existsSync(f)) {fs.unlinkSync(f);}
    } catch (_e) { /* ignore */ }
  }
}

export default {
  name: 'tts',
  version: '1.0.0',
  description: 'Text to speech Google Translate: teks dikirim sebagai voice note.',
  help: {
    title: '🗣️ Text to Speech (.tts)',
    description: 'Mengubah teks menjadi voice note via Google Translate TTS (maksimal 200 karakter).',
    usage:
      '• `.tts <teks>` — bahasa default Indonesia\n' +
      '• `.tts <kode> <teks>` — mis. `.tts en hello there`, `.tts ja ohayou`\n' +
      '• Balas pesan teks lalu `.tts` atau `.tts <kode>` — memakai isi pesan yang di-reply',
    detail: 'Kode bahasa contoh: id, en, ja, ko, ar, su, jw, zh-cn. Token pertama hanya diperlakukan sebagai kode bahasa jika dikenal. ' +
      'Emoji dibuang dan teks lebih dari 200 karakter dipotong otomatis (batas endpoint Google tw-ob). Hasil dikirim sebagai voice note mp3.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.tts(?![A-Za-z0-9])(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const args = (match[1] || '').trim();
    const parts = args.split(/\s+/).filter(Boolean);
    let lang = DEFAULT_LANG;
    let rest = args;
    if (parts.length > 0 && LANGS.has(parts[0].toLowerCase())) {
      lang = parts[0].toLowerCase();
      rest = parts.slice(1).join(' ');
    }

    let text = rest;
    if (!text) {
      let replied;
      try {
        replied = await message.getReplyMessage();
      } catch (_e) { replied = null; }
      text = replied && typeof replied.message === 'string' ? replied.message : '';
    }

    // Buang emoji (Google TTS sering error) lalu rapikan spasi.
    text = text
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) {
      await message.edit({
        text:
          '<blockquote>❌ <b>Format salah:</b> <code>.tts &lt;teks&gt;</code> atau <code>.tts &lt;kode bahasa&gt; &lt;teks&gt;</code>, ' +
          'atau balas pesan teks lalu ketik <code>.tts</code>.</blockquote>',
        parseMode: 'html'
      });
      return;
    }
    if (text.length > MAX_TEXT_LEN) {text = text.slice(0, MAX_TEXT_LEN);}

    await message.edit({
      text: '<blockquote>⏳ <b>Membuat voice note...</b></blockquote>',
      parseMode: 'html'
    });

    let tmpPath = null;
    try {
      const url = `${TTS_ENDPOINT}?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, 'Referer': 'https://translate.google.com/' }
      });
      if (!res.ok) {
        throw new Error(`Google TTS responded ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) {
        throw new Error('audio tidak valid (terlalu kecil)');
      }

      fs.mkdirSync(TMP_DIR, { recursive: true });
      tmpPath = path.join(TMP_DIR, `tts_${Date.now()}.mp3`);
      fs.writeFileSync(tmpPath, buf);

      await client.sendFile(message.chatId, {
        file: tmpPath,
        voiceNote: true,
        replyTo: message.replyToMsgId || message.id
      });
      try { await message.delete(); } catch (_e) { /* ignore */ }
    } catch (err) {
      Logger.logUser(telegramId, `Error in tts plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal membuat TTS:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    } finally {
      cleanup(tmpPath);
    }
  }
};
