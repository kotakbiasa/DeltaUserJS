import { saveGroupNote, deleteGroupNote, getAllGroupNotes, getGroupNote } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { escapeHtmlPreservingTgEmoji, parseTgEmojiTemplate } from '../../../utils/customEmoji.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';

/**
 * Entity teks dari berbagai sumber: TL mentah (`_`), entity gaya GramJS
 * (`className`), atau Bot API (`type`). Ketiganya diperiksa saat merender.
 */
type TextEntityLike = {
  offset?: number;
  length?: number;
  _?: string;
  className?: string;
  type?: string;
  url?: string;
  documentId?: string | number | bigint;
  customEmojiId?: string | number | bigint;
};

function unparseEntities(text: string, entities?: TextEntityLike[]): string {
  if (!entities || !entities.length) {return text;}
  const sorted = [...entities].sort((a, b) => {
    const offA = a.offset ?? 0;
    const offB = b.offset ?? 0;
    if (offA !== offB) {return offB - offA;}
    const lenA = a.length ?? 0;
    const lenB = b.length ?? 0;
    return lenA - lenB;
  });

  let res = text;
  for (const ent of sorted) {
    const type = ent._ || ent.className || ent.type || '';
    const offset = ent.offset ?? 0;
    const length = ent.length ?? 0;
    const inner = res.slice(offset, offset + length);
    let tagged = inner;

    if (/bold/i.test(type)) {tagged = `<b>${inner}</b>`;}
    else if (/italic/i.test(type)) {tagged = `<i>${inner}</i>`;}
    else if (/code/i.test(type)) {tagged = `<code>${inner}</code>`;}
    else if (/pre/i.test(type)) {tagged = `<pre>${inner}</pre>`;}
    else if (/strike/i.test(type)) {tagged = `<s>${inner}</s>`;}
    else if (/underline/i.test(type)) {tagged = `<u>${inner}</u>`;}
    else if (/spoiler/i.test(type)) {tagged = `<tg-spoiler>${inner}</tg-spoiler>`;}
    else if (/blockquote/i.test(type)) {tagged = `<blockquote>${inner}</blockquote>`;}
    else if (/texturl|text_link/i.test(type) && ent.url) {tagged = `<a href="${ent.url}">${inner}</a>`;}
    else if (/customemoji|custom_emoji/i.test(type) && (ent.documentId || ent.customEmojiId)) {
      const emojiId = ent.documentId || ent.customEmojiId;
      tagged = `<tg-emoji emoji-id="${emojiId}">${inner}</tg-emoji>`;
    }

    res = res.slice(0, offset) + tagged + res.slice(offset + length);
  }
  return res;
}

// Recall #hashtag: setiap pesan masuk diawali '#namacatatan' → kirim isi note.
/** Grup/supergroup, lewat chatType mtcute dengan fallback className legacy. */
function isGroupChat(message: UserbotMessageLike): boolean {
  if (message.chatType) {return message.chatType === 'group' || message.chatType === 'supergroup';}
  const cls = (message.peerId as { className?: string } | undefined)?.className;
  return cls === 'PeerChat' || cls === 'PeerChannel';
}

