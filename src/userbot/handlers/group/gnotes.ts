import { saveGroupNote, deleteGroupNote, getAllGroupNotes } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';

export default {
  name: 'gnotes',
  help: {
    title: 'Group Notes (.gsave, .gclear)',
    description: 'Menyimpan dan mengelola catatan grup (#hashtag) yang tersinkronisasi dengan Master Bot.',
    usage: '`.gsave <nama>` — Simpan teks ke note grup\n`.gclear <nama>` — Hapus note grup\n`.gnotes` — Lihat daftar note grup',
    detail: 'Catatan yang disimpan di sini bisa dipanggil oleh siapa saja di grup menggunakan `#namacatatan` jika Master Bot ada di grup.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const text = message.message;
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (!['.gsave', '.gclear', '.gnotes'].includes(cmd)) {return;}

    // Pastikan ini di dalam grup/supergroup
    const peerId = message.peerId;
    const isGroup = peerId.className === 'PeerChat' || peerId.className === 'PeerChannel';
    if (!isGroup) {
      await message.edit({ text: `<blockquote>❌ <b>Perintah ini hanya dapat digunakan di dalam Grup!</b></blockquote>`, parseMode: 'html' });
      return;
    }

    const chatId = peerId.chatId || peerId.channelId;
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
        noteText = replied.message;
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
