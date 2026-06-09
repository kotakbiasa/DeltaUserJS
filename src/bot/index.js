import { Bot, session, InlineKeyboard } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';
import config from '../config.js';
import { 
  createMainMenuKeyboard,
  registrationMethodsKeyboard,
  activeUserbotKeyboard,
  inactiveUserbotKeyboard,
  createFeaturesKeyboard,
  backToMainKeyboard,
  adminPanelKeyboard,
  createAdminUserListKeyboard,
  createAdminUserControlKeyboard
} from './keypads.js';
import fs from 'fs';
import path from 'path';
import { 
  otpRegistrationConversation, 
  qrRegistrationConversation,
  afkReasonConversation,
  broadcastConversation,
  activeRegClients,
  setInlineBotConversation,
  customNameConversation
} from './conversations.js';
import { masterMainMenu, getWelcomeText } from './menus.js';
import { registerInlineHelpHandlers } from './inlineHelp.js';
import { registerInlineAntiPmHandlers } from './inlineAntiPm.js';
import { 
  getUserbotSession, 
  updateUserbotStatus, 
  updateUserbotFeature,
  deleteUserbot,
  getAllRegisteredUsers
} from '../database/db.js';
import userbotManager from '../userbot/manager.js';
import { setupSettingsHandlers } from './settingsHandler.js';

/**
 * 🔧 Helper: Render Admin User Detail Panel Text (HTML)
 */
function renderAdminUserDetailText(userId, userSession, isRunning) {
  const statusText = isRunning ? '🟢 <b>AKTIF (Running)</b>' : '🔴 <b>NONAKTIF (Stopped)</b>';
  const afkModeText = userSession.auto_reply === 1 ? '🟢 ON' : '🔴 OFF';
  const antiPmModeText = userSession.anti_pm === 1 ? '🟢 ON' : '🔴 OFF';

  const expDate = new Date(userSession.expired_at);
  const now = new Date();
  const diffTime = expDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const expText = diffDays > 0 
    ? `🟢 <code>${expDate.toLocaleDateString()}</code> (${diffDays} Hari Lagi)`
    : `🔴 <code>${expDate.toLocaleDateString()}</code> <b>(KADALUWARSA)</b>`;

  return (
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `👤 <b>KONTROL REMOTE PENGGUNA</b>\n` +
    `───────────────────────\n` +
    `<blockquote>` +
    `• <b>ID Telegram</b>: <code>${userId}</code>\n` +
    `• <b>Nomor HP</b>: <code>${userSession.phone || 'QR Code Login'}</code>\n` +
    `• <b>Status Ubot</b>: ${statusText}\n` +
    `• <b>Mode AFK</b>: ${afkModeText}\n` +
    `• <b>Anti-PM</b>: ${antiPmModeText}\n` +
    `• <b>Pesan AFK</b>: <code>"${userSession.afk_reason}"</code>\n` +
    `• <b>Masa Aktif</b>: ${expText}\n` +
    `• <b>Terdaftar</b>: <code>${new Date(userSession.created_at).toLocaleString()}</code>` +
    `</blockquote>\n` +
    `───────────────────────\n` +
    `Gunakan menu kontrol di bawah untuk mengendalikan akun user ini:`
  );
}

// Initialize Bot
const bot = new Bot(config.botToken);

// Configure Session
bot.use(
  session({
    initial() {
      return {};
    },
  })
);

// Configure Rate Limiter (Anti DDoS)
bot.use(
  limit({
    timeFrame: 2000,
    limit: 3,
    onLimitExceeded: async (ctx) => {
      try {
        await ctx.reply("⚠️ <b>Spam Terdeteksi!</b>\nHarap tunggu beberapa detik sebelum mengirim perintah lagi.", { parse_mode: 'HTML' });
      } catch (e) {}
    },
    keyGenerator: (ctx) => {
      return ctx.from?.id.toString();
    },
  })
);

// Configure Conversations
bot.use(conversations());

// Register Conversations
bot.use(createConversation(otpRegistrationConversation, 'otp-reg'));
bot.use(createConversation(qrRegistrationConversation, 'qr-reg'));
bot.use(createConversation(afkReasonConversation, 'afk-reason-conv'));
bot.use(createConversation(broadcastConversation, 'admin-broadcast-conv'));
bot.use(createConversation(setInlineBotConversation, 'inline-bot-conv'));
bot.use(createConversation(customNameConversation, 'custom-name-conv'));

// Register @grammyjs/menu
bot.use(masterMainMenu);

// Register Inline Handlers
registerInlineHelpHandlers(bot);
registerInlineAntiPmHandlers(bot);

// Register Settings Handlers
setupSettingsHandlers(bot);

