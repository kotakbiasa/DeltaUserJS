import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// Keyword Filter — auto-reply berbasis kata kunci (grup & private)
// Perintah:
//   .addfilter <trigger> <reply>  — tambah/perbarui filter
//   .delfilter <trigger>          — hapus filter
//   .listfilter                   — daftar semua trigger chat ini
// Setiap pesan masuk (non-out) yang mengandung trigger
// (case-insensitive, kata utuh / word boundary) otomatis dibalas
// dengan teks reply yang tersimpan. Trigger '*' membalas semua
// pesan masuk. State in-memory per chatKey, bertahan antar
// hot-reload lewat globalThis (hilang saat proses restart).
// ============================================================

// chatKey -> Map<triggerLower, { trigger: string, replyText: string }>
const STORE_KEY = '__deltauserjs_kwfilter_store__';
const filterStore = (globalThis)[STORE_KEY] || new Map();
(globalThis)[STORE_KEY] = filterStore;

const PREVIEW_MAX = 40;

// ---- Helpers ----

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex kata utuh (whole-word) case-insensitive untuk sebuah trigger.
 * Lookaround dipakai agar tepi trigger yang bukan karakter kata
 * (mis. "!", emoji) tetap diperlakukan sebagai batas kata.
 */
function buildTriggerRegex(trigger) {
  const escaped = escapeRegExp(trigger);
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
    'iu'
  );
}

function getChatFilters(chatKey) {
  let chatMap = filterStore.get(chatKey);
  if (!chatMap) {
    chatMap = new Map();
    filterStore.set(chatKey, chatMap);
  }
  return chatMap;
}

function previewText(text) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
  if (oneLine.length <= PREVIEW_MAX) {return oneLine;}
  return `${oneLine.slice(0, PREVIEW_MAX - 1)}…`;
}

// ---- Auto-reply pesan masuk (non-out) ----
async function autoReplyIncoming(client, message, chatKey, text) {
  const chatMap = filterStore.get(chatKey);
  if (!chatMap || chatMap.size === 0) {return;}

  // 1. Trigger spesifik diprioritaskan di atas wildcard '*'
  let matched = null;
  for (const entry of chatMap.values()) {
    if (entry.trigger === '*') {continue;}
    if (buildTriggerRegex(entry.trigger).test(text)) {
      matched = entry;
      break;
    }
  }

  // 2. Wildcard '*' — balas semua pesan masuk
  if (!matched) {
    const wildcard = chatMap.get('*');
    if (wildcard) {matched = wildcard;}
  }

  if (!matched) {return;}

  try {
    await client.sendMessage(message.chatId, {
      message: matched.replyText,
      linkPreview: false,
      replyTo: message.id
    });
  } catch (err) {
    Logger.logSystem(
      `kwfilter: gagal auto-reply "${matched.trigger}" di chat ${chatKey}: ${err instanceof Error ? err.message : String(err)}`,
      'ERROR'
    );
  }
}

