import { saveGroupNote, deleteGroupNote, getGroupNote, getAllGroupNotes } from '../../../core/database.js';
import { parseRichText } from '../../../utils/richParser.js';
import { isAdmin } from '../admin/admin_bot.js';

export function registerNotesHandlers(bot) {
  // --- SAVE NOTE ---
  bot.command('save', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!(await isAdmin(ctx))) return;

    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
      return ctx.reply('❌ Format salah.\nGunakan: <code>/save namacatatan [isi catatan]</code> atau balas pesan dengan <code>/save namacatatan</code>.', { parse_mode: 'HTML' });
    }

    const noteName = parts[1].toLowerCase();
    
    // Jangan izinkan nama catatan yang aneh
    if (!/^[a-z0-9_]+$/.test(noteName)) {
      return ctx.reply('❌ Nama catatan hanya boleh mengandung huruf, angka, dan underscore (_).');
    }

    let noteText = '';
    
    if (ctx.message.reply_to_message) {
      noteText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      if (!noteText) {
        return ctx.reply('❌ Hanya teks yang bisa disimpan sebagai catatan saat ini.');
      }
    } else {
      if (parts.length < 3) {
        return ctx.reply('❌ Harap sertakan isi catatan, atau balas pesan yang ingin disimpan.');
      }
      noteText = parts.slice(2).join(' ');
    }

    try {
      await saveGroupNote(ctx.chat.id, noteName, noteText);
      await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br>Catatan <b>#${noteName}</b> berhasil disimpan.\n\nAnggota grup sekarang bisa memanggilnya dengan mengetik <code>#${noteName}</code></blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal menyimpan catatan: ${err.message}</blockquote>` });
    }
  });

  // --- CLEAR NOTE ---
  bot.command('clear', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!(await isAdmin(ctx))) return;

    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
      return ctx.reply('❌ Harap sebutkan nama catatan.\nContoh: <code>/clear rules</code>', { parse_mode: 'HTML' });
    }

    const noteName = parts[1].toLowerCase();

    try {
      const success = await deleteGroupNote(ctx.chat.id, noteName);
      if (success) {
        await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br>Catatan <b>#${noteName}</b> berhasil dihapus.</blockquote>` });
      } else {
        await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Catatan <b>#${noteName}</b> tidak ditemukan.</blockquote>` });
      }
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal menghapus catatan: ${err.message}</blockquote>` });
    }
  });

  // --- LIST NOTES ---
  bot.command('notes', async (ctx) => {
    if (ctx.chat.type === 'private') return;

    try {
      const notes = getAllGroupNotes(ctx.chat.id);
      if (!notes || notes.length === 0) {
        return ctx.reply('📝 Tidak ada catatan yang tersimpan di grup ini.');
      }

      let text = '📝 <b>Daftar Catatan Grup:</b>\n\n';
      notes.forEach(note => {
        text += `- <code>#${note}</code>\n`;
      });
      text += '\n<i>Ketik nama catatan untuk melihat isinya.</i>';

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal mengambil daftar catatan: ${err.message}</blockquote>` });
    }
  });

  // --- AUTO REPLY LISTENER ---
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const text = ctx.message.text;
    
    // Cari semua string yang berawalan #
    const matches = text.match(/#([a-z0-9_]+)/gi);
    if (!matches) return next();

    // Untuk mencegah spam bot, kita hanya akan merespon hashtag pertama jika ada banyak
    const firstTag = matches[0].substring(1).toLowerCase();
    
    const noteText = getGroupNote(ctx.chat.id, firstTag);
    if (noteText) {
      const { text: parsedText, keyboard } = parseRichText(noteText, ctx.from, ctx.chat);
      const options = {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id }
      };
      if (keyboard) options.reply_markup = keyboard;
      
      await ctx.reply(parsedText, options);
    }

    return next();
  });
}
