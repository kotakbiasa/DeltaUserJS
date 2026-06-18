import config from '../config.js';
import {
  getUserbotSession,
  getAllRegisteredUsers,
  getDisabledPlugins,
} from '../database/db.js';
import userbotManager from '../userbot/manager.js';
import { loadedPlugins } from '../userbot/pluginRegistry.js';

const PROTECTED_PLUGINS = ['admin', 'pluginmanager'];
const PLUGINS_PER_PAGE = 8;

function normalizedDisabled(telegramId) {
  return getDisabledPlugins(telegramId).map(name => String(name).toLowerCase());
}

function sortedPlugins() {
  return [...loadedPlugins].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function pluginPageInfo(page = 1) {
  const plugins = sortedPlugins();
  const totalPages = Math.max(1, Math.ceil(plugins.length / PLUGINS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * PLUGINS_PER_PAGE;
  return { plugins: plugins.slice(start, start + PLUGINS_PER_PAGE), page: currentPage, totalPages, total: plugins.length };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '');
}

function daysLeftText(dateValue) {
  if (!dateValue) return 'Belum tersedia';
  const expDate = new Date(dateValue);
  const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
  return diffDays > 0
    ? `${expDate.toLocaleDateString()} · ${diffDays} hari lagi`
    : `${expDate.toLocaleDateString()} · kedaluwarsa`;
}

function badge(condition, yes = 'Online', no = 'Offline') {
  return condition ? `✓ ${yes}` : `— ${no}`;
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

export function hero(icon, title, subtitle) {
  return `<h1>${icon} ${escapeHtml(title)}</h1>` +
    `<blockquote>${escapeHtml(subtitle)}</blockquote>`;
}

export function kpi(caption, items) {
  return `<table bordered><caption>${escapeHtml(caption)}</caption><tr>` +
    items.map(([label, value]) =>
      `<td align="center"><b>${escapeHtml(label)}</b><br>${escapeHtml(stripHtml(value))}</td>`
    ).join('') +
    `</tr></table>`;
}

export function table(caption, rows, firstHeader = 'Area', secondHeader = 'Detail') {
  return `<table bordered striped><caption>${escapeHtml(caption)}</caption>` +
    `<tr><th align="center">${escapeHtml(firstHeader)}</th><th align="center">${escapeHtml(secondHeader)}</th></tr>` +
    rows.map(([key, value]) =>
      `<tr><td>${escapeHtml(key)}</td><td align="center">${escapeHtml(stripHtml(value))}</td></tr>`
    ).join('') +
    `</table>`;
}

export function note(text, title = 'Catatan') {
  return `<details><summary>${escapeHtml(title)}</summary><p>${escapeHtml(text)}</p></details>`;
}
function pluginStatusTable(caption, plugins, disabledSet) {
  const rows = plugins.map(plugin => {
    const name = String(plugin.name);
    const lower = name.toLowerCase();
    const isActive = !disabledSet.has(lower);
    const isProtected = PROTECTED_PLUGINS.includes(lower);
    return `<tr>` +
      `<td>${escapeHtml(name)}</td>` +
      `<td align="center">${isActive ? 'Aktif' : 'Nonaktif'}</td>` +
      `<td align="center">${isProtected ? 'Protected' : '—'}</td>` +
      `</tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Tidak ada plugin</td></tr>';

  return `<table bordered striped>` +
    `<caption>${escapeHtml(caption)}</caption>` +
    `<tr><th align="left">Plugin</th><th align="center">Status</th><th align="center">Guard</th></tr>` +
    rows +
    `</table>`;
}


export function isOwner(ctx) {
  return Number(ctx.from?.id) === Number(config.ownerId);
}

export function panelMain(ctx) {
  const telegramId = ctx.from.id;
  const session = getUserbotSession(telegramId);
  const owner = isOwner(ctx);
  const running = userbotManager.isRunning(telegramId);
  const users = getAllRegisteredUsers();
  const firstName = ctx.from.first_name || 'User';

  if (owner) {
    return hero('🌐', 'Delta Control', `Selamat datang, ${firstName}. Dashboard pusat untuk server dan semua userbot.`) +
      kpi('Live Overview', [
        ['Userbot', users.length],
        ['Running', userbotManager.clients.size],
        ['Plugins', loadedPlugins.length],
      ]) +
      table('Command Hub', [
        ['Userbot Saya', session ? badge(running, 'Online', 'Offline') : 'Belum daftar'],
        ['Admin Panel', 'Owner tools & maintenance'],
        ['Health', 'Runtime, DB, dan service check'],
      ]);
  }

  return hero('✨', session?.custom_name || 'DeltaUbotJS', `Halo, ${firstName}. Dashboard baru untuk userbot, plugin, dan otomatisasi.`) +
    kpi('Account State', [
      ['Userbot', session ? badge(running, 'Online', 'Offline') : 'Belum daftar'],
      ['Anti-PM', badge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK', badge(session?.auto_reply === 1, 'ON', 'OFF')],
    ]) +
    table('Profile', [
      ['Telegram ID', telegramId],
      ['Masa Aktif', daysLeftText(session?.expired_at)],
      ['Inline Bot', session?.inline_bot_username ? `@${session.inline_bot_username}` : 'Belum diset'],
    ]);
}

export function panelUserbot(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const running = userbotManager.isRunning(ctx.from.id);
  return hero('🤖', 'Userbot Dashboard', `${session?.custom_name || 'DeltaUbotJS'} siap dikelola dari panel modern.`) +
    kpi('Current State', [
      ['Koneksi', badge(running, 'Online', 'Offline')],
      ['Anti-PM', badge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK', badge(session?.auto_reply === 1, 'ON', 'OFF')],
    ]) +
    table('Quick Actions', [
      ['Plugin Studio', 'Aktif/nonaktifkan modul'],
      ['Settings', 'Preferensi & identitas'],
      ['Masa Aktif', daysLeftText(session?.expired_at)],
    ]);
}

export function panelPlugins(ctx, page = 1, notice = '') {
  const disabled = normalizedDisabled(ctx.from.id);
  const disabledSet = new Set(disabled);
  const { plugins, page: currentPage, totalPages, total } = pluginPageInfo(page);
  const active = sortedPlugins().filter(p => !disabledSet.has(String(p.name).toLowerCase())).length;
  return hero('🧩', 'Plugin Studio', notice || 'Kelola modul userbot langsung dari dashboard utama.') +
    kpi('Plugin State', [
      ['Total', total],
      ['Aktif', active],
      ['Nonaktif', Math.max(0, total - active)],
    ]) +
    pluginStatusTable(`Plugin List · Page ${currentPage}/${totalPages}`, plugins, disabledSet) +
    note('Tabel daftar plugin. Tekan tombol di bawah untuk menyalakan/mematikan plugin. Plugin protected tidak bisa dimatikan.');
}

export function panelSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  return hero('⚙️', 'Settings Center', 'Pusat preferensi userbot dan identitas panel.') +
    kpi('Feature Switch', [
      ['Anti-PM', badge(session?.anti_pm === 1, 'ON', 'OFF')],
      ['AFK', badge(session?.auto_reply === 1, 'ON', 'OFF')],
      ['Session', session ? '✅ Ada' : '🔴 Tidak ada'],
    ]) +
    table('Identity', [
      ['Inline Bot', session?.inline_bot_username ? `@${session.inline_bot_username}` : 'Belum diset'],
      ['Danger Zone', 'Hapus sesi permanen'],
    ]);
}

export function panelRegister(ctx) {
  return hero('🚀', 'Mulai DeltaUbot', `Halo, ${ctx.from.first_name || 'User'}. Pilih metode login yang paling nyaman.`) +
    kpi('Login Options', [
      ['OTP', 'Nomor HP'],
      ['QR', 'Scan Device'],
      ['Security', 'Private'],
    ]) +
    table('Perbandingan', [
      ['OTP', 'Kode Telegram via aplikasi/SMS'],
      ['QR', 'Scan dari Telegram > Devices'],
      ['Rekomendasi', 'Gunakan akun milik sendiri'],
    ]) +
    note('Jangan bagikan OTP, password 2FA, atau session string kepada siapa pun.', 'Keamanan');
}

export function panelAccessDenied(ctx) {
  return hero('🔒', 'Akses Belum Dibuka', 'Registrasi userbot membutuhkan persetujuan owner.') +
    table('Status Registrasi', [
      ['Akun', ctx.from.id],
      ['Status', 'Menunggu approval'],
      ['Langkah', 'Ajukan permintaan ke owner'],
    ]);
}

export function panelAdmin(ctx) {
  const users = getAllRegisteredUsers();
  return hero('👑', 'Admin Command Center', 'Panel owner untuk operasi server, userbot, dan maintenance.') +
    kpi('Server Snapshot', [
      ['Userbot', users.length],
      ['Running', userbotManager.clients.size],
      ['Plugins', loadedPlugins.length],
    ]) +
    table('Owner Tools', [
      ['User Directory', 'Manajemen akun terdaftar'],
      ['Health', 'Runtime & database status'],
      ['Backup', 'Export data dan maintenance'],
    ]) +
    note('Aksi admin dapat memengaruhi semua userbot. Gunakan dengan hati-hati.');
}

export function panelStats(ctx) {
  const users = getAllRegisteredUsers();
  return hero('📊', 'System Analytics', 'Ringkasan performa layanan DeltaUbotJS.') +
    kpi('Metrics', [
      ['Userbot', users.length],
      ['Running', userbotManager.clients.size],
      ['Uptime', `${Math.round(process.uptime() / 60)}m`],
    ]) +
    table('Service', [
      ['Plugins', loadedPlugins.length],
      ['Mode', 'Modern Dashboard'],
      ['RAM', 'Disembunyikan'],
    ]);
}

export function panelQuickHelp(ctx) {
  return hero('❓', 'Quick Guide', 'Panduan singkat navigasi dashboard baru.') +
    table('Navigasi', [
      ['Dashboard', 'Kontrol userbot pribadi'],
      ['Plugin Studio', 'Ringkasan modul'],
      ['Settings', 'Preferensi & identitas'],
      ['Health', 'Cek layanan server'],
    ]) +
    note('Jika pesan lama masih terlihat, kirim /menu baru agar bot memperbarui tampilan panel utama.');
}

export function panelDonate(ctx) {
  return hero('💰', 'Support Project', 'Dukungan membantu pengembangan dan maintenance server.') +
    table('Channel Donasi', [
      ['e-Wallet', '0821-xxxx-xxxx'],
      ['Transfer Bank', '883xxxxxxx'],
      ['Status', 'Opsional'],
    ]);
}

export function panelHealth(mongoStatus = 'Unknown') {
  const users = getAllRegisteredUsers();
  const rows = users.slice(0, 10).map(user => {
    const running = userbotManager.isRunning(user.telegram_id) ? '🟢 Running' : '🔴 Stopped';
    return `<tr><td>${escapeHtml(user.telegram_id)}</td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? 'active' : 'inactive'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot terdaftar</td></tr>';

  return hero('🩺', 'Server Health', 'Status runtime, database, dan userbot aktif.') +
    kpi('Core Status', [
      ['MongoDB', mongoStatus],
      ['Running', userbotManager.clients.size],
      ['Uptime', `${Math.round(process.uptime() / 60)}m`],
    ]) +
    table('Runtime', [
      ['Node', process.version],
      ['Platform', `${process.platform} ${process.arch}`],
      ['Plugins', loadedPlugins.length],
    ]) +
    `<details><summary>Userbot Snapshot</summary>` +
    `<table bordered striped>` +
    `<tr><th align="center">ID</th><th align="center">Koneksi</th><th align="center">Status</th></tr>` +
    rows +
    `</table>` +
    `</details>`;
}

export function keyboardMain(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const rows = [
    [session
      ? { text: '🤖 Userbot Dashboard', callback_data: 'rich:ubot', style: 'primary' }
      : { text: '🚀 Mulai DeltaUbot', callback_data: 'rich:register', style: 'success' }],
    [
      { text: '📦 Modules', callback_data: 'rich:help_main' },
      { text: '📊 Analytics', callback_data: 'rich:stats' },
    ],
    [
      { text: '❓ Guide', callback_data: 'rich:guide' },
      { text: '💰 Support', callback_data: 'rich:donate' },
    ],
  ];
  if (isOwner(ctx)) rows.push([{ text: '👑 Admin Command Center', callback_data: 'rich:admin', style: 'success' }]);
  return { inline_keyboard: rows };
}

export function keyboardUserbot(ctx) {
  const isRunning = userbotManager.isRunning(ctx.from.id);
  return { inline_keyboard: [
    [{ text: isRunning ? '🔌 Matikan Userbot' : '⚡ Hidupkan Userbot', callback_data: 'rich:toggle_power' }],
    [{ text: '🧩 Plugin Studio', callback_data: 'rich:plugin_page:1' }, { text: '⚙️ Settings', callback_data: 'rich:settings' }],
    [{ text: '🔙 Dashboard Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardPluginStudio(ctx, page = 1) {
  const disabled = normalizedDisabled(ctx.from.id);
  const disabledSet = new Set(disabled);
  const { plugins, page: currentPage, totalPages } = pluginPageInfo(page);
  const rows = plugins.map(plugin => {
    const name = String(plugin.name);
    const lower = name.toLowerCase();
    const isDisabled = disabledSet.has(lower);
    const protectedPlugin = PROTECTED_PLUGINS.includes(lower);
    const action = isDisabled ? 'Aktifkan' : 'Nonaktifkan';
    const label = protectedPlugin ? `${name} · protected` : `${action} ${name}`;
    return [{ text: label, callback_data: `rich:plugin_toggle:${encodeURIComponent(lower)}:${currentPage}` }];
  });

  const nav = [];
  if (currentPage > 1) nav.push({ text: '⬅️ Prev', callback_data: `rich:plugin_page:${currentPage - 1}` });
  nav.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: `rich:plugin_page:${currentPage}` });
  if (currentPage < totalPages) nav.push({ text: 'Next ➡️', callback_data: `rich:plugin_page:${currentPage + 1}` });
  rows.push(nav);
  rows.push([{ text: '🔙 Userbot Dashboard', callback_data: 'rich:ubot' }]);
  return { inline_keyboard: rows };
}


export function keyboardSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;

  return { inline_keyboard: [
    [{ text: isAntiPm ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF', callback_data: 'rich:toggle_anti_pm' }],
    [{ text: isAfk ? '🤖 Auto-Reply (AFK): 🟢 ON' : '🤖 Auto-Reply (AFK): 🔴 OFF', callback_data: 'rich:toggle_afk' }],
    [{ text: '📝 Ubah Pesan AFK', callback_data: 'rich:edit_afk' }, { text: '🤖 Set Token Bot', callback_data: 'rich:edit_bot_token' }],
    [{ text: '⚠️ Danger Zone: Hapus Sesi', callback_data: 'rich:danger_delete_session' }],
    [{ text: '🔙 Kembali', callback_data: 'rich:ubot' }],
  ] };
}

export function keyboardDangerDelete() {
  return { inline_keyboard: [
    [{ text: '🗑️ Ya, Hapus Sesi Ini', callback_data: 'rich:confirm_delete_session' }],
    [{ text: '❌ Batal', callback_data: 'rich:settings' }],
  ] };
}

export function keyboardRegister() {
  return { inline_keyboard: [
    [{ text: '📱 Login via OTP', callback_data: 'rich:otp', style: 'success' }, { text: '🔍 Scan QR', callback_data: 'rich:qr', style: 'success' }],
    [{ text: '🔙 Dashboard', callback_data: 'rich:main' }],
  ] };
}

export function keyboardAdmin() {
  return { inline_keyboard: [
    [{ text: '👥 User Directory', callback_data: 'rich:admin_users' }],
    [{ text: '📢 Broadcast', callback_data: 'rich:broadcast' }, { text: '🩺 Health', callback_data: 'rich:health' }],
    [{ text: '📦 Backup', callback_data: 'rich:backup' }],
    [{ text: '🔙 Dashboard', callback_data: 'rich:main' }],
  ] };
}

export function keyboardBack(target = 'main') {
  return { inline_keyboard: [[{ text: '🔙 Back', callback_data: `rich:${target}` }]] };
}
