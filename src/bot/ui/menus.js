import { Menu } from '@grammyjs/menu';
import { getUserbotSession, updateUserbotFeature, deleteUserbot, getAllRegisteredUsers, getDisabledPlugins, enablePlugin, disablePlugin, updateUserbotStatus } from '../../core/database.js';
import userbotManager from '../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../core/pluginRegistry.js';
import config from '../../config.js';

const DIVIDER = '───────────────────────';
const PROTECTED_PLUGINS = ['admin', 'pluginmanager'];

function brandHeader(title, session = null) {
  const botName = session?.custom_name || ctx.me?.first_name || 'Userbot';
  const headerName = botName.toUpperCase().split('').join(' ');
  return `🔺 <b>${headerName}</b> 🔺\n${DIVIDER}\n${title}\n${DIVIDER}`;
}

function statusBadge(condition, onText, offText) {
  return condition ? `🟢 <b>${onText}</b>` : `🔴 <b>${offText}</b>`;
}

function richStatusBadge(condition, onText, offText) {
  return condition ? `🟢 ${onText}` : `🔴 ${offText}`;
}


function plainStatusBadge(condition, onText, offText) {
  return condition ? `🟢 ${onText}` : `🔴 ${offText}`;
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '');
}

function preTable(rows) {
  const width = Math.max(...rows.map(([key]) => String(key).length), 4);
  const lines = rows.map(([key, value]) => `${String(key).padEnd(width)}  ${String(value)}`);
  return `<pre>${lines.join('\n')}</pre>`;
}

function compactHeader(title, session = null) {
  return `${brandHeader(title, session)}\n`;
}

function escapeRichHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function daysLeftText(dateValue) {
  const expDate = new Date(dateValue);
  const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
  return diffDays > 0
    ? `🟢 <code>${expDate.toLocaleDateString()}</code> (${diffDays} hari lagi)`
    : `🔴 <code>${expDate.toLocaleDateString()}</code> (kedaluwarsa)`;
}

function buildStatsBlock() {
  const users = getAllRegisteredUsers();
  const uptimeMinutes = Math.round(process.uptime() / 60);
  return `Total Userbot  ${users.length}\n` +
    `Running        ${userbotManager.clients.size}\n` +
    `Uptime         ${uptimeMinutes} menit`;
}

function pluginPageItems(ctx) {
  const plugins = loadedPlugins.map(p => p.name).sort();
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(plugins.length / perPage));
  let page = ctx.session?.pluginPage || 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  if (ctx.session) ctx.session.pluginPage = page;
  const start = (page - 1) * perPage;
  return { plugins: plugins.slice(start, start + perPage), page, totalPages };
}

/**
 * Builds the welcome text for the main menu
 */
export function getWelcomeText(ctx) {
  const telegramId = ctx.from.id;
  const dbSession = getUserbotSession(telegramId);
  const isOwner = Number(telegramId) === Number(config.ownerId);
  const isRunning = userbotManager.isRunning(telegramId);
  const serviceStatus = dbSession
    ? (isRunning ? '🟢 <b>Aktif / Running</b>' : '🟡 <b>Terdaftar / Stopped</b>')
    : '🔴 <b>Belum Terdaftar</b>';

  if (isOwner) {
    return `${brandHeader('👑 <b>OWNER CONTROL CENTER</b>', dbSession)}\n` +
      `Halo, <b>${ctx.from.first_name}</b>. Kelola semua userbot dan pengaturan server dari panel ini.\n\n` +
      `<pre>Item           Status\n${buildStatsBlock()}\nMode           Inline Menu</pre>\n` +
      `🛡️ <b>Status Ubot Pribadi</b>: ${serviceStatus}\n` +
      `💡 <i>Pilih tombol di bawah. Aksi berbahaya berada di Danger Zone.</i>`;
  }

  return `${brandHeader('🏠 <b>DASHBOARD USER</b>', dbSession)}\n` +
    `Halo, <b>${ctx.from.first_name}</b>. Kelola userbot, plugin, dan fitur otomatisasi Anda dari sini.\n\n` +
    `<blockquote>` +
    `🆔 <b>ID Telegram</b>: <code>${telegramId}</code>\n` +
    `🤖 <b>Status Userbot</b>: ${serviceStatus}\n` +
    (dbSession?.expired_at ? `📅 <b>Masa Aktif</b>: ${daysLeftText(dbSession.expired_at)}\n` : '') +
    `</blockquote>\n` +
    `💡 <i>Gunakan menu inline di bawah untuk navigasi cepat.</i>`;
}



