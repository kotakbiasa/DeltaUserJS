// @ts-nocheck
import { saveGroupNote, deleteGroupNote, getGroupNote, getAllGroupNotes } from '../../../infrastructure/database.js';
import { parseRichText } from '../../../utils/richParser.js';
import { replyRich, quote, b, code } from '../../../utils/richMessage.js';
import { isAdmin } from '../admin/admin_bot.js';

const NOTE_NAME_RE = /^[a-z0-9_]+$/;

export function registerNotesHandlers(bot) {
  // --- SAVE NOTE ---
  bot.command('save', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!(await isAdmin(ctx))) return;

    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
      return replyRich(
        ctx,
        quote(`${b('❌ FORMAT SALAH')}\nGunakan: ${code('/save namacatatan [isi]')} ` +
          `atau balas sebuah pesan dengan ${code('/save namacatatan')}.`),
      );
    }

    const noteName = parts[1].toLowerCase();
    if (!NOTE_NAME_RE.test(noteName)) {
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
      await replyRich(ctx, quote(
        `${b('✅ BERHASIL')}\nCatatan ${b(`#${noteName}`)} berhasil disimpan.\n\n` +
        `Anggota grup dapat memanggilnya dengan mengetik ${code(`#${noteName}`)}.`,
      ));
    } catch (err) {
      await replyRich(ctx, quote(`${b('❌ KESALAHAN')}\nGagal menyimpan catatan: ${err.message}`));
    }
  });

  // --- CLEAR NOTE ---
  bot.command('clear', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!(await isAdmin(ctx))) return;

    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
      return replyRich(ctx, quote(`${b('❌ KESALAHAN')}\nHarap sebutkan nama catatan. Contoh: ${code('/clear rules')}`));
    }

    const noteName = parts[1].toLowerCase();
    try {
      const success = await deleteGroupNote(ctx.chat.id, noteName);
      if (success) {
        await replyRich(ctx, quote(`${b('✅ BERHASIL')}\nCatatan ${b(`#${noteName}`)} berhasil dihapus.`));
      } else {
        await replyRich(ctx, quote(`${b('❌ KESALAHAN')}\nCatatan ${b(`#${noteName}`)} tidak ditemukan.`));
      }
    } catch (err) {
      await replyRich(ctx, quote(`${b('❌ KESALAHAN')}\nGagal menghapus catatan: ${err.message}`));
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

      const lines = notes.map((note) => `• ${code(`#${note}`)}`).join('\n');
      await replyRich(ctx, quote(
        `${b('📝 Daftar Catatan Grup')}\n\n${lines}\n\nKetik nama catatan untuk melihat isinya.`,
        { expandable: notes.length > 8 },
      ));
    } catch (err) {
      await replyRich(ctx, quote(`${b('❌ KESALAHAN')}\nGagal mengambil daftar catatan: ${err.message}`));
    }
  });

  // --- AUTO REPLY LISTENER ---
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const matches = ctx.message.text.match(/#([a-z0-9_]+)/gi);
    if (!matches) return next();

    // Only respond to the first hashtag to avoid spam.
    const firstTag = matches[0].substring(1).toLowerCase();
    const noteText = getGroupNote(ctx.chat.id, firstTag);
    if (noteText) {
      const { text: parsedText, keyboard } = parseRichText(noteText, ctx.from, ctx.chat);
      const options = {
        markdown: true,
        reply_parameters: { message_id: ctx.message.message_id },
      };
      if (keyboard) options.reply_markup = keyboard;
      await replyRich(ctx, parsedText, options).catch(() => {});
    }

    return next();
  });
}