// ==========================================
// 🚀 GUEST MODE MIDDLEWARE (Telegram Bot API 10.0)
// ==========================================
bot.use(async (ctx, next) => {
  const guestMsg = ctx.update.guest_message;
  if (guestMsg) {
    try {
      const guestQueryId = guestMsg.guest_query_id;
      const callerUser = guestMsg.guest_bot_caller_user;
      const text = guestMsg.text ? guestMsg.text.trim() : '';

      if (!guestQueryId || !callerUser) return;

      const telegramId = Number(callerUser.id);
      const cleanText = text.replace(/@[a-zA-Z0-9_]+/g, '').trim().toLowerCase();

      // 1. STATUS COMMAND
      if (cleanText.startsWith('status')) {
        const userSession = getUserbotSession(telegramId);
        if (!userSession) {
          await ctx.api.callApi('answerGuestQuery', {
            guest_query_id: guestQueryId,
            text: `❌ <b>DeltaUserJS — Status</b>\n\n` +
                  `Akun Anda belum terdaftar di layanan DeltaUserJS.\n` +
                  `Silakan buka obrolan pribadi dengan saya untuk mendaftar.`,
            parse_mode: 'HTML'
          });
          return;
        }

        const isRunning = userbotManager.isRunning(telegramId);
        const statusText = isRunning ? '🟢 <b>AKTIF (Running)</b>' : '🔴 <b>NONAKTIF (Stopped)</b>';
        const expDate = new Date(userSession.expired_at);
        const now = new Date();
        const diffTime = expDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const expText = diffDays > 0 
          ? `🟢 <code>${expDate.toLocaleDateString()}</code> (${diffDays} Hari Lagi)`
          : `🔴 <code>${expDate.toLocaleDateString()}</code> <b>(KADALUWARSA)</b>`;

        await ctx.api.callApi('answerGuestQuery', {
          guest_query_id: guestQueryId,
          text: `🤖 <b>DeltaUserJS — Status Akun</b>\n\n` +
                `Halo <b>${callerUser.first_name}</b>! Berikut detail status ubot Anda:\n\n` +
                `<blockquote>` +
                `• <b>Status Sesi:</b> ${statusText}\n` +
                `• <b>Anti-PM:</b> ${userSession.anti_pm === 1 ? '🟢 ON' : '🔴 OFF'}\n` +
                `• <b>Mode AFK:</b> ${userSession.auto_reply === 1 ? '🟢 ON' : '🔴 OFF'}\n` +
                `• <b>Masa Aktif:</b> ${expText}` +
                `</blockquote>\n` +
                `<i>Cek status berhasil diproses via Guest Mode.</i>`,
          parse_mode: 'HTML'
        });

      // 2. VERIFY COMMAND
      } else if (cleanText.startsWith('verify')) {
        const userSession = getUserbotSession(telegramId);
        if (userSession && userSession.is_active === 1) {
          await ctx.api.callApi('answerGuestQuery', {
            guest_query_id: guestQueryId,
            text: `✅ <b>DeltaUserJS — Verifikasi Akun</b>\n\n` +
                  `Akun <b>${callerUser.first_name}</b> terverifikasi secara resmi menjalankan mesin <b>DeltaUserJS v1.0.0</b> secara aktif dan aman! 🚀`,
            parse_mode: 'HTML'
          });
        } else {
          await ctx.api.callApi('answerGuestQuery', {
            guest_query_id: guestQueryId,
            text: `⚠️ <b>DeltaUserJS — Verifikasi Gagal</b>\n\n` +
                  `Akun <b>${callerUser.first_name}</b> belum terdaftar atau tidak memiliki sesi userbot aktif saat ini.`,
            parse_mode: 'HTML'
          });
        }

      // 3. HELP COMMAND
      } else if (cleanText.startsWith('help')) {
        const botInfo = ctx.me || {};
        const botUsername = botInfo.username || 'DeltaUserJSBot';
        await ctx.api.callApi('answerGuestQuery', {
          guest_query_id: guestQueryId,
          text: `📖 <b>DeltaUserJS — Bantuan Instan</b>\n\n` +
                `Anda dapat memanggil saya di chat mana pun menggunakan perintah berikut:\n` +
                `• <code>@${botUsername} status</code> — Cek status ubot Anda\n` +
                `• <code>@${botUsername} verify</code> — Tampilkan status verifikasi publik Anda\n` +
                `• <code>@${botUsername} stop</code> — Matikan ubot Anda secara darurat\n` +
                `• <code>@${botUsername} help</code> — Tampilkan menu bantuan ini\n\n` +
                `<i>Untuk pendaftaran dan pengaturan lengkap, buka obrolan pribadi (PM) saya.</i>`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔺 Buka PM DeltaUserJS 🔺', url: `https://t.me/${botUsername}` }
              ]
            ]
          }
        });

      // 4. STOP COMMAND
      } else if (cleanText.startsWith('stop')) {
        const userSession = getUserbotSession(telegramId);
        if (!userSession) {
          await ctx.api.callApi('answerGuestQuery', {
            guest_query_id: guestQueryId,
            text: `❌ <b>DeltaUserJS — Error</b>\n\n` +
                  `Anda belum mendaftarkan userbot apa pun.`,
            parse_mode: 'HTML'
          });
          return;
        }

        const isRunning = userbotManager.isRunning(telegramId);
        if (!isRunning) {
          await ctx.api.callApi('answerGuestQuery', {
            guest_query_id: guestQueryId,
            text: `⚠️ <b>DeltaUserJS — Info</b>\n\n` +
                  `Sesi userbot Anda memang sudah dalam posisi mati/stopped.`,
            parse_mode: 'HTML'
          });
          return;
        }

        // Matikan userbot secara paksa
        await userbotManager.stopUserbot(telegramId);
        
        await ctx.api.callApi('answerGuestQuery', {
          guest_query_id: guestQueryId,
          text: `🛑 <b>DeltaUserJS — Emergency Stop</b>\n\n` +
                `Sesi userbot untuk <b>${callerUser.first_name}</b> berhasil <b>dimatikan secara darurat</b> demi keamanan akun Anda! 🔐\n\n` +
                `<i>Anda dapat menghidupkannya kembali kapan saja lewat obrolan pribadi saya.</i>`,
          parse_mode: 'HTML'
        });

      } else {
        // Balas dengan bantuan ringkas jika command salah
        const botInfo = ctx.me || {};
        const botUsername = botInfo.username || 'DeltaUserJSBot';
        await ctx.api.callApi('answerGuestQuery', {
          guest_query_id: guestQueryId,
          text: `❓ <b>DeltaUserJS — Perintah Tidak Dikenal</b>\n\n` +
                `Gunakan perintah <code>@${botUsername} help</code> untuk melihat panduan penggunaan Guest Mode.`,
          parse_mode: 'HTML'
        });
      }
    } catch (err) {
      console.error('Error in handling Guest Mode update:', err);
    }
  } else {
    await next();
  }
});