export default {
  name: 'gnotes',
  help: {
    title: 'Group Notes (.gsave, .gclear)',
    description: 'Menyimpan dan mengelola catatan grup (#hashtag) yang tersinkronisasi dengan Master Bot.',
    usage: '`.gsave <nama>` — Simpan teks ke note grup\n`.gclear <nama>` — Hapus note grup\n`.gnotes` — Lihat daftar note grup',
    detail: 'Catatan yang disimpan di sini bisa dipanggil oleh siapa saja di grup menggunakan `#namacatatan` jika Master Bot ada di grup.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, _settings: UserbotSettings, _telegramId: number) {
    const text = message.message;
    if (!text) {return;}

    // ===== HASHTAG RECALL: pesan masuk '#nama' → kirim isi note =====
    if (!message.out && /^#[a-z0-9_]+$/i.test(text.trim())) {
      const noteName = text.trim().slice(1).toLowerCase();
      // peerId dari adapter mtcute hanyalah ID angka, sehingga pemeriksaan
      // className gaya GramJS selalu gagal dan recall hashtag tidak pernah jalan.
      if (!isGroupChat(message)) {return;}
      const chatIdR = message.chatId ?? message.peerId;
      if (chatIdR === undefined) {return;}
      const note = getGroupNote(chatIdR, noteName);
      if (note) {
        client.sendMessage(toPeer(message.chatId), {
          message: `📋 <b>#${escapeHtml(noteName)}</b>\n\n${escapeHtmlPreservingTgEmoji(note)}`,
          parseMode: 'html',
          replyTo: message.id
        }).catch(() => { /* ignore */ });
      }
      return;
    }

    if (!message.out) {return;}

    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (!['.gsave', '.gclear', '.gnotes'].includes(cmd)) {return;}

    // Pastikan ini di dalam grup/supergroup
    if (!isGroupChat(message)) {
      await message.edit({ text: `<blockquote>❌ <b>Perintah ini hanya dapat digunakan di dalam Grup!</b></blockquote>`, parseMode: 'html' });
      return;
    }

    const chatId = message.chatId ?? message.peerId;
    if (chatId === undefined) {return;}
    const noteName = parts[1] ? parts[1].toLowerCase() : null;

    if (cmd === '.gsave') {
      if (!noteName) {
        await message.edit({ text: `<blockquote>❌ <b>Format salah.</b>\nGunakan: <code>.gsave namacatatan teks...</code> atau balas pesan teks dengan <code>.gsave namacatatan</code></blockquote>`, parseMode: 'html' });
        return;
      }
      
      if (!/^[a-z0-9_]+$/.test(noteName)) {
        await message.edit({ text: `<blockquote>❌ Nama catatan hanya boleh mengandung huruf, angka, dan underscore (_).</blockquote>`, parseMode: 'html' });
        return;
      }

      let noteText = parts.slice(2).join(' ');
      const replied = await message.getReplyMessage();
      if (!noteText && replied && replied.message) {
        if (replied.entities && replied.entities.length > 0) {
          noteText = unparseEntities(replied.message, replied.entities);
        } else {
          noteText = replied.message;
        }
      }

      if (noteText) {
        noteText = parseTgEmojiTemplate(noteText);
      }

      if (!noteText) {
        await message.edit({ text: `<blockquote>❌ Harap sertakan isi catatan, atau balas pesan yang ingin disimpan.</blockquote>`, parseMode: 'html' });
        return;
      }

      try {
        await saveGroupNote(chatId, noteName, noteText);
        await message.edit({ text: `✅ Catatan Grup <b>#${noteName}</b> berhasil disimpan.\n\nKetik <code>#${noteName}</code> untuk memanggilnya.`, parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: `❌ Gagal menyimpan catatan grup: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    else if (cmd === '.gclear') {
      if (!noteName) {
        await message.edit({ text: `<blockquote>❌ <b>Format salah.</b>\nGunakan: <code>.gclear namacatatan</code></blockquote>`, parseMode: 'html' });
        return;
      }

      try {
        const success = await deleteGroupNote(chatId, noteName);
        if (success) {
          await message.edit({ text: `✅ Catatan Grup <b>#${noteName}</b> berhasil dihapus.`, parseMode: 'html' });
        } else {
          await message.edit({ text: `❌ Catatan Grup <b>#${noteName}</b> tidak ditemukan.`, parseMode: 'html' });
        }
      } catch (err) {
        await message.edit({ text: `❌ Gagal menghapus catatan grup: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    else if (cmd === '.gnotes') {
      try {
        const notes = getAllGroupNotes(chatId);
        if (!notes || notes.length === 0) {
          await message.edit({ text: `<blockquote>📝 <b>Tidak ada catatan grup yang tersimpan di sini.</b></blockquote>`, parseMode: 'html' });
          return;
        }

        let replyText = `📝 <b>Daftar Catatan Grup:</b>\n\n`;
        notes.forEach(note => {
          replyText += `• <code>#${escapeHtml(note)}</code>\n`;
        });
        await message.edit({ text: replyText, parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: `❌ Gagal mengambil daftar catatan grup: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }
};
