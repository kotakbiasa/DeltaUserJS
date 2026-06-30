// @ts-nocheck
import fs from 'fs';
import { InputFile } from 'grammy';
import config from '../../../config.js';
import { UserbotModel } from '../../../infrastructure/database.js';

export function registerOwnerHandlers(bot) {
  // --- Owner utility commands ---
  bot.command('backup', async (ctx) => {
    if (Number(ctx.from.id) !== Number(config.ownerId)) return;
    await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Menyiapkan backup database...</blockquote>` });
    try {
      const users = await UserbotModel.find({}).lean();
      const backupData = JSON.stringify(users, null, 2);
      fs.writeFileSync('database_backup.json', backupData);
      await ctx.replyWithDocument(new InputFile('database_backup.json'), {
        caption: `📦 Backup MongoDB Userbots\n${new Date().toLocaleString()}`,
      });
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
    await ctx.replyWithRichMessage({ html: `<h1>🔄 Restarting DeltaUbotJS</h1><blockquote>Sistem sedang dimuat ulang. Harap tunggu beberapa saat hingga bot menyala kembali.</blockquote>` });
    console.log('🔄 Restart command received from owner. Exiting process...');
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
}