export function getUbotDashboardText(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const isRunning = userbotManager.isRunning(ctx.from.id);
  return compactHeader('🤖 <b>USERBOT DASHBOARD</b>', session) + '\n\n' +
    preTable([
      ['Koneksi', plainStatusBadge(isRunning, 'Running', 'Stopped')],
      ['Anti-PM', plainStatusBadge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK Reply', plainStatusBadge(session?.auto_reply === 1, 'ON', 'OFF')],
      ['Masa Aktif', session?.expired_at ? stripHtml(daysLeftText(session.expired_at)) : '-'],
    ]);
}

export function getUbotSettingsText(ctx) {
  const session = getUserbotSession(ctx.from.id);
  return compactHeader('⚙️ <b>SETTINGS USERBOT</b>', session) + '\n\n' +
    preTable([
      ['Anti-PM', plainStatusBadge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK Reply', plainStatusBadge(session?.auto_reply === 1, 'ON', 'OFF')],
      ['Inline Bot', session?.inline_bot_username ? `@${session.inline_bot_username}` : '-'],
    ]);
}

export function getPluginManagerText(ctx) {
  const disabled = getDisabledPlugins(ctx.from.id).map(p => p.toLowerCase());
  const total = loadedPlugins.length;
  const active = loadedPlugins.filter(p => !disabled.includes(p.name.toLowerCase())).length;
  return compactHeader('🧩 <b>PLUGIN MANAGER</b>', getUserbotSession(ctx.from.id)) + '\n\n' +
    preTable([
      ['Total Plugin', total],
      ['Aktif', active],
      ['Nonaktif', Math.max(0, total - active)],
      ['Protected', PROTECTED_PLUGINS.join(', ')],
    ]);
}

export function getRegistrationText() {
  return `🚀 <b>Mulai Userbot</b>\n\nPilih metode login untuk membuat userbot baru.\n\n` +
    preTable([
      ['OTP', 'Nomor HP + kode Telegram'],
      ['QR', 'Scan dari Telegram > Devices'],
    ]);
}

export function getAccessDeniedText() {
  return `🔒 <b>Akses Belum Dibuka</b>\n\nRegistrasi userbot membutuhkan persetujuan owner.\n\n` +
    preTable([
      ['Status', 'Menunggu approval'],
      ['Aksi', 'Ajukan ke Owner'],
    ]);
}

export function getAdminMainText(ctx) {
  const users = getAllRegisteredUsers();
  return compactHeader('👑 <b>ADMIN PANEL</b>', getUserbotSession(ctx.from.id)) + '\n\n' +
    preTable([
      ['Total Userbot', users.length],
      ['Running', userbotManager.clients.size],
      ['Plugin', loadedPlugins.length],
      ['Mode', 'Owner'],
    ]);
}

export function getAdminUserListText(ctx) {
  const users = getAllRegisteredUsers();
  return compactHeader('👥 <b>USERBOT USERS</b>', getUserbotSession(ctx.from.id)) + '\n\n' +
    preTable([
      ['Total User', users.length],
      ['Per Halaman', 5],
      ['Running', userbotManager.clients.size],
    ]);
}

export function getAdminManageUserText(ctx, targetId = ctx.session?.selectedUserToManage) {
  const session = targetId ? getUserbotSession(targetId) : null;
  const isRunning = targetId ? userbotManager.isRunning(targetId) : false;
  return compactHeader('👤 <b>MANAGE USERBOT</b>', getUserbotSession(ctx.from.id)) + '\n\n' +
    preTable([
      ['User ID', targetId || 'Tidak dipilih'],
      ['Status', session ? plainStatusBadge(isRunning, 'Running', 'Stopped') : 'Tidak ditemukan'],
      ['Phone', session?.phone || '-'],
      ['Masa Aktif', session?.expired_at ? stripHtml(daysLeftText(session.expired_at)) : '-'],
    ]);
}

export function getAdminPremiumText(ctx, targetId = ctx.session?.selectedUserToManage) {
  const session = targetId ? getUserbotSession(targetId) : null;
  return compactHeader('⏳ <b>ATUR MASA AKTIF</b>', getUserbotSession(ctx.from.id)) + '\n\n' +
    preTable([
      ['User ID', targetId || 'Tidak dipilih'],
      ['Masa Aktif', session?.expired_at ? stripHtml(daysLeftText(session.expired_at)) : '-'],
    ]);
}

/**
 * Native Telegram Rich Message builders.
 * Design goal: fresh dashboard look, not a 1:1 copy of the old HTML menu.
 */
function richHero(icon, title, subtitle) {
  return `<h1>${icon} ${escapeRichHtml(title)}</h1>` +
    `<blockquote>${escapeRichHtml(subtitle)}</blockquote>`;
}

function richKpis(caption, items) {
  const cells = items.map(([label, value]) =>
    `<td align="center"><b>${escapeRichHtml(label)}</b><br>${escapeRichHtml(stripHtml(value))}</td>`
  ).join('');
  return `<table bordered><caption>${escapeRichHtml(caption)}</caption><tr>${cells}</tr></table>`;
}

function richTable(caption, rows) {
  return `<table bordered striped><caption>${escapeRichHtml(caption)}</caption>` +
    `<tr><th align="center">Menu</th><th align="center">Info</th></tr>` +
    rows.map(([key, value]) => `<tr><td>${escapeRichHtml(key)}</td><td align="center">${escapeRichHtml(stripHtml(value))}</td></tr>`).join('') +
    `</table>`;
}

function richTip(text) {
  return `<details><summary>Catatan</summary><p>${escapeRichHtml(text)}</p></details>`;
}

export function getWelcomeRichHtml(ctx) {
  const telegramId = ctx.from.id;
  const dbSession = getUserbotSession(telegramId);
  const isOwner = Number(telegramId) === Number(config.ownerId);
  const isRunning = userbotManager.isRunning(telegramId);
  const botName = dbSession?.custom_name || ctx.me?.first_name || 'Userbot';
  const firstName = ctx.from.first_name || 'User';
  const serviceStatus = dbSession ? richStatusBadge(isRunning, 'Online', 'Offline') : '🔴 Belum daftar';
  const expiryText = dbSession?.expired_at ? stripHtml(daysLeftText(dbSession.expired_at)) : 'Belum tersedia';

  if (isOwner) {
    const users = getAllRegisteredUsers();
    return richHero('🌐', 'Control Panel', `Selamat datang, ${firstName}. Semua kontrol server dan userbot ada di satu ruang.`) +
      richKpis('Live Overview', [
        ['Userbot', users.length],
        ['Running', userbotManager.clients.size],
        ['Plugin', loadedPlugins.length],
      ]) +
      richTable('Akses Cepat', [
        ['Userbot Pribadi', serviceStatus],
        ['Admin Panel', 'Owner Tools'],
        ['Health', 'Runtime & Service Check'],
      ]) +
      `<p>Pilih tombol utama di bawah untuk mulai mengelola panel.</p>`;
  }

  return richHero('✨', botName, `Halo, ${firstName}. Kelola userbot, plugin, dan otomatisasi dari dashboard baru.`) +
    richKpis('Status Akun', [
      ['Userbot', serviceStatus],
      ['Anti-PM', richStatusBadge(dbSession?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK', richStatusBadge(dbSession?.auto_reply === 1, 'ON', 'OFF')],
    ]) +
    richTable('Detail', [
      ['Telegram ID', telegramId],
      ['Masa Aktif', expiryText],
      ['Inline Bot', dbSession?.inline_bot_username ? `@${dbSession.inline_bot_username}` : 'Belum diset'],
    ]) +
    `<p>Gunakan tombol di bawah untuk membuka fitur utama.</p>`;
}

export function getUbotDashboardRichHtml(ctx) {
  const telegramId = ctx.from.id;
  const session = getUserbotSession(telegramId);
  const isRunning = userbotManager.isRunning(telegramId);
  const botName = session?.custom_name || ctx.me?.first_name || 'Userbot';
  const expiryText = session?.expired_at ? stripHtml(daysLeftText(session.expired_at)) : 'Belum tersedia';

  return richHero('🤖', 'Userbot Dashboard', `${botName} siap dikelola dari satu panel modern.`) +
    richKpis('Kondisi Saat Ini', [
      ['Koneksi', richStatusBadge(isRunning, 'Online', 'Offline')],
      ['Anti-PM', richStatusBadge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK', richStatusBadge(session?.auto_reply === 1, 'ON', 'OFF')],
    ]) +
    richTable('Quick Access', [
      ['Plugin Manager', 'Kelola modul aktif/nonaktif'],
      ['Settings', 'Atur preferensi userbot'],
      ['Masa Aktif', expiryText],
    ]);
}

export function getAdminMainRichHtml(ctx) {
  const users = getAllRegisteredUsers();
  return richHero('👑', 'Admin Command Center', 'Panel owner untuk operasi server, userbot, dan maintenance.') +
    richKpis('Server Snapshot', [
      ['Userbot', users.length],
      ['Running', userbotManager.clients.size],
      ['Plugin', loadedPlugins.length],
    ]) +
    richTable('Admin Tools', [
      ['Userbot Users', 'Manajemen akun terdaftar'],
      ['Health Check', 'Status runtime dan koneksi'],
      ['Backup', 'Database & maintenance tools'],
    ]) +
    richTip('Aksi admin dapat memengaruhi semua userbot. Gunakan dengan hati-hati.');
}

export function getPluginManagerRichHtml(ctx) {
  const disabled = getDisabledPlugins(ctx.from.id).map(p => p.toLowerCase());
  const total = loadedPlugins.length;
  const active = loadedPlugins.filter(p => !disabled.includes(p.name.toLowerCase())).length;
  const inactive = Math.max(0, total - active);

  return richHero('🧩', 'Plugin Studio', 'Aktifkan, nonaktifkan, dan audit modul userbot.') +
    richKpis('Plugin State', [
      ['Total', total],
      ['Aktif', active],
      ['Nonaktif', inactive],
    ]) +
    richTable('Rules', [
      ['Protected', PROTECTED_PLUGINS.join(', ')],
      ['Toggle', 'Tekan nama plugin'],
      ['Scope', 'Per akun userbot'],
    ]) +
    richTip('Plugin protected menjaga fitur inti agar panel tetap bisa dikontrol.');
}

export function getUbotSettingsRichHtml(ctx) {
  const session = getUserbotSession(ctx.from.id);
  return richHero('⚙️', 'Userbot Settings', 'Pusat preferensi untuk identitas dan fitur otomatisasi.') +
    richKpis('Feature Switch', [
      ['Anti-PM', richStatusBadge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK', richStatusBadge(session?.auto_reply === 1, 'ON', 'OFF')],
      ['Session', session ? '✅ Ada' : '🔴 Tidak ada'],
    ]) +
    richTable('Identity', [
      ['Inline Bot', session?.inline_bot_username ? `@${session.inline_bot_username}` : 'Belum diset'],
      ['Danger Zone', 'Hapus sesi permanen'],
    ]) +
    richTip('Danger Zone hanya digunakan jika ingin melepas sesi dari server.');
}

export function getRegistrationRichHtml(ctx) {
  const firstName = ctx.from.first_name || 'User';
  return richHero('🚀', 'Mulai Userbot', `Halo, ${firstName}. Pilih metode login untuk membuat userbot baru.`) +
    richKpis('Login Options', [
      ['OTP', 'Nomor HP'],
      ['QR', 'Scan Device'],
      ['Security', 'Private'],
    ]) +
    richTable('Perbandingan', [
      ['OTP', 'Kode Telegram via aplikasi/SMS'],
      ['QR', 'Scan dari Telegram > Devices'],
      ['Rekomendasi', 'Gunakan akun milik sendiri'],
    ]) +
    richTip('Jangan pernah membagikan OTP, password 2FA, atau session string kepada siapa pun.');
}

export function getAccessDeniedRichHtml(ctx) {
  return richHero('🔒', 'Akses Belum Dibuka', 'Registrasi userbot membutuhkan persetujuan owner.') +
    richTable('Status', [
      ['Akun', ctx.from.id],
      ['Registrasi', 'Menunggu approval'],
      ['Langkah', 'Ajukan permintaan ke owner'],
    ]);
}

export function getStatsRichHtml(ctx) {
  const users = getAllRegisteredUsers();
  return richHero('📊', 'System Analytics', `Ringkasan performa layanan ${ctx.me?.first_name || 'Bot'}.`) +
    richKpis('Metrics', [
      ['Userbot', users.length],
      ['Running', userbotManager.clients.size],
      ['Uptime', `${Math.round(process.uptime() / 60)}m`],
    ]) +
    richTable('Service', [
      ['Plugins', loadedPlugins.length],
      ['Mode', 'Inline Dashboard'],
      ['RAM', 'Disembunyikan'],
    ]);
}

export function getQuickHelpRichHtml(ctx) {
  return richHero('❓', 'Quick Guide', 'Panduan singkat untuk tombol utama dashboard.') +
    richTable('Navigasi', [
      ['Dashboard', 'Kontrol userbot pribadi'],
      ['Plugin Studio', 'Kelola modul'],
      ['Settings', 'Preferensi & identitas'],
      ['Health', 'Cek layanan server'],
    ]) +
    richTip('Kalau panel tidak berubah, kirim /menu ulang untuk membuka dashboard rich terbaru.');
}

export function getDonationRichHtml(ctx) {
  return richHero('💰', 'Support Project', 'Dukungan membantu pengembangan dan maintenance server.') +
    richTable('Channel Donasi', [
      ['e-Wallet', '0821-xxxx-xxxx'],
      ['Transfer Bank', '883xxxxxxx'],
      ['Status', 'Opsional'],
    ]) +
    `<p>Terima kasih sudah mendukung ${ctx.me?.first_name || 'kami'}.</p>`;
}

export function getHealthRichHtml(mongoStatus = 'Unknown') {
  const users = getAllRegisteredUsers();
  const uptimeMinutes = Math.round(process.uptime() / 60);
  const userbotRows = users.slice(0, 10).map(user => {
    const running = userbotManager.isRunning(user.telegram_id) ? '🟢 Running' : '🔴 Stopped';
    return `<tr><td>${escapeRichHtml(user.telegram_id)}</td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? 'active' : 'inactive'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot terdaftar</td></tr>';

  return richHero('🩺', 'Server Health', 'Status runtime, database, dan userbot aktif.') +
    richKpis('Core Status', [
      ['MongoDB', mongoStatus],
      ['Running', userbotManager.clients.size],
      ['Uptime', `${uptimeMinutes}m`],
    ]) +
    richTable('Runtime', [
      ['Node', process.version],
      ['Platform', `${process.platform} ${process.arch}`],
      ['Plugins', loadedPlugins.length],
    ]) +
    `<details><summary>Userbot Snapshot</summary>` +
    `<table bordered striped>` +
    `<tr><th align="center">ID</th><th align="center">Koneksi</th><th align="center">Status</th></tr>` +
    userbotRows +
    `</table>` +
    `</details>`;
}

export function getAdminUserListRichHtml(ctx) {
  const users = getAllRegisteredUsers();
  return richHero('👥', 'Userbot Directory', 'Daftar akun yang terdaftar di server.') +
    richKpis('Directory', [
      ['Total', users.length],
      ['Running', userbotManager.clients.size],
      ['Page Size', 5],
    ]) +
    richTip('Pilih user dari daftar untuk membuka panel manajemen akun.');
}

export function getAdminManageUserRichHtml(ctx, targetId = ctx.session?.selectedUserToManage) {
  const session = targetId ? getUserbotSession(targetId) : null;
  const isRunning = targetId ? userbotManager.isRunning(targetId) : false;
  return richHero('👤', 'User Control', 'Kelola status, masa aktif, dan sesi userbot terpilih.') +
    richTable('Selected User', [
      ['User ID', targetId || 'Tidak dipilih'],
      ['Status', session ? richStatusBadge(isRunning, 'Online', 'Offline') : 'Tidak ditemukan'],
      ['Phone', session?.phone || '-'],
      ['Masa Aktif', session?.expired_at ? stripHtml(daysLeftText(session.expired_at)) : '-'],
    ]);
}

export function getAdminPremiumRichHtml(ctx, targetId = ctx.session?.selectedUserToManage) {
  const session = targetId ? getUserbotSession(targetId) : null;
  return richHero('⏳', 'Premium Duration', 'Tambahkan masa aktif untuk userbot terpilih.') +
    richTable('Current Plan', [
      ['User ID', targetId || 'Tidak dipilih'],
      ['Masa Aktif', session?.expired_at ? stripHtml(daysLeftText(session.expired_at)) : '-'],
      ['Action', 'Pilih durasi dari tombol'],
    ]);
}

export async function sendRichPanel(ctx, html, replyMarkup, fallbackText) {
  try {
    await ctx.replyWithRichMessage(
      { html },
      { reply_markup: replyMarkup }
    );
    try { await ctx.deleteMessage(); } catch (_) {}
    return true;
  } catch (err) {
    console.warn('sendRichMessage panel failed, falling back to HTML panel:', err.message);
    await ctx.editMessageText(fallbackText, { parse_mode: 'HTML', reply_markup: replyMarkup });
    return false;
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
  })
  .text('⚙️ Vars Config', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('manage-vars-conv');
  }).row()
  .text('⚠️ Danger Zone: Hapus Sesi', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n` +
      `───────────────────────\n` +
      `⚠️ <b>KONFIRMASI PENGHAPUSAN SESI</b>\n\n` +
      `Tindakan ini akan mematikan userbot dan menghapus session string dari database.\n\n` +
      `Jika hanya ingin berhenti sementara, gunakan tombol <b>Matikan Userbot</b>, bukan hapus sesi.`,
      { parse_mode: 'HTML', reply_markup: dangerDeleteMenu }
    );
  }).row()
  .text('🔙 Kembali', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendRichPanel(ctx, getUbotDashboardRichHtml(ctx), ubotMainMenu, getUbotDashboardText(ctx));
  });

export const dangerDeleteMenu = new Menu('danger-delete-menu')
  .text('✅ Ya, Hapus Sesi Permanen', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = ctx.from.id;
    if (userbotManager.isRunning(telegramId)) {
      await userbotManager.stopUserbot(telegramId);
    }
    deleteUserbot(telegramId);
    await ctx.editMessageText({ html: `<blockquote><b>✅ BERHASIL</b><br><b>Sesi Anda berhasil dihapus.</b>\nSilakan ketik /start untuk mendaftar kembali.</blockquote>` });
  }).row()
  .text('❌ Batal', async (ctx) => {
    await sendRichPanel(ctx, getUbotSettingsRichHtml(ctx), ubotSettingsMenu, getUbotSettingsText(ctx));
  });

ubotSettingsMenu.register(dangerDeleteMenu);

// --- PLUGIN MANAGER MENU ---
export const pluginManagerMenu = new Menu('plugin-manager-menu')
  .dynamic((ctx, range) => {
    const telegramId = ctx.from.id;
    const disabledPlugins = getDisabledPlugins(telegramId).map(p => p.toLowerCase());
    const { plugins, page, totalPages } = pluginPageItems(ctx);

    for (const pluginName of plugins) {
      const isDisabled = disabledPlugins.includes(pluginName.toLowerCase());
      const label = `${isDisabled ? '🔴' : '🟢'} ${pluginName}`;
      range.text(label, async (ctx) => {
        if (PROTECTED_PLUGINS.includes(pluginName.toLowerCase())) {
          await ctx.answerCallbackQuery('Plugin ini dilindungi.');
          return;
        }
        if (isDisabled) {
          await enablePlugin(telegramId, pluginName);
          await ctx.answerCallbackQuery(`🟢 ${pluginName} diaktifkan`);
        } else {
          await disablePlugin(telegramId, pluginName);
          await ctx.answerCallbackQuery(`🔴 ${pluginName} dinonaktifkan`);
        }
        ctx.menu.update();
      });
      if (range.row) range.row();
    }

    if (totalPages > 1) {
      if (page > 1) {
        range.text('⬅️ Prev', (ctx) => { ctx.session.pluginPage = page - 1; ctx.menu.update(); });
      }
      range.text(`Hal ${page}/${totalPages}`, (ctx) => ctx.answerCallbackQuery(`Halaman ${page}/${totalPages}`));
      if (page < totalPages) {
        range.text('Next ➡️', (ctx) => { ctx.session.pluginPage = page + 1; ctx.menu.update(); });
      }
      range.row();
    }
  })
  .text('🔙 Kembali ke Userbot', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendRichPanel(ctx, getUbotDashboardRichHtml(ctx), ubotMainMenu, getUbotDashboardText(ctx));
  });

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
        await ctx.answerCallbackQuery('Mematikan Userbot...');
        await userbotManager.stopUserbot(telegramId);
        updateUserbotStatus(telegramId, false);
        await ctx.replyWithRichMessage({ html: `<blockquote>🔴 <b>Userbot Anda berhasil dimatikan!</b></blockquote>` });
      } else {
        await ctx.answerCallbackQuery('Menghidupkan Userbot...');
        try {
          await userbotManager.startUserbot(telegramId, session.session_string);
          updateUserbotStatus(telegramId, true);
          await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br>🟢 <b>Userbot Anda berhasil dihidupkan!</b></blockquote>` });
        } catch (err) {
          await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal menghidupkan Userbot: ${err.message}</blockquote>` });
        }
      }
      ctx.menu.update(); 
    }
  ).row()
  .text('🧩 Plugin Manager', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendRichPanel(ctx, getPluginManagerRichHtml(ctx), pluginManagerMenu, getPluginManagerText(ctx));
  })
  .text('⚙️ Settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendRichPanel(ctx, getUbotSettingsRichHtml(ctx), ubotSettingsMenu, getUbotSettingsText(ctx));
  })
  .row()
  .text('📦 Modules', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.viewingHelpModule = null;
    ctx.session.helpPage = 1;
    const { buildHelpMenuRichHtml, helpKeyboard } = await import('../plugins/core/help.js');
    const { helpRegistry } = await import('../../core/pluginRegistry.js');
    const dbSession = getUserbotSession(ctx.from.id);
    const totalPages = Math.max(1, Math.ceil(Object.keys(helpRegistry).length / 6));
    await ctx.replyWithRichMessage(
      { html: buildHelpMenuRichHtml(dbSession, 1, totalPages) },
      { reply_markup: helpKeyboard(1, 'main') }
    );
    try { await ctx.deleteMessage(); } catch (_) {}
  })
  .text('📊 Status', async (ctx) => {
    await ctx.answerCallbackQuery();
    const statusText = getUbotDashboardText(ctx).replace('🤖 <b>USERBOT DASHBOARD</b>', '📊 <b>STATUS USERBOT</b>');
    const statusRich = getUbotDashboardRichHtml(ctx).replace('<h1>🤖', '<h1>📊').replace('Userbot Dashboard', 'Status Userbot');
    await sendRichPanel(ctx, statusRich, ctx.menu, statusText);
  }).row()
  .text('🔙 Beranda', async (ctx) => {
    await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML' });
    ctx.menu.nav('master-main-menu');
  });

