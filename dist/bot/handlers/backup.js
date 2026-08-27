import { InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import { initBackupSystem, createFullBackup, createIncrementalBackup, restoreFromBackup, listBackups, getBackup, pruneBackups, deleteBackup, startAutoBackup, getBackupStats, } from '../../services/BackupService.js';
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
function formatBackupInfo(backup) {
    const time = new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(backup.timestamp));
    const statusEmoji = {
        completed: '✅',
        failed: '❌',
        in_progress: '⏳',
    }[backup.status] || '❓';
    return `${statusEmoji} <b>${backup.id}</b>\n` +
        `   📅 ${time} | 📦 ${backup.type} | 📊 ${formatBytes(backup.size)}` +
        (backup.error ? `\n   ❌ ${backup.error}` : '');
}
/**
 * Show backup menu
 */
export async function showBackupMenu(ctx) {
    const stats = getBackupStats();
    const backups = listBackups().slice(0, 10);
    let text = `<b>💾 BACKUP & RESTORE</b>\n\n`;
    text += `<blockquote>`;
    text += `📊 Total: ${stats.total} | ✅ ${stats.completed} | ❌ ${stats.failed}\n`;
    text += `💾 Total Size: ${formatBytes(stats.totalSize)}\n`;
    text += `🕐 Last Backup: ${stats.lastBackup ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(stats.lastBackup)) : 'Belum ada'}\n`;
    text += `</blockquote>\n\n`;
    text += `<b>📋 RECENT BACKUPS:</b>\n`;
    for (const b of backups) {
        text += formatBackupInfo(b) + '\n\n';
    }
    const keyboard = new InlineKeyboard()
        .text('💾 Full Backup', 'backup:full')
        .text('⚡ Incremental', 'backup:incremental')
        .row()
        .text('📋 List All', 'backup:list')
        .text('🗑️ Prune Old', 'backup:prune')
        .row()
        .text('🔄 Restore', 'backup:restore_menu')
        .text('📊 Stats', 'backup:stats')
        .row();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}
/**
 * Show backup list
 */
export async function showBackupList(ctx, skip = 0) {
    const backups = listBackups().slice(skip, skip + 10);
    if (backups.length === 0) {
        await ctx.reply('📭 Belum ada backup.', {
            reply_markup: new InlineKeyboard().text('🔙 Back', 'backup:menu').row(),
        });
        return;
    }
    let text = `<b>📋 BACKUP LIST</b> (${skip + 1}-${skip + backups.length})\n\n`;
    const keyboard = new InlineKeyboard();
    for (const b of backups) {
        text += formatBackupInfo(b) + '\n\n';
        keyboard.text(`🔄 Restore ${b.id}`, `backup:restore:${b.id}`).row();
        keyboard.text(`🗑️ Delete ${b.id}`, `backup:delete:${b.id}`).row();
    }
    // Pagination
    const allBackups = listBackups();
    if (skip > 0) {
        keyboard.text('⬅️ Prev', `backup:list:${Math.max(0, skip - 10)}`).row();
    }
    if (skip + 10 < allBackups.length) {
        keyboard.text('Next ➡️', `backup:list:${skip + 10}`).row();
    }
    keyboard.text('🔙 Back', 'backup:menu').row();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}
/**
 * Backup menu
 */
