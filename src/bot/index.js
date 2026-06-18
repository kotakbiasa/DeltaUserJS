import { Bot, session, InlineKeyboard, InputFile } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';
import fs from 'fs';
import path from 'path';

import config from '../config.js';
import userbotManager from '../userbot/manager.js';
import {
  getUserbotSession,
  getAllRegisteredUsers,
  UserbotModel,
} from '../database/db.js';
import {
  otpRegistrationConversation,
  qrRegistrationConversation,
  afkReasonConversation,
  broadcastConversation,
  activeRegClients,
  setInlineBotConversation,
  customNameConversation,
} from './conversations.js';
import { registerInlineHelpHandlers } from './inlineHelp.js';
import { registerInlineAntiPmHandlers } from './inlineAntiPm.js';
import { registerInlineLatexHandlers } from './inlineLatex.js';
import { registerRichHandlers, sendAccessDeniedRich } from './richHandlers.js';
import { panelMain, keyboardMain } from './richUi.js';

const bot = new Bot(config.botToken);

bot.use(session({ initial: () => ({}) }));
bot.use(limit({
  timeFrame: 2000,
  limit: 3,
  keyGenerator: (ctx) => ctx.from?.id?.toString(),
  onLimitExceeded: async (ctx) => {
    try { await ctx.reply('⚠️ Terlalu cepat. Tunggu beberapa detik dulu.'); } catch (_) {}
  },
}));

bot.use(conversations());
bot.use(createConversation(otpRegistrationConversation, 'otp-reg'));
bot.use(createConversation(qrRegistrationConversation, 'qr-reg'));
bot.use(createConversation(afkReasonConversation, 'afk-reason-conv'));
bot.use(createConversation(broadcastConversation, 'admin-broadcast-conv'));
bot.use(createConversation(setInlineBotConversation, 'inline-bot-conv'));
bot.use(createConversation(customNameConversation, 'custom-name-conv'));

registerInlineHelpHandlers(bot);
registerInlineAntiPmHandlers(bot);
registerInlineLatexHandlers(bot);
registerRichHandlers(bot);

async function sendMainRich(ctx, deleteOld = false) {
  await ctx.replyWithRichMessage(
    { html: panelMain(ctx) },
    { reply_markup: keyboardMain(ctx) }
  );
  if (deleteOld) {
    try { await ctx.deleteMessage(); } catch (_) {}
  }
}

// --- Guest Mode / Business quick commands ---
bot.use(async (ctx, next) => {
  const guestMsg = ctx.update.guest_message;
  if (!guestMsg) return next();

  try {
    const guestQueryId = guestMsg.guest_query_id;
    const callerUser = guestMsg.guest_bot_caller_user;
    const text = (guestMsg.text || '').trim().toLowerCase();
    if (!guestQueryId || !callerUser) return;

    const telegramId = callerUser.id;
    const userSession = getUserbotSession(telegramId);
    const botUsername = ctx.me?.username || 'DeltaUserJSBot';

    if (text.startsWith('status')) {
      const running = userbotManager.isRunning(telegramId);
      await ctx.api.answerGuestQuery(guestQueryId, {
        text: `🤖 <b>DeltaUbotJS Status</b>\n\nUserbot: ${userSession ? (running ? '🟢 Running' : '🔴 Stopped') : 'Belum terdaftar'}\nOwner: <b>${callerUser.first_name}</b>`,
        parse_mode: 'HTML',
      });
      return;
    }

    if (text.startsWith('verify')) {
      await ctx.api.answerGuestQuery(guestQueryId, {
        text: userSession
          ? `✅ <b>Verified DeltaUbotJS User</b>\n\nAkun <b>${callerUser.first_name}</b> memiliki sesi userbot aktif.`
          : `⚠️ <b>Belum Terverifikasi</b>\n\nAkun <b>${callerUser.first_name}</b> belum punya sesi userbot aktif.`,
        parse_mode: 'HTML',
      });
      return;
    }

    if (text.startsWith('stop')) {
      if (!userSession) {
        await ctx.api.answerGuestQuery(guestQueryId, { text: '❌ Anda belum mendaftarkan userbot.', parse_mode: 'HTML' });
        return;
      }
      if (userbotManager.isRunning(telegramId)) await userbotManager.stopUserbot(telegramId);
      await ctx.api.answerGuestQuery(guestQueryId, {
        text: '🛑 <b>Emergency Stop</b>\n\nUserbot berhasil dimatikan.',
        parse_mode: 'HTML',
      });
      return;
    }

    await ctx.api.answerGuestQuery(guestQueryId, {
      text: `📖 <b>DeltaUbotJS Guest Commands</b>\n\n@${botUsername} status\n@${botUsername} verify\n@${botUsername} stop\n@${botUsername} help`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Buka Panel', url: `https://t.me/${botUsername}` }]] },
    });
  } catch (err) {
    console.error('Guest mode error:', err);
  }
});

// --- Registration approval state ---
const approvalsFile = path.join(process.cwd(), 'approvals.json');
if (!global.approvedUsers) {
  global.approvedUsers = new Set();
  try {
    if (fs.existsSync(approvalsFile)) {
      global.approvedUsers = new Set(JSON.parse(fs.readFileSync(approvalsFile, 'utf8')));
    }
  } catch (_) {}
}
function saveApprovals() {
  try { fs.writeFileSync(approvalsFile, JSON.stringify([...global.approvedUsers])); } catch (_) {}
}

