import { Menu } from '@grammyjs/menu';
import { getUserbotSession, updateUserbotFeature, deleteUserbot, getAllRegisteredUsers } from '../database/db.js';
import userbotManager from '../userbot/manager.js';
import config from '../config.js';

/**
 * Builds the welcome text for the main menu
 */
export function getWelcomeText(ctx) {
  const telegramId = ctx.from.id;
  const dbSession = getUserbotSession(telegramId);
  const isOwner = Number(telegramId) === Number(config.ownerId);

  if (isOwner) {
    const activeClients = userbotManager.clients.size;
    let totalRegistered = 0;
    try { totalRegistered = getAllRegisteredUsers().length; } catch (e) {}
    const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const uptimeMinutes = Math.round(process.uptime() / 60);

    return `👑 <b>MASTER BOT DASHBOARD (OWNER)</b> 👑\n` +
      `───────────────────────\n` +
      `Selamat datang, <b>${ctx.from.first_name}</b>!\n` +
      `Ini adalah pusat kendali level tinggi (Dewa) untuk mengelola server dan seluruh klien Ubot Anda.\n\n` +
      `<blockquote>` +
      `📈 <b>Statistik Klien</b>\n` +
      `• Total Pendaftar: <code>${totalRegistered} Klien</code>\n` +
      `• Ubot Aktif: <code>${activeClients} Klien</code>\n\n` +
      `🖥️ <b>Sistem Server</b>\n` +
      `• Penggunaan RAM: <code>${memoryUsage} MB</code>\n` +
      `• Uptime: <code>${uptimeMinutes} Menit</code>\n` +
      `</blockquote>\n` +
      `💡 <i>Pilih opsi di bawah untuk mengelola sistem.</i>`;
  } else {
    let statusLayanan = '🔴 <b>Belum Terdaftar</b>';
    if (dbSession) {
      statusLayanan = userbotManager.isRunning(telegramId)
        ? '🟢 <b>Terdaftar &amp; Aktif</b>'
        : '🟡 <b>Terdaftar (Nonaktif)</b>';
    }

    const botName = dbSession?.custom_name || 'DeltaUbotJS';
    const headerName = botName.toUpperCase().split('').join(' ');

    return `🔺 <b>${headerName}</b> 🔺\n` +
      `───────────────────────\n` +
      `👋 Halo, <b>${ctx.from.first_name}</b>!\n\n` +
      `Selamat datang di pusat kendali <b>DeltaUbotJS</b>. Sistem <i>Multi-Userbot</i> canggih yang didesain untuk kecepatan, keamanan, dan keandalan tinggi.\n\n` +
      `<blockquote>` +
      `👤 <b>Informasi Akun</b>\n` +
      `🆔 <b>ID Telegram</b>: <code>${telegramId}</code>\n` +
      `🛡️ <b>Status Sistem</b>: ${statusLayanan}\n` +
      `</blockquote>\n` +
      `💡 <i>Gunakan tombol interaktif di bawah untuk mengelola sesi atau mengakses fitur pengaturan tingkat lanjut.</i>`;
  }
}

// --- SUB-MENU: PENGATURAN FITUR ---
export const ubotSettingsMenu = new Menu('ubot-settings-menu')
  .text(
    (ctx) => {
      const session = getUserbotSession(ctx.from.id);
      return session?.anti_pm === 1 ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF';
    },
    async (ctx) => {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
      
      const newStatus = session.anti_pm === 1 ? 0 : 1;
      updateUserbotFeature(telegramId, 'anti_pm', newStatus);
      ctx.menu.update(); 
      await ctx.answerCallbackQuery(`Anti-PM diubah menjadi ${newStatus === 1 ? 'ON' : 'OFF'}`);
    }
  ).row()
  .text(
    (ctx) => {
      const session = getUserbotSession(ctx.from.id);
      return session?.auto_reply === 1 ? '🤖 Auto-Reply (AFK): 🟢 ON' : '🤖 Auto-Reply (AFK): 🔴 OFF';
    },
    async (ctx) => {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
      
      const newStatus = session.auto_reply === 1 ? 0 : 1;
      updateUserbotFeature(telegramId, 'auto_reply', newStatus);
      ctx.menu.update();
      await ctx.answerCallbackQuery(`Auto-Reply (AFK) diubah menjadi ${newStatus === 1 ? 'ON' : 'OFF'}`);
    }
  ).row()
  .text('📝 Ubah Pesan AFK', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('afk-reason-conv');
  }).row()
  .text('🔙 Kembali', (ctx) => ctx.menu.nav('ubot-main-menu'));