ubotMainMenu.register(ubotSettingsMenu);
ubotMainMenu.register(pluginManagerMenu);

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
  .text('🔙 Kembali', async (ctx) => {
    await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML' });
    ctx.menu.nav('master-main-menu');
  });

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
      const freshSession = getUserbotSession(targetId);
      const currentExp = new Date(freshSession?.expired_at || new Date());
      currentExp.setDate(currentExp.getDate() + days);
      updateUserbotFeature(targetId, 'expired_at', currentExp.toISOString());
      ctx.menu.update();
      await ctx.answerCallbackQuery(`Berhasil menambahkan ${days} hari!`);
    };

    range.text('+30 Hari', addDays(30))
         .text('+90 Hari', addDays(90))
         .text('+365 Hari', addDays(365)).row();
  })
  .text('🔙 Kembali', async (ctx) => {
    await ctx.editMessageText(getAdminManageUserText(ctx), { parse_mode: 'HTML' });
    ctx.menu.nav('admin-manage-user-menu');
  });

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
    range.text('⏳ Atur Masa Aktif', async (ctx) => {
      await sendRichPanel(ctx, getAdminPremiumRichHtml(ctx), adminPremiumMenu, getAdminPremiumText(ctx));
    }).row();

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
        await sendRichPanel(ctx, getAdminManageUserRichHtml(ctx, user.telegram_id), adminManageUserMenu, getAdminManageUserText(ctx, user.telegram_id));
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
  .text('🔙 Kembali ke Dashboard', async (ctx) => {
    ctx.session.adminUserListPage = 1; // reset on exit
    await ctx.editMessageText(getAdminMainText(ctx), { parse_mode: 'HTML' });
    ctx.menu.nav('admin-main-menu');
  });

