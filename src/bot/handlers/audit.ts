import { Bot, Context, CommandContext, InlineKeyboard, InputFile } from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import { getAuditLogs, exportAuditLogs } from '../../services/SubscriptionService.js';

/**
 * Format audit log entry for display
 */
function formatAuditEntry(log: any): string {
  const time = new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'medium' }).format(log.createdAt);
  let text = `🕐 <b>${time}</b> | `;
  text += `<b>${log.action}</b>\n`;
  text += `👤 User: <code>${log.userId || 'N/A'}</code> | Actor: <code>${log.actorId || 'N/A'}</code>\n`;
  text += `📦 Resource: <b>${log.resource}</b> (${log.resourceId || 'N/A'})\n`;

  if (log.before || log.after) {
    text += `<blockquote>`;
    if (log.before) {text += `Before: ${JSON.stringify(log.before).slice(0, 200)}\n`;}
    if (log.after) {text += `After: ${JSON.stringify(log.after).slice(0, 200)}`;}
    text += `</blockquote>`;
  }

  return text;
}

/**
 * Audit log handlers
 */
export function registerAuditHandlers(bot: Bot) {
  // Owner: View audit logs with filters
  bot.command('audit', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    const [action, userIdStr, limitStr, skipStr] = args;

    const filters: any = {};
    if (action) {filters.action = action;}
    if (userIdStr) {filters.userId = parseInt(userIdStr);}
    if (limitStr) {filters.limit = parseInt(limitStr);}
    if (skipStr) {filters.skip = parseInt(skipStr);}

    try {
      const logs = await getAuditLogs(filters);

      if (logs.length === 0) {
        await ctx.reply('📭 Tidak ada audit log yang cocok dengan filter.');
        return;
      }

      let text = `<b>📋 AUDIT LOG</b>\n`;
      text += `Filter: ${JSON.stringify(filters)}\n`;
      text += `Total: ${logs.length} entri\n\n`;

      for (const log of logs.slice(0, 10)) {
        text += formatAuditEntry(log) + '\n';
      }

      if (logs.length > 10) {
        text += `\n<i>... dan ${logs.length - 10} entri lainnya. Gunakan limit/skip untuk pagination.</i>`;
      }

      const keyboard = new InlineKeyboard()
        .text('📥 Export JSON', 'audit:export:json')
        .text('📥 Export CSV', 'audit:export:csv')
        .row()
        .text('🔍 Filter Action', 'audit:filter:action')
        .text('👤 Filter User', 'audit:filter:user')
        .row();

      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      Logger.logSystem(`Audit command error: ${err}`, 'ERROR');
      await ctx.reply('❌ Gagal mengambil audit log.');
    }
  });

  // Export audit logs
  bot.callbackQuery('audit:export:json', async (ctx) => {
    await ctx.answerCallbackQuery('Mengekspor...');
    if (ctx.from?.id !== config.ownerId) {return;}

    try {
      const logs = await exportAuditLogs({ userId: undefined, startDate: undefined, endDate: undefined, limit: 1000 });
      const json = JSON.stringify(logs, null, 2);

      // Send as file
      const fileBuffer = Buffer.from(json, 'utf-8');
      await ctx.replyWithDocument(
        new InputFile(fileBuffer, `audit-logs-${new Date().toISOString().split('T')[0]}.json`),
        { caption: `📋 Audit Log Export (${logs.length} entri)` }
      );
    } catch (err) {
      Logger.logSystem(`Audit export error: ${err}`, 'ERROR');
      await ctx.reply('❌ Gagal ekspor audit log.');
    }
  });

  bot.callbackQuery('audit:export:csv', async (ctx) => {
    await ctx.answerCallbackQuery('Mengekspor...');
    if (ctx.from?.id !== config.ownerId) {return;}

    try {
      const logs = await exportAuditLogs({ userId: undefined, startDate: undefined, endDate: undefined, limit: 1000 });

      const headers = ['timestamp', 'action', 'userId', 'actorId', 'resource', 'resourceId', 'before', 'after'];
      const rows = logs.map(log => [
        log.createdAt,
        log.action,
        log.userId || '',
        log.actorId || '',
        log.resource,
        log.resourceId || '',
        JSON.stringify(log.before || {}),
        JSON.stringify(log.after || {}),
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

      const csvBuffer = Buffer.from(csv, 'utf-8');
      await ctx.replyWithDocument(
        new InputFile(csvBuffer, `audit-logs-${new Date().toISOString().split('T')[0]}.csv`),
        { caption: `📋 Audit Log Export CSV (${logs.length} entri)` }
      );
    } catch (err) {
      Logger.logSystem(`Audit CSV export error: ${err}`, 'ERROR');
      await ctx.reply('❌ Gagal ekspor CSV.');
    }
  });

  // Filter by action
  bot.callbackQuery('audit:filter:action', async (ctx) => {
    await ctx.answerCallbackQuery('Masukkan nama action (contoh: subscription.create)');
    // TODO: Implement conversation for filter input
    await ctx.reply('Fitur filter action belum diimplementasikan. Gunakan command: /audit [action] [userId] [limit] [skip]');
  });

  bot.callbackQuery('audit:filter:user', async (ctx) => {
    await ctx.answerCallbackQuery('Masukkan user ID');
    await ctx.reply('Fitur filter user belum diimplementasikan. Gunakan command: /audit [action] [userId] [limit] [skip]');
  });

  // Owner: Audit stats
  bot.command('auditstats', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}

    try {
      // Get counts by action
      const { AuditLogModel } = await import('../../infrastructure/subscriptionModels.js');

      const stats = await AuditLogModel.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);

      const total = await AuditLogModel.countDocuments();

      let text = `<b>📊 AUDIT STATS</b>\n\n`;
      text += `Total Entries: <b>${total}</b>\n\n`;
      text += `<b>Top Actions:</b>\n`;
      for (const s of stats) {
        text += `• ${s._id}: ${s.count}\n`;
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      Logger.logSystem(`Audit stats error: ${err}`, 'ERROR');
      await ctx.reply('❌ Gagal mengambil statistik audit.');
    }
  });
}