export function registerBackupHandlers(bot) {
    // Initialize backup system
    initBackupSystem().catch(err => Logger.logSystem(`Backup init failed: ${err}`, 'WARN'));
    startAutoBackup();
    // Backup menu
    bot.callbackQuery('backup:menu', async (ctx) => {
        await ctx.answerCallbackQuery();
        await showBackupMenu(ctx);
    });
    // Full backup
    bot.callbackQuery('backup:full', async (ctx) => {
        await ctx.answerCallbackQuery('Memulai full backup...');
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa backup.');
            return;
        }
        await ctx.reply('⏳ Membuat full backup...');
        try {
            const backup = await createFullBackup();
            await ctx.reply(`✅ <b>Full backup selesai!</b>\n\n` +
                `🆔 ID: <code>${backup.id}</code>\n` +
                `📊 Ukuran: ${formatBytes(backup.size)}\n` +
                `🕐 Waktu: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(backup.timestamp))}`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Gagal backup: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Incremental backup
    bot.callbackQuery('backup:incremental', async (ctx) => {
        await ctx.answerCallbackQuery('Memulai incremental backup...');
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa backup.');
            return;
        }
        await ctx.reply('⏳ Membuat incremental backup...');
        try {
            const backup = await createIncrementalBackup();
            await ctx.reply(`✅ <b>Incremental backup selesai!</b>\n\n` +
                `🆔 ID: <code>${backup.id}</code>\n` +
                `📊 Ukuran: ${formatBytes(backup.size)}\n` +
                `🕐 Waktu: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(backup.timestamp))}`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Gagal backup: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // List backups
    bot.callbackQuery('backup:list', async (ctx) => {
        await ctx.answerCallbackQuery();
        await showBackupList(ctx, 0);
    });
    bot.callbackQuery(/^backup:list:(\d+)$/, async (ctx) => {
        await ctx.answerCallbackQuery();
        const skip = parseInt(ctx.match[1]);
        await showBackupList(ctx, skip);
    });
    // Prune old backups
    bot.callbackQuery('backup:prune', async (ctx) => {
        await ctx.answerCallbackQuery('Pruning...');
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa prune.');
            return;
        }
        try {
            const deleted = await pruneBackups(10);
            await ctx.reply(`✅ Prune selesai: ${deleted} backup lama dihapus.`);
        }
        catch (err) {
            await ctx.reply(`❌ Gagal prune: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Restore menu
    bot.callbackQuery('backup:restore_menu', async (ctx) => {
        await ctx.answerCallbackQuery();
        const backups = listBackups().filter(b => b.status === 'completed').slice(0, 10);
        if (backups.length === 0) {
            await ctx.reply('📭 Tidak ada backup yang bisa direstore.', {
                reply_markup: new InlineKeyboard().text('🔙 Back', 'backup:menu').row(),
            });
            return;
        }
        let text = `<b>🔄 RESTORE DARI BACKUP</b>\n\n`;
        text += `⚠️ <b>PERINGATAN:</b> Restore akan menimpa database saat ini!\n\n`;
        const keyboard = new InlineKeyboard();
        for (const b of backups) {
            text += formatBackupInfo(b) + '\n\n';
            keyboard.text(`🔄 Restore ${b.id}`, `backup:restore:${b.id}`).row();
        }
        keyboard.text('🔙 Back', 'backup:menu').row();
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
    // Restore specific backup
    bot.callbackQuery(/^backup:restore:(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery('Memulai restore...');
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa restore.');
            return;
        }
        const backupId = ctx.match[1];
        const backup = getBackup(backupId);
        if (!backup) {
            await ctx.reply('❌ Backup tidak ditemukan.');
            return;
        }
        // Confirm with user
        await ctx.reply(`⚠️ <b>KONFIRMASI RESTORE</b>\n\n` +
            `Anda akan memulihkan database dari backup:\n` +
            `<code>${backup.id}</code>\n` +
            `📅 ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(backup.timestamp))}\n\n` +
            `<b>Ini akan MENIMPA database saat ini!</b>\n\n` +
            `Ketik <code>/confirm_restore ${backupId}</code> untuk melanjutkan.`, { parse_mode: 'HTML' });
    });
    // Confirm restore command
    bot.command('confirm_restore', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        const backupId = ctx.message?.text?.split(' ')[1];
        if (!backupId) {
            await ctx.reply('Usage: <code>/confirm_restore <backup_id></code>', { parse_mode: 'HTML' });
            return;
        }
        const backup = getBackup(backupId);
        if (!backup || backup.status !== 'completed') {
            await ctx.reply('❌ Backup tidak valid atau tidak selesai.');
            return;
        }
        await ctx.reply('⏳ Memulai restore...');
        try {
            await restoreFromBackup(backupId);
            await ctx.reply(`✅ Restore dari <code>${backupId}</code> selesai!`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Restore gagal: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Delete backup
    bot.callbackQuery(/^backup:delete:(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery('Menghapus...');
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa hapus backup.');
            return;
        }
        const backupId = ctx.match[1];
        const backup = getBackup(backupId);
        if (!backup) {
            await ctx.reply('❌ Backup tidak ditemukan.');
            return;
        }
        try {
            await deleteBackup(backupId);
            await ctx.reply(`✅ Backup <code>${backupId}</code> dihapus.`, { parse_mode: 'HTML' });
            await showBackupMenu(ctx);
        }
        catch (err) {
            await ctx.reply(`❌ Gagal hapus: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Stats
    bot.callbackQuery('backup:stats', async (ctx) => {
        await ctx.answerCallbackQuery();
        const stats = getBackupStats();
        await ctx.reply(`<b>📊 BACKUP STATS</b>\n\n` +
            `📦 Total: ${stats.total}\n` +
            `✅ Completed: ${stats.completed}\n` +
            `❌ Failed: ${stats.failed}\n` +
            `💾 Total Size: ${formatBytes(stats.totalSize)}\n` +
            `🕐 Last Backup: ${stats.lastBackup || 'Belum ada'}\n` +
            `⏰ Next Full: ${stats.nextScheduledFull}\n` +
            `⏰ Next Incremental: ${stats.nextScheduledIncremental}`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Back', 'backup:menu').row() });
    });
    // Owner commands
    bot.command('backup', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        await showBackupMenu(ctx);
    });
    bot.command('backupfull', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        await ctx.reply('⏳ Membuat full backup...');
        try {
            const backup = await createFullBackup();
            await ctx.reply(`✅ Full backup selesai: ${backup.id} (${formatBytes(backup.size)})`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Gagal: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    bot.command('backupinc', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        await ctx.reply('⏳ Membuat incremental backup...');
        try {
            const backup = await createIncrementalBackup();
            await ctx.reply(`✅ Incremental backup selesai: ${backup.id} (${formatBytes(backup.size)})`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Gagal: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    bot.command('backuplist', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        await showBackupList(ctx, 0);
    });
    bot.command('backuprestore', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        const backupId = ctx.message?.text?.split(' ')[1];
        if (!backupId) {
            await ctx.reply('Usage: <code>/backuprestore <backup_id></code>', { parse_mode: 'HTML' });
            return;
        }
        try {
            await restoreFromBackup(backupId);
            await ctx.reply(`✅ Restore selesai dari ${backupId}`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Gagal: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    bot.command('backupstats', async (ctx) => {
        if (ctx.from?.id !== config.ownerId)
            return;
        const stats = getBackupStats();
        await ctx.reply(`<b>📊 BACKUP STATS</b>\n\n` +
            `Total: ${stats.total} | ✅ ${stats.completed} | ❌ ${stats.failed}\n` +
            `Size: ${formatBytes(stats.totalSize)}\n` +
            `Last: ${stats.lastBackup || '—'}`, { parse_mode: 'HTML' });
    });
}