/**
 * 🔺 UNIFIED MAIN MENU / SAPAAN AWAL
 */
async function sendMainMenu(ctx, editMessage = false) {
  // Use the text generator from menus.js
  const welcomeText = getWelcomeText(ctx);

  if (editMessage) {
    try {
      await ctx.editMessageText(welcomeText, {
        parse_mode: 'HTML',
        reply_markup: masterMainMenu,
      });
      return;
    } catch (e) {}
  }

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: masterMainMenu,
  });
}

/**
 * 📱 INDIVIDUAL USERBOT CONTROL PANEL
 */
async function sendUserbotControlPanel(ctx, editMessage = true) {
  const telegramId = ctx.from.id;
  const dbSession = getUserbotSession(telegramId);

  if (!dbSession) {
    await ctx.answerCallbackQuery('Anda belum terdaftar!');
    await sendMainMenu(ctx, editMessage);
    return;
  }

  const isRunning = userbotManager.isRunning(telegramId);
  const statusText = isRunning 
    ? '🟢 <b>AKTIF (Running)</b>' 
    : '🔴 <b>NONAKTIF (Stopped)</b>';
  
  const phoneText = dbSession.phone ? `📱 <b>Nomor HP</b>: <code>${dbSession.phone}</code>\n` : '';
  const afkModeText = dbSession.auto_reply === 1 ? '🟢 <b>ON</b> (Read &amp; Reply)' : '🔴 <b>OFF</b>';
  const antiPmText = dbSession.anti_pm === 1 ? '🟢 <b>ON</b> (Warning &amp; Delete)' : '🔴 <b>OFF</b>';

  const expDate = new Date(dbSession.expired_at);
  const now = new Date();
  const diffTime = expDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const expText = diffDays > 0 
    ? `📅 <b>Masa Aktif</b>: <code>${expDate.toLocaleDateString()}</code> (${diffDays} Hari Lagi)`
    : `📅 <b>Masa Aktif</b>: <code>${expDate.toLocaleDateString()}</code> 🔴 <b>(KADALUWARSA)</b>`;

  const botName = dbSession?.custom_name || 'DeltaUbotJS';
  const headerName = botName.toUpperCase().split('').join(' ');

  const panelText = 
    `🔺 <b>${headerName}</b> 🔺\n` +
    `───────────────────────\n` +
    `🎛️ <b>DASHBOARD CONTROL USERBOT</b>\n\n` +
    `Pantau status sesi operasional dan tingkat perlindungan akun Anda:\n\n` +
    `<blockquote>` +
    `🌐 <b>Koneksi</b>: ${statusText}\n` +
    phoneText +
    `🛡️ <b>Anti-PM</b>: ${antiPmText}\n` +
    `📅 <b>Terdaftar</b>: <code>${new Date(dbSession.created_at).toLocaleDateString()}</code>\n` +
    expText +
    `</blockquote>\n` +
    `💡 <i>Gunakan menu di bawah untuk mengontrol mesin Anda secara penuh.</i>`;

  if (editMessage) {
    try {
      await ctx.editMessageText(panelText, {
        parse_mode: 'HTML',
        reply_markup: ubotMainMenu,
      });
      return;
    } catch (e) {}
  }

  await ctx.reply(panelText, {
    parse_mode: 'HTML',
    reply_markup: ubotMainMenu,
  });
}



// Commands (Main Gateway)
bot.command(['start', 'menu'], async (ctx) => {
  await sendMainMenu(ctx, false);
});