// --- MENU UTAMA: KONTROL UBOT ---
export const ubotMainMenu = new Menu('ubot-main-menu')
  .text(
    (ctx) => {
      const isRunning = userbotManager.isRunning(ctx.from.id);
      return isRunning ? '🔌 Matikan Userbot' : '⚡ Hidupkan Userbot';
    },
    async (ctx) => {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) return ctx.answerCallbackQuery('Sesi tidak ditemukan.');

      const isRunning = userbotManager.isRunning(telegramId);
      if (isRunning) {
        await ctx.answerCallbackQuery('Mematikan DeltaUbot...');
        await userbotManager.stopUserbot(telegramId);
        await ctx.reply('🔴 <b>DeltaUbot Anda berhasil dimatikan!</b>', { parse_mode: 'HTML' });
      } else {
        await ctx.answerCallbackQuery('Menghidupkan DeltaUbot...');
        try {
          await userbotManager.startUserbot(telegramId, session.session_string);
          await ctx.reply('🟢 <b>DeltaUbot Anda berhasil dihidupkan!</b>', { parse_mode: 'HTML' });
        } catch (err) {
          await ctx.reply(`❌ Gagal menghidupkan DeltaUbot: ${err.message}`);
        }
      }
      ctx.menu.update(); 
    }
  ).row()
  .submenu('⚙️ Pengaturan Lanjutan', 'ubot-settings-menu')
  .row()
  .text('❌ Hapus Sesi', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = ctx.from.id;
    if (userbotManager.isRunning(telegramId)) {
      await userbotManager.stopUserbot(telegramId);
    }
    deleteUserbot(telegramId);
    await ctx.editMessageText('✅ <b>Sesi Anda berhasil dihapus.</b>\nSilakan ketik /start untuk mendaftar kembali.', { parse_mode: 'HTML' });
  })
  .text('🔙 Ke Menu Induk', (ctx) => ctx.menu.nav('master-main-menu'));

ubotMainMenu.register(ubotSettingsMenu);

// --- REGISTRATION MENU ---
export const registrationMenu = new Menu('reg-menu')
  .text('📱 Login via OTP', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('otp-reg');
  })
  .text('🔍 Login via Scan QR', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('qr-reg');
  }).row()
  .text('🔙 Kembali', (ctx) => ctx.menu.nav('master-main-menu'));

// --- ADMIN PREMIUM MENU ---
export const adminPremiumMenu = new Menu('admin-premium-menu')
  .dynamic((ctx, range) => {
    const targetId = ctx.session?.selectedUserToManage;
    if (!targetId) return;

    const session = getUserbotSession(targetId);
    if (!session) return;

    const expDate = new Date(session.expired_at);
    const now = new Date();
    const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
    
    range.text(`Masa Aktif: ${diffDays > 0 ? diffDays + ' Hari' : 'KADALUWARSA'}`, (ctx) => ctx.answerCallbackQuery('Info Masa Aktif')).row();

    const addDays = (days) => async (ctx) => {
      const currentExp = new Date(session.expired_at || new Date());
      currentExp.setDate(currentExp.getDate() + days);
      updateUserbotFeature(targetId, 'expired_at', currentExp.toISOString());
      ctx.menu.update();
      await ctx.answerCallbackQuery(`Berhasil menambahkan ${days} hari!`);
    };

    range.text('+30 Hari', addDays(30))
         .text('+90 Hari', addDays(90))
         .text('+365 Hari', addDays(365)).row();
  })
  .text('🔙 Kembali', (ctx) => ctx.menu.nav('admin-manage-user-menu'));

