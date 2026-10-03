import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

const MAX_QUERY_LENGTH = 500; // Batas karakter teks per request API MyMemory
const LANGUAGE_CODE = '[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?';

export default defineCommand({
  name: 'tr',
  version: '1.0.0',
  description: 'Terjemahkan teks via MyMemory Translation API.',
  help: {
    title: 'Translate (.tr)',
    description: 'Menerjemahkan teks ke bahasa target menggunakan MyMemory API.',
    usage: '`.tr <kode> <teks>` atau reply pesan lalu `.tr <kode>`',
    detail: 'Contoh: `.tr en halo semua`. Bisa juga reply sebuah pesan lalu kirim `.tr en`. Sumber default: id (Indonesia). Maksimal 500 karakter per terjemahan.'
  },
  // Pola lama sengaja dipertahankan: argumen pertama wajib berupa kode
  // bahasa, sedangkan command dengan kode invalid diabaikan (bukan diberi
  // pesan usage). Group 1/2 mengikuti kontrak defineCommand.
  pattern: new RegExp(`^\\.(tr)(?:\\s+(${LANGUAGE_CODE}(?:\\s+[\\s\\S]+)?))?$`, 'i'),
  args: 'required',
  usage: '<code>.tr &lt;kode&gt; &lt;teks&gt;</code>\nContoh: <code>.tr en halo semua</code> atau reply pesan lalu <code>.tr en</code>',

  async run({ message, arg, telegramId }) {
    const parts = arg.match(new RegExp(`^(${LANGUAGE_CODE})(?:\\s+([\\s\\S]+))?$`, 'i'));
    if (!parts) {return;}

    const target = parts[1].trim().toLowerCase();
    let text = (parts[2] || '').trim();

    if (!text && message.replyToMsgId) {
      try {
        const replied = await message.getReplyMessage();
        if (replied !== null && replied !== undefined && replied.message) {
          text = replied.message.trim();
        }
      } catch (_e) {
        // Abaikan jika pesan reply tidak bisa diambil
      }
    }

    if (!text) {
      await message.edit({
        text: '<blockquote>❌ <b>Teks kosong:</b> berikan teks setelah kode bahasa atau reply sebuah pesan.</blockquote>',
        parseMode: 'html'
      });
      return;
    }

    let truncated = false;
    if (text.length > MAX_QUERY_LENGTH) {
      text = text.slice(0, MAX_QUERY_LENGTH);
      truncated = true;
    }

    await message.edit({
      text: `<blockquote>⏳ <b>Menerjemahkan ke "${escapeHtml(target)}"...</b></blockquote>`,
      parseMode: 'html'
    });

    try {
      const api = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=id%7C${encodeURIComponent(target)}`;
      const res = await fetchWithTimeout(api, { headers: { 'User-Agent': 'DeltaUserJS/1.0' } }, 15_000);
      if (!res.ok) {
        throw new Error(`MyMemory responded ${res.status}`);
      }
      const data = await res.json();
      const responseStatus = data.responseStatus;
      const translated = data.responseData?.translatedText;
      if (responseStatus !== null && responseStatus !== undefined && responseStatus !== 200) {
        const detail = data.responseDetails || 'Terjemahan gagal';
        throw new Error(String(detail));
      }
      if (typeof translated !== 'string' || !translated) {
        throw new Error('Respons tidak valid dari MyMemory');
      }

      let out = `🌐 <b>Translate</b>\n\n<blockquote><i>${escapeHtml(text)}</i>\n<b>${escapeHtml(translated)}</b></blockquote>\n<i>id → ${escapeHtml(target)}</i>`;
      if (truncated) {
        out += `\n\n⚠️ <b>Teks dipotong</b> menjadi ${MAX_QUERY_LENGTH} karakter karena melebihi batas API.`;
      }
      await message.edit({
        text: out,
        parseMode: 'html',
        linkPreview: false
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in translate plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal menerjemahkan:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
});