// Setup Private Topic untuk Owner
bot.command('setup_topic', async (ctx) => {
  if (ctx.from.id !== config.ownerId) return;
  
  try {
    const topic = await ctx.api.createForumTopic(config.ownerId, "Persetujuan Ubot", {
      icon_custom_emoji_id: "📝"
    });
    
    await ctx.reply(
      `✅ <b>Topic Berhasil Dibuat!</b>\n\n` +
      `Topic ID Anda adalah: <code>${topic.message_thread_id}</code>\n\n` +
      `Silakan masukkan ID ini ke dalam variabel <code>HARDCODED_LOG_TOPIC_ID</code> di file <code>src/config.js</code> agar semua permintaan masuk ke topic tersebut. ` +
      `Untuk <code>HARDCODED_LOG_GROUP_ID</code>, Anda bisa mengisinya dengan ID Anda sendiri (<code>${config.ownerId}</code>).`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error(err);
    await ctx.reply(
      `❌ <b>Gagal membuat Topic.</b>\n\n` +
      `Pastikan Anda sudah mengaktifkan fitur <b>"Topics"</b> (Forum) di pengaturan chat pribadi (PM) bot ini terlebih dahulu!\n\n` +
      `<i>Pesan Error: ${err.message}</i>`,
      { parse_mode: 'HTML' }
    );
  }
});

// Callback: Back to Main Menu
bot.callbackQuery('back_to_main', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendMainMenu(ctx, true);
});

// In-memory set for approved users
const approvalsFile = path.join(process.cwd(), 'approvals.json');

if (!global.approvedUsers) {
  global.approvedUsers = new Set();
  try {
    if (fs.existsSync(approvalsFile)) {
      const data = JSON.parse(fs.readFileSync(approvalsFile, 'utf8'));
      global.approvedUsers = new Set(data);
    }
  } catch (e) {}
}

function saveApprovals() {
  try {
    fs.writeFileSync(approvalsFile, JSON.stringify([...global.approvedUsers]));
  } catch (e) {}
}

