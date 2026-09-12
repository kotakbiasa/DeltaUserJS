import fs from 'fs';
import { InputFile } from 'grammy';
import config from '../../config.js';
import { UserbotModel } from '../../infrastructure/database.js';
import { Logger } from '../../utils/logger.js';

export function registerOwnerHandlers(bot) {
  // --- Owner utility commands ---
  bot.command('backup', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) {return;}
    await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Menyiapkan backup database...</blockquote>` });
    try {
      const users = await UserbotModel.find({}).lean();
      const backupData = JSON.stringify(users, null, 2);
      const filename = `database_backup_${Date.now()}.json`;
      fs.writeFileSync(filename, backupData);
      await ctx.replyWithDocument(new InputFile(filename, 'database_backup.json'), {
        caption: `📦 Backup MongoDB Userbots\n${new Date().toLocaleString()}`,
      });
      // Clean up temp file after sending
      setTimeout(() => { try { fs.unlinkSync(filename); } catch (_) { /* empty */ } }, 60000);
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal backup: ${err instanceof Error ? err.message : String(err)}</blockquote>` });
    }
  });

  bot.command('stats_db', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) {return;}
    try {
      const totalUsers = await UserbotModel.countDocuments();
      const activeUsers = await UserbotModel.countDocuments({ is_active: 1 });
      await ctx.replyWithRichMessage({ html: `<h1 align="center">📊 Database Stats</h1>` +
        `<table bordered striped><caption>📋 Statistik Userbot</caption>` +
        `<tr><th>Item</th><th>Jumlah</th></tr>` +
        `<tr><td>👥 Total Userbot</td><td align="center"><code>${totalUsers}</code></td></tr>` +
        `<tr><td>✅ Aktif</td><td align="center"><code>${activeUsers}</code></td></tr>` +
        `</table>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>${err instanceof Error ? err.message : String(err)}</blockquote>` });
    }
  });

  bot.command('restart', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) {return;}
    await ctx.replyWithRichMessage({ html: `<h1 align="center">🔄 Restarting Bot</h1><blockquote>Sistem sedang dimuat ulang. Harap tunggu beberapa saat hingga bot menyala kembali.</blockquote>` });
    await Logger.logSystem('🔄 Restart command received from owner. Exiting process...', 'INFO');
    setTimeout(() => {
      // Use exit code 0 for graceful restart (PM2/systemd will restart it)
      process.exit(0);
    }, 1000);
  });

  bot.command('approve', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) {return;}
    const text = ctx.message?.text?.trim() || '';
    const parts = text.split(/\s+/);
    const targetId = Number(parts[1]);
    if (!targetId || isNaN(targetId)) {
      return ctx.replyWithRichMessage({ html: `<blockquote><b>Format:</b> <code>/approve &lt;telegram_id&gt;</code></blockquote>` });
    }
    const { approveUser } = await import('../state/approvedUsers.js');
    const { setTrialClaimed } = await import('../../infrastructure/database.js');
    approveUser(targetId);
    try { await setTrialClaimed(targetId); } catch (_) { /* ignore */ }
    await ctx.replyWithRichMessage({
      html: `<blockquote><b>✅ User Disetujui</b><br>ID <code>${targetId}</code> telah disetujui untuk uji coba gratis 7 hari.</blockquote>`
    });
    try {
      await ctx.api.sendMessage(
        targetId,
        `🎉 <b>Permintaan Uji Coba Disetujui!</b>\n\n` +
        `<blockquote>Owner telah menyetujui permohonan coba gratis userbot <b>7 Hari</b> untuk akun Anda.</blockquote>\n\n` +
        `Silakan klik tombol di bawah untuk mulai mendaftar userbot Anda:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
              [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
            ],
          },
        }
      );
    } catch (_) { /* ignore */ }
  });

  bot.command('reject', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) {return;}
    const text = ctx.message?.text?.trim() || '';
    const parts = text.split(/\s+/);
    const targetId = Number(parts[1]);
    if (!targetId || isNaN(targetId)) {
      return ctx.replyWithRichMessage({ html: `<blockquote><b>Format:</b> <code>/reject &lt;telegram_id&gt;</code></blockquote>` });
    }
    const { revokeUser } = await import('../state/approvedUsers.js');
    revokeUser(targetId);
    await ctx.replyWithRichMessage({
      html: `<blockquote><b>❌ User Ditolak / Dicabut</b><br>Akses ID <code>${targetId}</code> telah ditolak/dicabut.</blockquote>`
    });
    try {
      await ctx.api.sendMessage(
        targetId,
        `<blockquote>❌ <b>Permintaan Uji Coba Ditolak</b><br>Maaf, permohonan coba gratis Anda belum disetujui oleh owner saat ini.</blockquote>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
            ],
          },
        }
      );
    } catch (_) { /* ignore */ }
  });

  bot.command('pending', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) {return;}
    const { getPendingApprovals } = await import('../state/approvedUsers.js');
    const pendingList = getPendingApprovals();
    if (pendingList.length === 0) {
      return ctx.replyWithRichMessage({ html: `<blockquote>ℹ️ Tidak ada permintaan approval yang pending.</blockquote>` });
    }
    const rows = pendingList.map((p) => {
      const username = p.username ? `@${p.username}` : '—';
      const timeStr = new Date(p.requestedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
      return `<tr><td><code>${p.userId}</code></td><td>${p.name}</td><td>${username}</td><td>${timeStr}</td></tr>`;
    }).join('');

    const keyboard = {
      inline_keyboard: pendingList.slice(0, 5).map(p => [
        { text: `✅ Setujui ${p.name}`, callback_data: `approve_trial:${p.userId}` },
        { text: `❌ Tolak`, callback_data: `reject_trial:${p.userId}` },
      ])
    };

    await ctx.replyWithRichMessage({
      html: `<h1 align="center">⏳ Permintaan Approval Pending</h1>` +
        `<blockquote>Total: <b>${pendingList.length}</b> permintaan pending</blockquote>` +
        `<table bordered striped>` +
        `<tr><th>ID</th><th>Nama</th><th>Username</th><th>Waktu</th></tr>` +
        rows +
        `</table>`,
    }, { reply_markup: keyboard });
  });
}
