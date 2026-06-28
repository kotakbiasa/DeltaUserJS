import { addGroupWarn, removeGroupWarn, getGroupWarns, resetGroupWarns } from '../../../core/database.js';
import { isAdmin, isBotAdmin } from '../admin/admin_bot.js';
import { replyRich } from '../../../utils/richMessage.js';

function getTargetUser(ctx) {
  if (ctx.message?.reply_to_message) {
    return {
      id: ctx.message.reply_to_message.from.id,
      name: ctx.message.reply_to_message.from.first_name
    };
  }
  const parts = ctx.message?.text?.split(' ');
  if (parts && parts.length > 1) {
    const id = parseInt(parts[1], 10);
    if (!isNaN(id)) return { id, name: String(id) };
  }
  return null;
}

export function registerWarnHandlers(bot) {
  // --- WARN ---
  bot.command('warn', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) {
      return ctx.reply('❌ Saya butuh hak akses admin untuk mengeksekusi peringatan.');
    }

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');
    
    // Admin cannot warn another admin
    try {
      const targetMember = await ctx.getChatMember(target.id);
      if (['creator', 'administrator'].includes(targetMember.status)) {
        return ctx.reply('❌ Anda tidak bisa memberi peringatan kepada sesama admin.');
      }
    } catch (err) {}

    const parts = ctx.message.text.split(' ');
    const reason = parts.length > 1 && isNaN(parseInt(parts[1], 10)) 
      ? parts.slice(1).join(' ') 
      : (parts.length > 2 ? parts.slice(2).join(' ') : 'Melanggar aturan grup');

    try {
      const warnData = await addGroupWarn(ctx.chat.id, target.id, reason);
      
      let text = `⚠️ <b>Pengguna Diperingatkan</b>\n` +
                 `Pengguna: <b>${target.name}</b>\n` +
                 `Peringatan ke: <b>${warnData.count}/3</b>\n` +
                 `Alasan: <i>${reason}</i>`;

      if (warnData.count >= 3) {
        await ctx.banChatMember(target.id);
        await resetGroupWarns(ctx.chat.id, target.id);
        text += `\n\n⛔ <b>Batas peringatan tercapai! Pengguna telah di-banned.</b>`;
      }
      
      await replyRich(ctx, text);
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal memberikan peringatan: ${err.message}</blockquote>` });
    }
  });

  // --- UNWARN ---
  bot.command('unwarn', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!(await isAdmin(ctx))) return;

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');

    try {
      const warnData = await removeGroupWarn(ctx.chat.id, target.id);
      
      if (!warnData) {
        return replyRich(ctx, `✅ <b>${target.name}</b> tidak memiliki peringatan saat ini.`);
      }
      
      await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br><b>Peringatan Dihapus</b>\nPengguna: <b>${target.name}</b>\nSisa peringatan: <b>${warnData.count}/3</b></blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal menghapus peringatan: ${err.message}</blockquote>` });
    }
  });

  // --- WARNS (Check Warns) ---
  bot.command('warns', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    
    // Allow non-admins to check their own warns, but admins can check anyone's
    let target = getTargetUser(ctx);
    let checkOwn = false;
    
    if (!target) {
      target = { id: ctx.from.id, name: ctx.from.first_name };
      checkOwn = true;
    } else {
      if (!(await isAdmin(ctx))) {
        return ctx.reply('❌ Hanya admin yang dapat melihat peringatan member lain. Ketik /warns tanpa membalas pesan untuk melihat peringatan Anda sendiri.');
      }
    }

    try {
      const warnData = getGroupWarns(ctx.chat.id, target.id);
      if (!warnData || warnData.count === 0) {
        return replyRich(ctx, `✅ <b>${target.name}</b> bersih dari peringatan.`);
      }

      let text = `📋 <b>Daftar Peringatan</b>\nPengguna: <b>${target.name}</b>\nTotal: <b>${warnData.count}/3</b>\n\n<b>Alasan Terakhir:</b>\n`;
      warnData.reasons.forEach((r, idx) => {
        text += `${idx + 1}. ${r.reason}\n`;
      });

      await replyRich(ctx, text);
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal mengambil data peringatan: ${err.message}</blockquote>` });
    }
  });
}