// Callback: Registration Selection Page (OTP or QR)
bot.callbackQuery('ubot_register_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  
  const telegramId = ctx.from.id;
  const isOwner = telegramId === config.ownerId;
  const isApproved = global.approvedUsers.has(telegramId);
  
  if (!isOwner && !isApproved) {
    const text = 
      `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
      `───────────────────────\n` +
      `🔒 <b>AKSES DITOLAK</b>\n\n` +
      `Anda belum memiliki izin untuk mendaftarkan Userbot di server ini.\n` +
      `Silakan minta persetujuan kepada Owner terlebih dahulu.`;
      
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('📩 Ajukan Permintaan Persetujuan', 'request_approval').row()
        .text('Kembali', 'back_to_main'),
    });
    return;
  }

  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `📝 <b>PENDAFTARAN USERBOT BARU</b>\n\n` +
    `Silakan pilih salah satu metode pendaftaran di bawah:\n\n` +
    `<blockquote>` +
    `1. <b>📱 Login via OTP (Nomor HP)</b>:\n` +
    `   Sistem akan meminta nomor handphone Anda, lalu mengirimkan kode OTP resmi dari Telegram untuk otorisasi.\n\n` +
    `2. <b>🔍 Login via Scan QR Code</b>:\n` +
    `   Bot akan men-generate gambar QR Code. Anda cukup masuk ke menu <i>Settings > Devices > Link Desktop Device</i> pada aplikasi Telegram HP Anda dan memindai QR tersebut.` +
    `</blockquote>`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: registrationMethodsKeyboard,
  });
});

// Callback: Request Approval
bot.callbackQuery('request_approval', async (ctx) => {
  const telegramId = ctx.from.id;
  const name = ctx.from.first_name || 'User';
  const username = ctx.from.username ? `@${ctx.from.username}` : 'Tanpa Username';
  
  try {
    // Tentukan target pengiriman log
    const targetChat = config.logGroupId || config.ownerId;
    const extraParams = {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('✅ Setujui', `approve_reg:${telegramId}`)
        .text('❌ Tolak', `reject_reg:${telegramId}`)
    };
    
    if (config.logGroupId && config.logTopicId) {
      extraParams.message_thread_id = config.logTopicId;
    }

    // Kirim notifikasi ke Target
    await ctx.api.sendMessage(targetChat, 
      `🔔 <b>PERMINTAAN REGISTRASI BARU</b>\n\n` +
      `👤 <b>Nama</b>: ${name}\n` +
      `🔖 <b>Username</b>: ${username}\n` +
      `🆔 <b>ID</b>: <code>${telegramId}</code>\n\n` +
      `Ingin mendaftar sebagai Userbot. Apakah disetujui?`, 
      extraParams
    );
    
    await ctx.editMessageText(
      `✅ <b>Permintaan Terkirim!</b>\n\nPermohonan Anda sudah diteruskan. Silakan tunggu pemberitahuan selanjutnya.`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('Kembali', 'back_to_main')
      }
    );
  } catch (err) {
    console.error(err);
    await ctx.answerCallbackQuery({ text: 'Gagal mengirim permintaan! Pastikan Owner/Grup telah disetting dan Bot adalah Admin.', show_alert: true });
  }
});

// Callback: Approve Registration
bot.callbackQuery(/^approve_reg:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  global.approvedUsers.add(targetId);
  saveApprovals();
  
  await ctx.editMessageText(`✅ <b>Permintaan Disetujui!</b>\n\nPengguna dengan ID <code>${targetId}</code> sekarang dapat mendaftar.`, { parse_mode: 'HTML' });
  
  try {
    await ctx.api.sendMessage(targetId, `🎉 <b>SELAMAT!</b>\n\nPermintaan pendaftaran Userbot Anda telah <b>disetujui</b> oleh Owner.\nSilakan tekan tombol pendaftaran di menu utama kembali.`, { parse_mode: 'HTML' });
  } catch (e) {}
});

// Callback: Reject Registration
bot.callbackQuery(/^reject_reg:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  global.approvedUsers.delete(targetId);
  saveApprovals();
  
  await ctx.editMessageText(`❌ <b>Permintaan Ditolak!</b>\n\nPengguna dengan ID <code>${targetId}</code> tidak diizinkan mendaftar.`, { parse_mode: 'HTML' });
  
  try {
    await ctx.api.sendMessage(targetId, `❌ <b>MAAF</b>\n\nPermintaan pendaftaran Userbot Anda <b>ditolak</b> oleh Owner.`, { parse_mode: 'HTML' });
  } catch (e) {}
});

// Callback: Control Panel Entry
bot.callbackQuery('ubot_control_panel', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendUserbotControlPanel(ctx, true);
});

// Callback: Registration flows
bot.callbackQuery('reg_otp', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('otp-reg');
});

bot.callbackQuery('reg_qr', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('qr-reg');
});

// Cancel registration handler
bot.callbackQuery('cancel_reg', async (ctx) => {
  const userId = ctx.from.id;

  // Clean up active GramJS client if any pendaftaran is in progress
  const client = activeRegClients.get(userId);
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {}
    activeRegClients.delete(userId);
  }

  try {
    await ctx.answerCallbackQuery('Pendaftaran dibatalkan.');
  } catch (e) {}
  await ctx.conversation.exitAll();

  // Try to clean up the message that prompted pendaftaran
  try {
    await ctx.deleteMessage();
  } catch (e) {}

  await ctx.reply('❌ <b>Pendaftaran dibatalkan.</b>', { parse_mode: 'HTML' });
  await sendMainMenu(ctx, false);
});

// Active userbot states handlers
bot.callbackQuery('start_bot', async (ctx) => {
  const telegramId = ctx.from.id;
  const dbSession = getUserbotSession(telegramId);

  if (!dbSession) {
    await ctx.answerCallbackQuery('Sesi tidak ditemukan.');
    return;
  }

  await ctx.answerCallbackQuery('Menghidupkan DeltaUbot...');
  try {
    await userbotManager.startUserbot(telegramId, dbSession.session_string);
    updateUserbotStatus(telegramId, true);
    await ctx.reply('🟢 <b>DeltaUbot Anda berhasil dihidupkan!</b>', { parse_mode: 'HTML' });
    await sendUserbotControlPanel(ctx, false);
  } catch (err) {
    await ctx.reply(`❌ Gagal menghidupkan DeltaUbot: ${err.message}`);
  }
});

bot.callbackQuery('stop_bot', async (ctx) => {
  const telegramId = ctx.from.id;
  
  await ctx.answerCallbackQuery('Mematikan DeltaUbot...');
  try {
    await userbotManager.stopUserbot(telegramId);
    updateUserbotStatus(telegramId, false);
    await ctx.reply('🔌 <b>DeltaUbot berhasil dimatikan.</b>', { parse_mode: 'HTML' });
    await sendUserbotControlPanel(ctx, false);
  } catch (err) {
    await ctx.reply(`❌ Gagal mematikan DeltaUbot: ${err.message}`);
  }
});

// Delete session handlers
bot.callbackQuery('delete_session', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `⚠️ <b>KONFIRMASI PENGHAPUSAN SESI</b>\n\n` +
    `Apakah Anda benar-benar yakin ingin menghapus userbot Anda?\n\n` +
    `Tindakan ini akan mematikan userbot secara permanen dan menghapus seluruh sesi pendaftaran dari database kami.`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('✅ Ya, Hapus Permanen', 'confirm_delete')
        .text('❌ Batal', 'ubot_control_panel')
    }
  );
});

bot.callbackQuery('confirm_delete', async (ctx) => {
  const telegramId = ctx.from.id;
  await ctx.answerCallbackQuery('Menghapus...');
  
  await userbotManager.stopUserbot(telegramId);
  deleteUserbot(telegramId);
  
  await ctx.editMessageText('🗑️ <b>Sesi DeltaUbot Anda telah dihapus sepenuhnya.</b>', { parse_mode: 'HTML' });
  await sendMainMenu(ctx, false);
});



// Callback: Show Modules & Plugins
bot.callbackQuery('show_modules', async (ctx) => {
  await ctx.answerCallbackQuery();
  
  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `📦 <b>DAFTAR MODUL &amp; PLUGIN TERSEDIA</b>\n\n` +
    `Berikut adalah modul-modul otomatis dan utilitas yang didukung oleh <b>DeltaUbotJS</b> saat ini:\n\n` +
    `<blockquote>` +
    `1. 💤 <b>Modul AFK (Auto-Read &amp; Auto-Reply)</b>:\n` +
    `   Userbot otomatis membaca PM masuk DAN membalasnya dengan alasan AFK kustom Anda secara bersamaan.\n\n` +
    `2. 🚫 <b>Modul Anti-PM (Anti-Spam Inbox)</b>:\n` +
    `   Mengirim peringatan di PM pertama orang yang menghubungi Anda, lalu secara <b>otomatis menghapus secara permanen</b> seluruh chat pribadi berikutnya agar inbox Anda tetap bersih.\n\n` +
    `3. 🏓 <b>Modul Utility (.ping)</b>:\n` +
    `   Ketik <code>.ping</code> di chat mana pun menggunakan akun Anda. Userbot akan mengedit pesan Anda secara instan menjadi <b>Pong!</b>.\n\n` +
    `4. 🔍 <b>Modul Info ID (.id)</b>:\n` +
    `   Ketik <code>.id</code> untuk melihat ID Chat, atau balas (reply) chat target dengan <code>.id</code> untuk memunculkan detail data ID Telegram mereka.\n\n` +
    `5. 🧹 <b>Modul Hapus Chat (.purge)</b>:\n` +
    `   Ketik <code>.purge &lt;jumlah&gt;</code> untuk menghapus secara massal pesan keluar Anda sendiri di obrolan.` +
    `</blockquote>\n\n` +
    `💡 <i>Nantikan pembaruan modul-modul premium lainnya secara berkala!</i>`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: backToMainKeyboard,
  });
});

// Callback: Show System Stats
bot.callbackQuery('show_stats', async (ctx) => {
  await ctx.answerCallbackQuery();
  
  const activeClients = userbotManager.clients.size;
  let totalRegistered = 0;
  try {
    const allBots = getAllRegisteredUsers();
    totalRegistered = allBots.length;
  } catch (e) {}

  const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const uptimeMinutes = Math.round(process.uptime() / 60);

  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `📊 <b>STATISTIK DAN KINERJA BOT</b>\n\n` +
    `Berikut adalah statistik operasional DeltaUbotJS saat ini:\n\n` +
    `<blockquote>` +
    `📈 <b>Statistik Pengguna</b>:\n` +
    `• <b>Total Terdaftar</b>: <code>${totalRegistered} Akun</code>\n` +
    `• <b>Userbot Aktif (Running)</b>: <code>${activeClients} Akun</code>\n\n` +
    `🖥️ <b>Kinerja Server (Termux)</b>:\n` +
    `• <b>Penggunaan RAM</b>: <code>${memoryUsage} MB</code>\n` +
    `• <b>Waktu Aktif Bot</b>: <code>${uptimeMinutes} Menit</code>\n` +
    `• <b>Platform &amp; Arch</b>: <code>${process.platform} (${process.arch})</code>\n` +
    `• <b>Node.js Engine</b>: <code>${process.version}</code>` +
    `</blockquote>\n\n` +
    `⚙️ <i>Server berjalan dengan stabil dan latensi sangat rendah.</i>`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: backToMainKeyboard,
  });
});

// Callback: Show Donate Options
bot.callbackQuery('show_donate', async (ctx) => {
  await ctx.answerCallbackQuery();

  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `💰 <b>DONASI &amp; DUKUNGAN PENGEMBANG</b>\n\n` +
    `Dukung pengembangan <b>DeltaUbotJS</b> agar terus stabil, mendapatkan pembaruan modul, dan bebas dari kendala server!\n\n` +
    `<blockquote>` +
    `Anda dapat memberikan donasi/dukungan melalui metode berikut:\n\n` +
    `• <b>e-Wallet (DANA/OVO/GoPay)</b>: <code>0821-xxxx-xxxx</code>\n` +
    `• <b>Transfer Bank (Bank BCA)</b>: <code>883xxxxxxx</code> a.n. Developer\n` +
    `• <b>QRIS (Dukungan Instan)</b>: Minta scan QRIS langsung ke Admin.` +
    `</blockquote>\n\n` +
    `Terima kasih banyak atas segala bentuk dukungan Anda untuk menjaga proyek ini tetap hidup! 🙏`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: backToMainKeyboard,
  });
});

// Help & FAQ handler
bot.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  
  const helpText = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `❓ <b>BANTUAN &amp; PANDUAN PENGGUNAAN</b>\n\n` +
    `DeltaUbotJS dirancang dengan navigasi tombol modern untuk kenyamanan Anda.\n\n` +
    `<blockquote>` +
    `📖 <b>Panduan Menjalankan Userbot</b>:\n` +
    `1. Klik tombol <b>Daftar DeltaUbot</b> di menu utama jika belum terdaftar.\n` +
    `2. Pilih metode login (Scan QR disarankan karena sangat aman).\n` +
    `3. Selesaikan pemindaian/verifikasi kode, lalu klik <b>Hidupkan Userbot</b>.\n` +
    `4. Ketik <code>.ping</code> di chat pribadi Anda untuk menguji keaktifan.\n\n` +
    `💡 <b>Pertanyaan Umum (FAQ)</b>:\n` +
    `• <b>Q</b>: <i>Apakah aman dari banned?</i>\n` +
    `  <b>A</b>: Sangat aman! Program menyamar sebagai browser Android resmi sehingga dipercaya server Telegram.\n` +
    `• <b>Q</b>: <i>Bagaimana mengubah pesan AFK?</i>\n` +
    `  <b>A</b>: Klik tombol <b>Kontrol Ubot Anda > Kelola Fitur > Setel Alasan AFK</b>.` +
    `</blockquote>\n\n` +
    `📞 <b>Hubungi Pengembang</b>: [@DeveloperUsername]`;

  await ctx.editMessageText(helpText, {
    parse_mode: 'HTML',
    reply_markup: backToMainKeyboard,
  });
});

/**
 * 👑 ADMIN PANEL CALLBACKS (Owner Only)
 */
bot.callbackQuery('admin_panel', async (ctx) => {
  const telegramId = ctx.from.id;
  
  // Verifikasi Owner
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Anda bukan Owner Bot!', { show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  
  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `👑 <b>PANEL ADMINISTRATOR (OWNER)</b>\n\n` +
    `Selamat datang Owner! Di sini Anda memiliki akses eksklusif untuk memantau dan mengendalikan jaringan DeltaUbotJS:\n\n` +
    `<blockquote>` +
    `👥 <b>List Pengguna</b>: Memantau seluruh daftar userbot yang terdaftar, melihat status, menghidupkan/mematikan secara paksa, atau menghapus sesi mereka.\n\n` +
    `📢 <b>Broadcast Pesan</b>: Mengirim pesan massal ke seluruh pengguna.\n\n` +
    `🔄 <b>Restart Semua Ubot</b>: Memaksa menyambungkan kembali seluruh userbot aktif secara aman.` +
    `</blockquote>`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: adminPanelKeyboard,
  });
});

// Admin: List Pengguna
bot.callbackQuery('admin_user_list', async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  const users = getAllRegisteredUsers();

  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `👥 <b>DAFTAR PENGGUNA TERDAFTAR</b>\n\n` +
    `<blockquote>` +
    `Ditemukan total <code>${users.length} pengguna</code> di database.` +
    `</blockquote>\n\n` +
    `Ketuk salah satu ID pengguna di bawah untuk melihat detail setelan dan mengontrol (Hidupkan/Matikan/Hapus) akun mereka secara remote:`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: createAdminUserListKeyboard(users),
  });
});

// Admin: View Specific User Account Details (Regex Router)
bot.callbackQuery(/^admin_view_user_(\d+)$/, async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  const userId = Number(ctx.match[1]);
  const userSession = getUserbotSession(userId);

  if (!userSession) {
    await ctx.answerCallbackQuery('❌ Pengguna tidak ditemukan!', { show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  
  const isRunning = userbotManager.isRunning(userId);
  const text = renderAdminUserDetailText(userId, userSession, isRunning);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: createAdminUserControlKeyboard(userId, isRunning),
  });
});

// Admin: Force Start Userbot
bot.callbackQuery(/^admin_start_user_(\d+)$/, async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  const userId = Number(ctx.match[1]);
  const userSession = getUserbotSession(userId);

  if (!userSession) {
    await ctx.answerCallbackQuery('❌ Sesi tidak ditemukan!', { show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery('Menghidupkan ubot user...');
  try {
    await userbotManager.startUserbot(userId, userSession.session_string);
    updateUserbotStatus(userId, true);
    await ctx.reply(`🟢 <b>Owner Action</b>: DeltaUbot milik user <code>${userId}</code> berhasil <b>dihidupkan</b> secara remote!`, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`❌ Gagal menghidupkan ubot user <code>${userId}</code>: ${err.message}`, { parse_mode: 'HTML' });
  }

  // Re-render
  const isRunning = userbotManager.isRunning(userId);
  try {
    await ctx.editMessageText(renderAdminUserDetailText(userId, userSession, isRunning), {
      parse_mode: 'HTML',
      reply_markup: createAdminUserControlKeyboard(userId, isRunning),
    });
  } catch (e) {}
});

// Admin: Force Stop Userbot
bot.callbackQuery(/^admin_stop_user_(\d+)$/, async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  const userId = Number(ctx.match[1]);
  const userSession = getUserbotSession(userId);

  if (!userSession) {
    await ctx.answerCallbackQuery('❌ Sesi tidak ditemukan!', { show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery('Mematikan ubot user...');
  try {
    await userbotManager.stopUserbot(userId);
    updateUserbotStatus(userId, false);
    await ctx.reply(`🔌 <b>Owner Action</b>: DeltaUbot milik user <code>${userId}</code> berhasil <b>dimatikan</b> secara remote!`, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`❌ Gagal mematikan ubot user <code>${userId}</code>: ${err.message}`, { parse_mode: 'HTML' });
  }

  // Re-render
  const isRunning = userbotManager.isRunning(userId);
  try {
    await ctx.editMessageText(renderAdminUserDetailText(userId, userSession, isRunning), {
      parse_mode: 'HTML',
      reply_markup: createAdminUserControlKeyboard(userId, isRunning),
    });
  } catch (e) {}
});

// Admin: Force Delete User Account (Confirmation Screen)
bot.callbackQuery(/^admin_delete_user_(\d+)$/, async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  const userId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const text = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `⚠️ <b>KONFIRMASI TINDAKAN OWNER (HAPUS PAKSA)</b>\n\n` +
    `Apakah Anda yakin ingin menghapus paksa sesi user <code>${userId}</code>?\n\n` +
    `Tindakan ini akan mematikan userbot miliknya secara paksa dan menghapus seluruh string sesi pendaftaran dari database DeltaUbotJS.`;

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('✅ Ya, Hapus Paksa', `admin_confirm_delete_user_${userId}`)
      .text('❌ Batal', `admin_view_user_${userId}`)
  });
});

// Admin: Confirm Force Delete
bot.callbackQuery(/^admin_confirm_delete_user_(\d+)$/, async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  const userId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery('Menghapus paksa...');

  // 1. Stop userbot
  await userbotManager.stopUserbot(userId);
  // 2. Delete from DB
  deleteUserbot(userId);

  // 3. Notify the user privately via Master Bot
  try {
    await ctx.api.sendMessage(userId, 
      `⚠️ <b>PEMBERITAHUAN DELTAUBOTJS</b>\n\n` +
      `Sesi userbot Anda telah <b>diberhentikan dan dihapus secara paksa</b> oleh Administrator Utama.\n` +
      `Silakan hubungi admin atau gunakan <code>/start</code> untuk mendaftar kembali.`, { parse_mode: 'HTML' }
    );
  } catch (err) {
    // Ignore if they blocked the bot
  }

  await ctx.reply(`🗑️ <b>Owner Action</b>: Akun user <code>${userId}</code> telah berhasil dihapus paksa.`, { parse_mode: 'HTML' });
  
  // Go back to list
  const users = getAllRegisteredUsers();
  const listText = 
    `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
    `───────────────────────\n` +
    `👥 <b>DAFTAR PENGGUNA TERDAFTAR</b>\n\n` +
    `Ditemukan total <code>${users.length} pengguna</code> di database.\n\n` +
    `Ketuk salah satu ID pengguna di bawah untuk melihat detail setelan dan mengontrol (Hidupkan/Matikan/Hapus) akun mereka secara remote:`;

  await ctx.editMessageText(listText, {
    parse_mode: 'HTML',
    reply_markup: createAdminUserListKeyboard(users),
  });
});