export default {
  name: 'kwfilter',
  version: '1.0.0',
  description: 'Filter auto-reply kata kunci untuk grup & private: pesan yang mengandung trigger dibalas otomatis.',
  help: {
    title: '🔑 Keyword Filter (.addfilter / .delfilter / .listfilter)',
    description: 'Auto-reply kata kunci di grup & private: setiap pesan masuk yang mengandung trigger (case-insensitive, kata utuh) dibalas otomatis dengan teks yang disimpan.',
    usage:
      '• `.addfilter <trigger> <reply>` — tambah/perbarui filter (boleh juga balas pesan teks tanpa <reply> untuk memakai isi pesan itu)\n' +
      '• `.delfilter <trigger>` — hapus filter\n' +
      '• `.listfilter` — daftar semua trigger di chat ini\n' +
      '• `.addfilter * <reply>` — mode wildcard: balas SEMUA pesan masuk',
    detail:
      'Matching case-insensitive dengan kata utuh (word boundary), jadi trigger "halo" tidak akan menangkap "haloan". ' +
      'Filter disimpan per-chat (grup & private didukung) dan hanya aktif di chat tempat ia dibuat. ' +
      'Trigger spesifik diprioritaskan di atas wildcard `*`. Balasan dikirim sebagai reply ke pesan pemicu dengan teks apa adanya. ' +
      'State in-memory: filter bertahan antar hot-reload tapi hilang saat proses userbot direstart.'
  },
  async execute(client, message, _settings, _telegramId) {
    const text = message.message;
    if (!text) {return;}
    const chatId = message.chatId;
    if (chatId === null || chatId === undefined) {return;}
    const chatKey = String(chatId);

    // ============ 1. Auto-reply pesan masuk (non-out) ============
    if (!message.out) {
      await autoReplyIncoming(client, message, chatKey, text);
      return;
    }

    // ============ 2. Perintah (pesan keluar / out) ============

    // ---- 2a. .addfilter <trigger> <reply> ----
    const addMatch = text.match(/^\.addfilter(?:\s+([\s\S]+))?$/i);
    if (addMatch) {
      const rest = (addMatch[1] || '').trim();
      if (!rest) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Format salah:</b> <code>.addfilter &lt;trigger&gt; &lt;reply&gt;</code>\n` +
            `Contoh: <code>.addfilter halo Hai! ada apa?</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const sp = rest.indexOf(' ');
      const trigger = sp === -1 ? rest : rest.slice(0, sp);
      let replyText = sp === -1 ? '' : rest.slice(sp + 1).trim();

      if (!replyText) {
        // Fallback ala modul Python asli: pakai isi pesan yang di-reply
        const replied = await message.getReplyMessage();
        if (replied && replied.message) {replyText = replied.message;}
      }

      if (!replyText) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Reply belum diisi.</b>\n` +
            `Gunakan: <code>.addfilter &lt;trigger&gt; &lt;reply&gt;</code> atau balas sebuah pesan teks.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const chatMap = getChatFilters(chatKey);
      const key = trigger.toLowerCase();
      const existed = chatMap.has(key);
      chatMap.set(key, { trigger, replyText });
      await message.edit({
        text: existed
          ? `✏️ Filter <code>${escapeHtml(trigger)}</code> berhasil <b>diperbarui</b>.`
          : `✅ Filter <code>${escapeHtml(trigger)}</code> berhasil disimpan.\nSetiap pesan yang mengandung kata itu akan dibalas otomatis.`,
        parseMode: 'html'
      });
      return;
    }

    // ---- 2b. .delfilter <trigger> ----
    const delMatch = text.match(/^\.delfilter(?:\s+([\s\S]+))?$/i);
    if (delMatch) {
      const trigger = (delMatch[1] || '').trim();
      if (!trigger) {
        await message.edit({
          text: `<blockquote>❌ <b>Format salah:</b> <code>.delfilter &lt;trigger&gt;</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const chatMap = filterStore.get(chatKey);
      const key = trigger.toLowerCase();
      if (!chatMap || !chatMap.has(key)) {
        await message.edit({
          text: `<blockquote>❌ Filter <code>${escapeHtml(trigger)}</code> tidak ditemukan di chat ini.\nCek daftarnya: <code>.listfilter</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      chatMap.delete(key);
      if (chatMap.size === 0) {filterStore.delete(chatKey);}
      await message.edit({
        text: `🗑️ Filter <code>${escapeHtml(trigger)}</code> berhasil dihapus.`,
        parseMode: 'html'
      });
      return;
    }

    // ---- 2c. .listfilter ----
    if (/^\.listfilter\s*$/i.test(text)) {
      const chatMap = filterStore.get(chatKey);
      const entries = chatMap ? [...chatMap.values()] : [];
      if (entries.length === 0) {
        await message.edit({
          text:
            `<blockquote>📝 Belum ada filter di chat ini.\n` +
            `Tambah dengan <code>.addfilter &lt;trigger&gt; &lt;reply&gt;</code>.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      let listText = `📝 <b>Daftar Filter di chat ini</b>\n\n`;
      for (const entry of entries) {
        listText += `• <code>${escapeHtml(entry.trigger)}</code> → ${escapeHtml(previewText(entry.replyText))}\n`;
      }
      listText += `\n⤿ Total: <b>${entries.length}</b> filter`;
      await message.edit({ text: listText, parseMode: 'html' });
      return;
    }
  }
};