// Legacy callback aliases kept so old buttons/conversation prompts still work.
bot.callbackQuery('back_to_main', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendMainRich(ctx, true);
});

bot.callbackQuery('ubot_register_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.from.id;
  if (Number(id) !== Number(config.ownerId) && !global.approvedUsers.has(id)) {
    await sendAccessDeniedRich(ctx);
    return;
  }
  await ctx.conversation.enter('otp-reg');
});

bot.callbackQuery('reg_otp', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('otp-reg');
});

bot.callbackQuery('reg_qr', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('qr-reg');
});

bot.callbackQuery('request_approval', async (ctx) => {
  const telegramId = ctx.from.id;
  const name = ctx.from.first_name || 'User';
  const username = ctx.from.username ? `@${ctx.from.username}` : 'Tanpa Username';
  try {
    const targetChat = config.logGroupId || config.ownerId;
    const extraParams = {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('✅ Setujui', `approve_reg:${telegramId}`)
        .text('❌ Tolak', `reject_reg:${telegramId}`),
    };
    if (config.logGroupId && config.logTopicId) extraParams.message_thread_id = config.logTopicId;
    await ctx.api.sendMessage(targetChat,
      `🔔 <b>Permintaan Registrasi</b>\n\n` +
      `<pre>Nama      ${name}\nUsername  ${username}\nID        ${telegramId}</pre>`,
      extraParams,
    );
    await ctx.editMessageText('✅ Permintaan terkirim. Tunggu persetujuan owner.', {
      reply_markup: new InlineKeyboard().text('Dashboard', 'back_to_main'),
    });
  } catch (err) {
    console.error(err);
    await ctx.answerCallbackQuery({ text: 'Gagal mengirim permintaan approval.', show_alert: true });
  }
});

bot.callbackQuery(/^approve_reg:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  global.approvedUsers.add(targetId);
  saveApprovals();
  await ctx.editMessageText(`✅ Pendaftaran <code>${targetId}</code> disetujui.`, { parse_mode: 'HTML' });
  try { await ctx.api.sendMessage(targetId, '🎉 Pendaftaran disetujui. Kirim /menu untuk mulai.'); } catch (_) {}
});

bot.callbackQuery(/^reject_reg:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  global.approvedUsers.delete(targetId);
  saveApprovals();
  await ctx.editMessageText(`❌ Pendaftaran <code>${targetId}</code> ditolak.`, { parse_mode: 'HTML' });
  try { await ctx.api.sendMessage(targetId, '❌ Pendaftaran userbot ditolak oleh owner.'); } catch (_) {}
});

bot.callbackQuery('cancel_reg', async (ctx) => {
  const userId = ctx.from.id;
  const client = activeRegClients.get(userId);
  if (client) {
    try { await client.disconnect(); } catch (_) {}
    activeRegClients.delete(userId);
  }
  try { await ctx.answerCallbackQuery('Pendaftaran dibatalkan.'); } catch (_) {}
  await ctx.conversation.exitAll();
  try { await ctx.deleteMessage(); } catch (_) {}
  await ctx.reply('❌ Pendaftaran dibatalkan.');
  await sendMainRich(ctx);
});

// --- Owner utility commands ---
bot.command('backup', async (ctx) => {
  if (Number(ctx.from.id) !== Number(config.ownerId)) return;
  await ctx.reply('⏳ Menyiapkan backup database...');
  try {
    const users = await UserbotModel.find({}).lean();
    const backupData = JSON.stringify(users, null, 2);
    fs.writeFileSync('database_backup.json', backupData);
    await ctx.replyWithDocument(new InputFile('database_backup.json'), {
      caption: `📦 Backup MongoDB Userbots\n${new Date().toLocaleString()}`,
    });
  } catch (err) {
    await ctx.reply(`❌ Gagal backup: ${err.message}`);
  }
});

bot.command('stats_db', async (ctx) => {
  if (Number(ctx.from.id) !== Number(config.ownerId)) return;
  try {
    const totalUsers = await UserbotModel.countDocuments();
    const activeUsers = await UserbotModel.countDocuments({ is_active: 1 });
    await ctx.reply(`📊 Database\n\nTotal Userbot: ${totalUsers}\nAktif: ${activeUsers}`);
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

bot.command('setup_topic', async (ctx) => {
  if (Number(ctx.from.id) !== Number(config.ownerId)) return;
  await ctx.reply('Forum topic setup tidak dipakai di rich dashboard baru. Gunakan LOG_GROUP_ID/LOG_TOPIC_ID di config jika perlu.');
});

bot.command('restart', async (ctx) => {
  if (Number(ctx.from.id) !== Number(config.ownerId)) return;
  await ctx.reply('🔄 <b>Restarting DeltaUbotJS...</b>\n\nSistem sedang dimuat ulang. Harap tunggu beberapa saat hingga bot menyala kembali.', { parse_mode: 'HTML' });
  console.log('🔄 Restart command received from owner. Exiting process...');
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

bot.catch((err) => {
  const message = err.error?.description || err.error?.message || '';
  if (message.includes('message is not modified')) return;
  console.error(`❌ Bot middleware error ${err.ctx?.update?.update_id}:`, err.error);
});

export default bot;