// Admin: Extend Userbot Expiration by 30 days
bot.callbackQuery(/^admin_extend_user_(\d+)$/, async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }

  const userId = Number(ctx.match[1]);
  const userSession = getUserbotSession(userId);

  if (!userSession) {
    await ctx.answerCallbackQuery('❌ Pengguna tidak ditemukan!', { show_alert: true });
    return;
  }

  // Hitung tanggal kedaluwarsa baru (tambah 30 hari dari expired_at lama atau waktu sekarang jika sudah lewat)
  const currentExp = new Date(userSession.expired_at);
  const now = new Date();
  const baseDate = currentExp > now ? currentExp : now;
  
  const newExp = new Date(baseDate);
  newExp.setDate(newExp.getDate() + 30);

  // Simpan ke DB
  updateUserbotFeature(userId, 'expired_at', newExp.toISOString());
  
  await ctx.answerCallbackQuery('Masa aktif diperpanjang +30 hari!', { show_alert: true });

  // Kirim notifikasi pribadi ke user lewat Master Bot
  try {
    await ctx.api.sendMessage(userId, 
      `✨ <b>DELTAUBOTJS - MASA AKTIF DIPERPANJANG</b> ✨\n` +
      `───────────────────────\n` +
      `Kabar gembira! Masa aktif layanan userbot Anda telah diperpanjang sebanyak <b>30 hari</b> oleh Administrator.\n\n` +
      `📅 <b>Masa Aktif Baru</b>: <code>${newExp.toLocaleDateString()}</code>\n` +
      `───────────────────────`, { parse_mode: 'HTML' }
    );
  } catch (err) {
    // Ignore
  }

  // Re-render control panel using refreshed session
  const refreshedSession = getUserbotSession(userId);
  const isRunning = userbotManager.isRunning(userId);
  try {
    await ctx.editMessageText(renderAdminUserDetailText(userId, refreshedSession || userSession, isRunning), {
      parse_mode: 'HTML',
      reply_markup: createAdminUserControlKeyboard(userId, isRunning),
    });
  } catch (e) {}
});

bot.callbackQuery('admin_broadcast', async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('admin-broadcast-conv');
});

bot.callbackQuery('admin_restart_all', async (ctx) => {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.answerCallbackQuery('❌ Akses ditolak!', { show_alert: true });
    return;
  }
  
  await ctx.answerCallbackQuery('Memulai restart massal...');
  await ctx.reply('⏳ <b>Owner Action</b>: Merestart seluruh instans userbot aktif dari database secara massal...', { parse_mode: 'HTML' });
  
  try {
    await userbotManager.restartAllActive();
    await ctx.reply('✅ <b>Restart Massal Selesai!</b> Seluruh userbot aktif telah disambungkan kembali dengan sukses.', { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`❌ Gagal merestart seluruh userbot: ${err.message}`);
  }
  
  await sendMainMenu(ctx, false);
});

// Global error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`❌ Error in middleware while handling update ${ctx.update.update_id}:`, err.error);
});

export default bot;
