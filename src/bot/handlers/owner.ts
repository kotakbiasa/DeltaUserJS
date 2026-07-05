// @ts-nocheck
import fs from 'fs';
import { InputFile } from 'grammy';
import config from '../../config.js';
import { UserbotModel } from '../../infrastructure/database.js';

export function registerOwnerHandlers(bot) {
  // --- Owner utility commands ---
  bot.command('backup', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) return;
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
      setTimeout(() => { try { fs.unlinkSync(filename); } catch (_) {} }, 60000);
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal backup: ${err.message}</blockquote>` });
    }
  });

  bot.command('stats_db', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) return;
    try {
      const totalUsers = await UserbotModel.countDocuments();
      const activeUsers = await UserbotModel.countDocuments({ is_active: 1 });
      await ctx.replyWithRichMessage({ html: `<blockquote>📊 Database\n\nTotal Userbot: ${totalUsers}\nAktif: ${activeUsers}</blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Error: ${err.message}</blockquote>` });
    }
  });

  bot.command('setup_topic', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) return;
    await ctx.replyWithRichMessage({ html: `<blockquote>Forum topic setup tidak dipakai di rich dashboard baru. Gunakan LOG_GROUP_ID/LOG_TOPIC_ID di config jika perlu.</blockquote>` });
  });

  bot.command('restart', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) return;
    await ctx.replyWithRichMessage({ html: `<h1>🔄 Restarting Bot</h1><blockquote>Sistem sedang dimuat ulang. Harap tunggu beberapa saat hingga bot menyala kembali.</blockquote>` });
    console.log('🔄 Restart command received from owner. Exiting process...');
    setTimeout(() => {
      // Use exit code 0 for graceful restart (PM2/systemd will restart it)
      process.exit(0);
    }, 1000);
  });
}
