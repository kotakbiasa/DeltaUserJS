import { escapeHtml } from '../../../utils/richMessage.js';
import { updateUserbotFeature, getUserbotSession } from '../../../infrastructure/database.js';
import {
  DEFAULT_EMOJIS,
  getAllEmojis,
  extractEmojiFromContext,
  formatTgEmoji
} from '../../../utils/customEmoji.js';

const VALID_KEYS = [
  'ping',
  'pong',
  'proses',
  'loading',
  'done',
  'success',
  'batal',
  'error',
  'warn',
  'uptime',
  'speed',
  'status',
  'afk',
  'item',
  'time'
];

export default {
  name: 'emoji',
  version: '1.0.0',
  description: 'Kustomisasi emoji premium untuk respon userbot & utilitas inspeksi custom emoji.',
  help: {
    title: 'Emoji Premium (.setemoji / .emojis / .getemoji)',
    description: 'Mengatur kustomisasi emoji Telegram Premium untuk respon userbot (ping, status proses, done, error, afk, dll) serta inspeksi emoji ID.',
    usage: '• `.setemoji <tipe> <emoji/id/tag>` — Ubah emoji respon\n' +
      '• `.setemoji <tipe>` (sambil reply custom emoji) — Pasang emoji dari reply\n' +
      '• `.setemoji reset [tipe]` — Reset emoji ke default\n' +
      '• `.emojis` — Lihat daftar konfigurasi emoji aktif\n' +
      '• `.getemoji` (sambil reply) — Ambil ID & tag emoji custom dari pesan',
    detail: 'Tipe yang didukung: ping, pong, proses/loading, done/success, batal/error, warn, uptime, speed, status, afk, item, time.\n' +
      'Mendukung custom emoji Telegram Premium langsung, numeric ID, tag <tg-emoji>, maupun unicode biasa.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const text = message.message.trim();
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (!['.setemoji', '.emojis', '.myemojis', '.getemoji', '.emojinfo'].includes(cmd)) {
      return;
    }

    const idNum = Number(telegramId);
    const session = getUserbotSession(idNum) || settings || {};
    const customMap: Record<string, string> = { ...(session.custom_emojis || {}) };

    // ============================================================
    // 1. .emojis / .myemojis — Tampilkan status semua emoji
    // ============================================================
    if (cmd === '.emojis' || cmd === '.myemojis') {
      const all = getAllEmojis(session);
      let listHtml = '';

      for (const [key, item] of Object.entries(all)) {
        const badge = item.isCustom ? '⭐ <i>Custom</i>' : '⚪ <i>Default</i>';
        listHtml += `• <b>${key}</b>: ${item.value} [${badge}]\n`;
      }

      const replyHtml =
        `💎 <b>Daftar Emoji Respons Userbot</b>\n\n` +
        `<blockquote>${listHtml.trim()}</blockquote>\n\n` +
        `<blockquote>💡 <b>Cara Mengubah:</b>\n` +
        `• <code>.setemoji &lt;tipe&gt; &lt;emoji&gt;</code>\n` +
        `• Atau balas custom emoji dengan <code>.setemoji &lt;tipe&gt;</code>\n` +
        `• Reset: <code>.setemoji reset &lt;tipe&gt;</code></blockquote>`;

      await message.edit({
        text: replyHtml,
        parseMode: 'html'
      });
      return;
    }

    // ============================================================
    // 2. .getemoji / .emojinfo — Inspeksi custom emoji dari reply
    // ============================================================
    if (cmd === '.getemoji' || cmd === '.emojinfo') {
      const replied = await message.getReplyMessage();
      const extractedList: { id: string; char: string }[] = [];

      // Periksa pesan yang di-reply
      if (replied) {
        // Cek entities
        if (replied.entities && Array.isArray(replied.entities)) {
          for (const ent of replied.entities) {
            if (ent.className === 'MessageEntityCustomEmoji' && ent.documentId) {
              const docId = ent.documentId.toString();
              const raw = String(replied.message || '');
              const char = raw.slice(ent.offset, ent.offset + ent.length) || '⭐';
              if (!extractedList.some(e => e.id === docId)) {
                extractedList.push({ id: docId, char });
              }
            }
          }
        }

        // Cek sticker / media document custom emoji
        const doc = replied.media?.document;
        if (doc && doc.id) {
          const isCustomEmojiSticker = doc.attributes?.some((a: any) => a.className === 'DocumentAttributeCustomEmoji');
          if (isCustomEmojiSticker) {
            const docId = doc.id.toString();
            const stickerAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeSticker');
            const char = stickerAttr?.alt || '⭐';
            if (!extractedList.some(e => e.id === docId)) {
              extractedList.push({ id: docId, char });
            }
          }
        }
      }

      // Periksa juga argumen perintah jika ada (misal .getemoji <id>)
      if (parts[1]) {
        const argExtract = extractEmojiFromContext(parts.slice(1).join(' '), message, replied);
        if (argExtract?.documentId && !extractedList.some(e => e.id === argExtract.documentId)) {
          extractedList.push({ id: argExtract.documentId, char: argExtract.char || '⭐' });
        }
      }

      if (extractedList.length === 0) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Tidak ditemukan custom emoji.</b>\n` +
            `Balas pesan atau stiker emoji Telegram Premium yang ingin kamu periksa, lalu ketik <code>.getemoji</code>.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      let infoText = `🔍 <b>Informasi Custom Emoji Ditemukan (${extractedList.length})</b>\n\n`;

      extractedList.forEach((item, index) => {
        const tag = formatTgEmoji(item.id, item.char);
        infoText +=
          `<b>${index + 1}. Preview:</b> ${tag}\n` +
          `<blockquote>` +
          `🆔 <b>ID:</b> <code>${item.id}</code>\n` +
          `🔤 <b>Fallback:</b> <code>${escapeHtml(item.char)}</code>\n` +
          `🏷️ <b>Tag HTML:</b> <code>&lt;tg-emoji emoji-id="${item.id}"&gt;${escapeHtml(item.char)}&lt;/tg-emoji&gt;</code>\n` +
          `⚡ <b>Shortcode:</b> <code>{emoji:${item.id}}</code>\n` +
          `🚀 <b>Set ke Ping:</b> <code>.setemoji ping ${item.id}</code>\n` +
          `⏳ <b>Set ke Proses:</b> <code>.setemoji proses ${item.id}</code>\n` +
          `✅ <b>Set ke Done:</b> <code>.setemoji done ${item.id}</code></blockquote>\n\n`;
      });

      await message.edit({
        text: infoText.trim(),
        parseMode: 'html'
      });
      return;
    }

    // ============================================================
    // 3. .setemoji — Set atau Reset emoji
    // ============================================================
    if (cmd === '.setemoji') {
      const subCmd = (parts[1] || '').toLowerCase();

      // Reset handler
      if (subCmd === 'reset') {
        const targetKey = (parts[2] || '').toLowerCase();
        if (!targetKey) {
          // Reset semua
          await updateUserbotFeature(idNum, 'custom_emojis', {});
          await message.edit({
            text: `<blockquote>✅ <b>Berhasil:</b> Semua custom emoji respons telah direset ke default.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }

        if (!VALID_KEYS.includes(targetKey)) {
          await message.edit({
            text: `<blockquote>❌ <b>Tipe tidak valid:</b> <code>${escapeHtml(targetKey)}</code>\nTipe yang tersedia:\n<code>${VALID_KEYS.join(', ')}</code></blockquote>`,
            parseMode: 'html'
          });
          return;
        }

        delete customMap[targetKey];
        await updateUserbotFeature(idNum, 'custom_emojis', customMap);
        const def = DEFAULT_EMOJIS[targetKey] || '⭐';
        await message.edit({
          text: `<blockquote>✅ <b>Berhasil:</b> Emoji <b>${targetKey}</b> telah direset ke default (${def}).</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (!subCmd) {
        await message.edit({
          text:
            `<blockquote>📚 <b>Penggunaan:</b> <code>.setemoji &lt;tipe&gt; &lt;emoji/id&gt;</code>\n\n` +
            `<b>Tipe yang tersedia:</b>\n<code>${VALID_KEYS.join(', ')}</code>\n\n` +
            `<b>Contoh:</b>\n` +
            `• <code>.setemoji ping 5368324170671202286</code>\n` +
            `• <code>.setemoji proses ⏳</code>\n` +
            `• Balas pesan custom emoji lalu ketik <code>.setemoji done</code>\n` +
            `• Ketik <code>.emojis</code> untuk melihat daftar konfigurasi.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const targetKey = subCmd;
      if (!VALID_KEYS.includes(targetKey)) {
        await message.edit({
          text: `<blockquote>❌ <b>Tipe emoji tidak dikenal:</b> <code>${escapeHtml(targetKey)}</code>\n\nTipe yang didukung:\n<code>${VALID_KEYS.join(', ')}</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      // Ambil replied message jika ada
      const replied = await message.getReplyMessage();
      const rawArg = parts.slice(2).join(' ');

      // Ekstrak emoji
      const extracted = extractEmojiFromContext(rawArg, message, replied);

      if (!extracted || (!extracted.tag && !extracted.char)) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Emoji tidak terdeteksi.</b>\n` +
            `Harap sertakan emoji, tag HTML, atau balas pesan yang berisi custom emoji.\n\n` +
            `Contoh:\n` +
            `• <code>.setemoji ${targetKey} 5368324170671202286</code>\n` +
            `• Atau balas custom emoji lalu ketik: <code>.setemoji ${targetKey}</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const finalTag = extracted.tag || extracted.char || '⭐';
      customMap[targetKey] = finalTag;

      await updateUserbotFeature(idNum, 'custom_emojis', customMap);

      const typeDetail = extracted.isCustomEmoji ? '💎 Custom Emoji Premium' : '🔤 Unicode Emoji';

      await message.edit({
        text:
          `<blockquote>✅ <b>Emoji Berhasil Diperbarui!</b>\n\n` +
          `• <b>Tipe:</b> <code>${targetKey}</code>\n` +
          `• <b>Nilai Baru:</b> ${finalTag}\n` +
          `• <b>Kategori:</b> ${typeDetail}\n\n` +
          `Respons userbot untuk <b>${targetKey}</b> kini akan menggunakan emoji ini.</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