adminUserListMenu.register(adminManageUserMenu);

// --- ADMIN MAIN MENU ---
export const adminMainMenu = new Menu('admin-main-menu')
  .text('👥 Userbot Users', async (ctx) => {
    await sendRichPanel(ctx, getAdminUserListRichHtml(ctx), adminUserListMenu, getAdminUserListText(ctx));
  })
  .row()
  .text('📢 Broadcast', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('admin-broadcast-conv');
  })
  .text('⚙️ System Vars', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('manage-system-vars-conv');
  })
  .row()
  .text('🔄 Restart Semua', async (ctx) => {
    await ctx.answerCallbackQuery('Merestart semua Ubot...');
    await userbotManager.restartAllActive();
    await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br><b>Semua Ubot berhasil direstart.</b></blockquote>` });
  })
  .row()
  .text('🩺 Health', async (ctx) => {
    await ctx.answerCallbackQuery();
    let mongoStatus = '🔴 Disconnected';
    try {
      const mongoose = await import('mongoose');
      mongoStatus = mongoose.default.connection.readyState === 1
        ? `🟢 Connected (${mongoose.default.connection.name})`
        : `🔴 State ${mongoose.default.connection.readyState}`;
    } catch (e) {}
    await sendRichPanel(ctx, getHealthRichHtml(mongoStatus), ctx.menu, '🩺 <b>Health Check</b>');
  })
  .text('📦 Backup', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.replyWithRichMessage({ html: `<blockquote>Command owner tersedia:\n<code>/backup</code> — backup database\n<code>/stats_db</code> — statistik database</blockquote>` });
  })
  .row()
  .text('🔙 Beranda', async (ctx) => {
    await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML' });
    ctx.menu.nav('master-main-menu');
  });

adminMainMenu.register(adminUserListMenu);

// --- MASTER MAIN MENU ---
export const masterMainMenu = new Menu('master-main-menu')
  .dynamic((ctx, range) => {
    if (ctx.session?.infoView) {
      range.text('🔙 Beranda', async (ctx) => {
        ctx.session.infoView = false;
        await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML', reply_markup: ctx.menu });
        ctx.menu.update();
      }).row();
      return;
    }

    const isOwner = Number(ctx.from.id) === Number(config.ownerId);
    const dbSession = getUserbotSession(ctx.from.id);
    const ubotButtonText = dbSession ? '🤖 Userbot Dashboard' : '📝 Daftar Userbot';

    range.text(ubotButtonText, async (ctx) => {
      if (dbSession) {
        await sendRichPanel(ctx, getUbotDashboardRichHtml(ctx), ubotMainMenu, getUbotDashboardText(ctx));
      } else {
        await sendRichPanel(ctx, getRegistrationRichHtml(ctx), registrationMenu, getRegistrationText());
      }
    }).row();

    range.text('📦 Modules / Help', async (ctx) => {
      await ctx.answerCallbackQuery();
      ctx.session.viewingHelpModule = null;
      ctx.session.helpPage = 1;
      const { buildHelpMenuRichHtml, helpKeyboard } = await import('../plugins/core/help.js');
      const { helpRegistry } = await import('../../core/pluginRegistry.js');
      const totalPages = Math.max(1, Math.ceil(Object.keys(helpRegistry).length / 6));
      await ctx.replyWithRichMessage(
        { html: buildHelpMenuRichHtml(dbSession, 1, totalPages) },
        { reply_markup: helpKeyboard(1, 'main') }
      );
      try { await ctx.deleteMessage(); } catch (_) {}
    })
    .text('📊 Statistik', async (ctx) => {
      await ctx.answerCallbackQuery();
      const text = `${brandHeader('📊 <b>STATISTIK SISTEM</b>', dbSession)}\n\n` +
        `<pre>Item           Status\n${buildStatsBlock()}</pre>`;
      ctx.session.infoView = true;
      await sendRichPanel(ctx, getStatsRichHtml(ctx), ctx.menu, text);
    }).row()
    .text('❓ Bantuan', async (ctx) => {
      await ctx.answerCallbackQuery();
      const text = `${brandHeader('❓ <b>BANTUAN CEPAT</b>', dbSession)}\n\n` +
        `Ringkasan fungsi tombol utama.\n\n` +
        `<pre>Dashboard  hidup/matikan userbot\nPlugin     enable/disable modul\nSettings   Anti-PM, AFK, nama, token\nModules    dokumentasi command</pre>`;
      ctx.session.infoView = true;
      await sendRichPanel(ctx, getQuickHelpRichHtml(ctx), ctx.menu, text);
    })
    .text('💰 Donasi', async (ctx) => {
      await ctx.answerCallbackQuery();
      const text = `${brandHeader('💰 <b>DONASI & DUKUNGAN</b>', dbSession)}\n\n` +
        `Terima kasih kalau ingin mendukung pengembangan.\n\n` +
        `<pre>e-Wallet       0821-xxxx-xxxx\nTransfer Bank 883xxxxxxx</pre>`;
      ctx.session.infoView = true;
      await sendRichPanel(ctx, getDonationRichHtml(ctx), ctx.menu, text);
    }).row();

    if (isOwner) {
      range.text('👑 Admin Panel', async (ctx) => {
        await sendRichPanel(ctx, getAdminMainRichHtml(ctx), adminMainMenu, getAdminMainText(ctx));
      }).row();
    }
  });

masterMainMenu.register(ubotMainMenu);
masterMainMenu.register(registrationMenu);
masterMainMenu.register(adminMainMenu);

// Import and register inlineHelpMenu so we can navigate to it
import { inlineHelpMenu } from '../plugins/core/help.js';
masterMainMenu.register(inlineHelpMenu);