// --- ADMIN MANAGE USER MENU ---
export const adminManageUserMenu = new Menu('admin-manage-user-menu')
  .dynamic((ctx, range) => {
    const targetId = ctx.session?.selectedUserToManage;
    if (!targetId) {
      range.text('⚠️ Error: User tidak ditemukan', (ctx) => ctx.menu.nav('admin-user-list-menu')).row();
      return;
    }

    const isRunning = userbotManager.isRunning(targetId);
    
    // Info button (non-clickable)
    range.text(`👤 Mengelola: ${targetId}`, (ctx) => ctx.answerCallbackQuery('Mengelola pengguna ini')).row();

    // Toggle button
    range.text(
      isRunning ? '🔌 Matikan Ubot' : '⚡ Hidupkan Ubot',
      async (ctx) => {
        if (isRunning) {
          await userbotManager.stopUserbot(targetId);
          await ctx.answerCallbackQuery('Ubot pengguna dimatikan.');
        } else {
          const dbSession = getUserbotSession(targetId);
          if (dbSession) {
            try {
              await userbotManager.startUserbot(targetId, dbSession.session_string);
              await ctx.answerCallbackQuery('Ubot pengguna dihidupkan.');
            } catch (err) {
              await ctx.answerCallbackQuery(`Gagal: ${err.message}`);
            }
          } else {
            await ctx.answerCallbackQuery('Sesi tidak valid di database.');
          }
        }
        ctx.menu.update();
      }
    ).row();

    // Premium button
    range.submenu('⏳ Atur Masa Aktif', 'admin-premium-menu').row();

    // Delete session button
    range.text('❌ Hapus Sesi Permanen', async (ctx) => {
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
      }
      deleteUserbot(targetId);
      await ctx.answerCallbackQuery('Sesi pengguna dihapus dari database.');
      ctx.menu.nav('admin-user-list-menu');
    }).row();
  })
  .text('🔙 Kembali ke Daftar', (ctx) => ctx.menu.nav('admin-user-list-menu'));

adminManageUserMenu.register(adminPremiumMenu);

// --- ADMIN USER LIST MENU (DYNAMIC) ---
export const adminUserListMenu = new Menu('admin-user-list-menu')
  .dynamic((ctx, range) => {
    const users = getAllRegisteredUsers();
    if (users.length === 0) {
      range.text('📭 Belum Ada Pengguna', (ctx) => ctx.answerCallbackQuery('Kosong')).row();
      return;
    }

    const pageSize = 5;
    const totalPages = Math.ceil(users.length / pageSize);
    let currentPage = ctx.session?.adminUserListPage || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const pageUsers = users.slice(startIndex, startIndex + pageSize);

    for (const user of pageUsers) {
      const label = `👤 ID: ${user.telegram_id}${user.phone ? ' (' + user.phone + ')' : ''}`;
      range.text(label, async (ctx) => {
        ctx.session.selectedUserToManage = user.telegram_id;
        ctx.menu.nav('admin-manage-user-menu');
      }).row();
    }

    // Pagination controls
    if (totalPages > 1) {
      if (currentPage > 1) {
        range.text('⬅️ Prev', (ctx) => {
          ctx.session.adminUserListPage = currentPage - 1;
          ctx.menu.update();
        });
      }
      
      range.text(`Halaman ${currentPage}/${totalPages}`, (ctx) => ctx.answerCallbackQuery(`Halaman ${currentPage}`));
      
      if (currentPage < totalPages) {
        range.text('Next ➡️', (ctx) => {
          ctx.session.adminUserListPage = currentPage + 1;
          ctx.menu.update();
        });
      }
      range.row();
    }
  })
  .text('🔙 Kembali ke Dashboard', (ctx) => {
    ctx.session.adminUserListPage = 1; // reset on exit
    ctx.menu.nav('admin-main-menu');
  });

adminUserListMenu.register(adminManageUserMenu);

// --- ADMIN MAIN MENU ---
export const adminMainMenu = new Menu('admin-main-menu')
  .submenu('👥 List Pengguna', 'admin-user-list-menu')
  .row()
  .text('📢 Broadcast Pesan', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('admin-broadcast-conv');
  })
  .row()
  .text('🔄 Restart Semua Ubot', async (ctx) => {
    await ctx.answerCallbackQuery('Merestart semua Ubot...');
    await userbotManager.restartAllUserbots();
    await ctx.reply('✅ <b>Semua Ubot berhasil direstart.</b>', { parse_mode: 'HTML' });
  })
  .row()
  .text('🔙 Kembali ke Beranda', (ctx) => ctx.menu.nav('master-main-menu'));

