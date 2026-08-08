import fs from 'fs';
import { InputFile } from 'grammy';
import config from '../../config.js';
import { UserbotModel } from '../../infrastructure/database.js';
import { Logger } from '../../utils/logger.js';
export function registerOwnerHandlers(bot) {
    // --- Owner utility commands ---
    bot.command('backup', async (ctx) => {
        if (Number(ctx.from.id) !== Number(config.ownerId)) {
            return;
        }
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
            setTimeout(() => { try {
                fs.unlinkSync(filename);
            }
            catch (_) { /* empty */ } }, 60000);
        }
        catch (err) {
            await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal backup: ${err.message}</blockquote>` });
        }
    });
    bot.command('stats_db', async (ctx) => {
        if (Number(ctx.from.id) !== Number(config.ownerId)) {
            return;
        }
        try {
            const totalUsers = await UserbotModel.countDocuments();
            const activeUsers = await UserbotModel.countDocuments({ is_active: 1 });
            await ctx.replyWithRichMessage({ html: `<h1>📊 Database Stats</h1>` +
                    `<table bordered striped><caption>📋 Statistik Userbot</caption>` +
                    `<tr><th>Item</th><th>Jumlah</th></tr>` +
                    `<tr><td>👥 Total Userbot</td><td align="center"><code>${totalUsers}</code></td></tr>` +
                    `<tr><td>✅ Aktif</td><td align="center"><code>${activeUsers}</code></td></tr>` +
                    `</table>` });
        }
        catch (err) {
            await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>${err.message}</blockquote>` });
        }
    });
    bot.command('restart', async (ctx) => {
        if (Number(ctx.from.id) !== Number(config.ownerId)) {
            return;
        }
        await ctx.replyWithRichMessage({ html: `<h1>🔄 Restarting Bot</h1><blockquote>Sistem sedang dimuat ulang. Harap tunggu beberapa saat hingga bot menyala kembali.</blockquote>` });
        await Logger.logSystem('🔄 Restart command received from owner. Exiting process...', 'INFO');
        setTimeout(() => {
            // Use exit code 0 for graceful restart (PM2/systemd will restart it)
            process.exit(0);
        }, 1000);
    });
}
