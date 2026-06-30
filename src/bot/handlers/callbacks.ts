// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { InlineKeyboard } from 'grammy';
import config from '../../../config.js';
import { activeRegClients } from '../conversations/registration.js';
import { sendAccessDeniedRich, panelMain, keyboardMain } from '../ui/keyboards/dashboard.js';
import { replyRich, editRich } from '../../../utils/richMessage.js';

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

async function sendMainRich(ctx, deleteOld = false) {
  await replyRich(ctx, panelMain(ctx), { reply_markup: keyboardMain(ctx) });
  if (deleteOld) {
    try { await ctx.deleteMessage(); } catch (_) {}
  }
}

export function registerLegacyCallbacks(bot) {
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
    await editRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Pendaftaran <code>${targetId}</code> disetujui.</blockquote>`);
    try { await ctx.api.sendMessage(targetId, '🎉 Pendaftaran disetujui. Kirim /menu untuk mulai.'); } catch (_) {}
  });

  bot.callbackQuery(/^reject_reg:(\d+)$/, async (ctx) => {
    const targetId = Number(ctx.match[1]);
    global.approvedUsers.delete(targetId);
    saveApprovals();
    await editRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran <code>${targetId}</code> ditolak.</blockquote>`);
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
    await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran dibatalkan.</blockquote>`);
    await sendMainRich(ctx);
  });
}