adminMainMenu.register(adminUserListMenu);

// --- MASTER MAIN MENU ---
export const masterMainMenu = new Menu('master-main-menu')
  .dynamic((ctx, range) => {
    if (ctx.session?.infoView) {
      // IN INFO VIEW MODE
      range.text('🔙 Kembali ke Beranda', async (ctx) => {
        ctx.session.infoView = false;
        await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML', reply_markup: ctx.menu });
        ctx.menu.update();
      }).row();
      return;
    }

    // EVERYONE GETS THE STANDARD LAYOUT
    const isOwner = Number(ctx.from.id) === Number(config.ownerId);
    const dbSession = getUserbotSession(ctx.from.id);
    
    const ubotButtonText = isOwner 
      ? (dbSession ? '🟢 Menu Userbot Pribadi' : '📝 Daftar Ubot (Owner)')
      : (dbSession ? '🟢 Menu Userbot' : '📝 Daftar DeltaUbot');
      
    range.text(ubotButtonText, (ctx) => {
      if (dbSession) {
        ctx.menu.nav('ubot-main-menu');
      } else {
        ctx.menu.nav('reg-menu');
      }
    }).row()
    .text('📦 List Modul', async (ctx) => {
      ctx.session.viewingHelpModule = null;
      ctx.session.helpPage = 1;
      const { buildHelpMenuText } = await import('./inlineHelp.js');
      const dbSession = getUserbotSession(ctx.from.id);
      await ctx.editMessageText(buildHelpMenuText(dbSession), { parse_mode: 'HTML' });
      ctx.menu.nav('inline-help-menu');
    })
    .text('📊 Statistik', async (ctx) => {
      await ctx.answerCallbackQuery();
      const activeClients = userbotManager.clients.size;
      let totalRegistered = 0;
      try { totalRegistered = getAllRegisteredUsers().length; } catch (e) {}
      const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const uptimeMinutes = Math.round(process.uptime() / 60);

      const text = `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n───────────────────────\n📊 <b>STATISTIK DAN KINERJA BOT</b>\n\n<blockquote>📈 <b>Statistik Pengguna</b>:\n• <b>Total Terdaftar</b>: <code>${totalRegistered} Akun</code>\n• <b>Userbot Aktif (Running)</b>: <code>${activeClients} Akun</code>\n\n🖥️ <b>Kinerja Server</b>:\n• <b>Penggunaan RAM</b>: <code>${memoryUsage} MB</code>\n• <b>Waktu Aktif Bot</b>: <code>${uptimeMinutes} Menit</code></blockquote>`;
      ctx.session.infoView = true;
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: ctx.menu });
    }).row()
    .text('💰 Donasi', async (ctx) => {
      await ctx.answerCallbackQuery();
      const text = `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n───────────────────────\n💰 <b>DONASI &amp; DUKUNGAN PENGEMBANG</b>\n\n<blockquote>• <b>e-Wallet (DANA/OVO/GoPay)</b>: <code>0821-xxxx-xxxx</code>\n• <b>Transfer Bank (BCA)</b>: <code>883xxxxxxx</code>\n</blockquote>`;
      ctx.session.infoView = true;
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: ctx.menu });
    })
    .text('❓ Bantuan', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply("Untuk bantuan, silakan gunakan menu navigasi atau kirim pesan ke Admin.", { parse_mode: 'HTML' });
    }).row();

    // IF OWNER, ADD ADMIN PANEL BUTTON AT THE BOTTOM
    if (isOwner) {
      range.submenu('👑 Panel Admin (Owner)', 'admin-main-menu').row();
    }
  });

masterMainMenu.register(ubotMainMenu);
masterMainMenu.register(registrationMenu);
masterMainMenu.register(adminMainMenu);

// Import and register inlineHelpMenu so we can navigate to it
import { inlineHelpMenu } from './inlineHelp.js';
masterMainMenu.register(inlineHelpMenu);
