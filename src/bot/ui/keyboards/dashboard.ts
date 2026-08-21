/**
 * DeltaUbotJS — Dashboard (UI builders + rich handlers)
 * Redesigned layout — cleaner panels, organized keyboards, consistent navigation.
 */
import { Api } from 'teleproto';
import config from '../../../config.js';
import { replyRich, escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import {
  getUserbotSession,
  getAllRegisteredUsers,
  getDisabledPlugins,
  updateUserbotStatus,
  disablePlugin,
  enablePlugin,
  deleteUserbot,
  updateUserbotFeature,
  hasClaimedTrial,
  setTrialClaimed,
} from '../../../infrastructure/database.js';
import { systemConfigCache } from '../../../infrastructure/dbCore.js';
import { loadedPlugins } from '../../../userbot/engine/pluginRegistry.js';
import userbotManager from '../../../userbot/engine/manager.js';

// ==========================================================================
// SECTION 1 — UI BUILDERS
// ==========================================================================

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

function daysLeftText(dateValue: string | Date | undefined | null) {
  // null expired_at = never expires (owner)
  if (dateValue === null || dateValue === undefined || dateValue === '') {return '♾️ Unlimited';}
  const expDate = new Date(dateValue);
  if (Number.isNaN(expDate.getTime())) {return '♾️ Unlimited';}
  const diffDays = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diffDays > 0
    ? `${expDate.toLocaleDateString()} · ${diffDays} hari lagi`
    : `${expDate.toLocaleDateString()} · kedaluwarsa`;
}

function badge(condition, yes = '✅', no = '❌') {
  return condition ? yes : no;
}

// --- Panel builders ---

export function isOwner(ctx) {
  return Number(ctx.from?.id) === Number(config.ownerId);
}

function userInfo(ctx) {
  const firstName = ctx.from?.first_name || 'User';
  const botName = ctx.me?.first_name || 'Bot';
  return { firstName, botName };
}

export function panelMain(ctx) {
  const { firstName, botName } = userInfo(ctx);
  const session = getUserbotSession(ctx.from.id);
  const running = session && userbotManager.isRunning(ctx.from.id);
  const statusBadge = !session ? '🔴 Belum terdaftar' : (running ? '🟢 Aktif' : '🟡 Mati');

  return `<h1>👋 Selamat Datang!</h1>` +
    `<blockquote>Halo <b>${escapeHtml(firstName)}</b>! Saya <b>${escapeHtml(botName)}</b>, manajer untuk mengelola userbot Telegram Anda.</blockquote>` +
    `<table bordered striped><caption>📌 Status Akun</caption>` +
    `<tr><th>Item</th><th>Detail</th></tr>` +
    `<tr><td>Status Userbot</td><td align="center">${statusBadge}</td></tr>` +
    `<tr><td>Masa Aktif</td><td align="center">${daysLeftText(session?.expired_at)}</td></tr>` +
    `</table>` +
    `<p>Gunakan tombol di bawah untuk navigasi.</p>`;
}

export function panelMenuList(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const hasBot = !!session;
  const running = hasBot && userbotManager.isRunning(ctx.from.id);

  let statusLine;
  if (!hasBot) {
    statusLine = '🔴 Belum terdaftar';
  } else if (running) {
    statusLine = '🟢 Bot aktif & berjalan';
  } else {
    statusLine = '🟡 Terdaftar, bot mati';
  }

  return `<h1>🎛️ Panel Menu</h1>` +
    `<blockquote>Status: <b>${statusLine}</b></blockquote>` +
    `<table bordered striped><caption>📋 Menu Tersedia</caption>` +
    `<tr><th>Menu</th><th>Fungsi</th></tr>` +
    (hasBot
      ? `<tr><td>🤖 Panel Userbot</td><td>Kontrol & status userbot</td></tr>` +
        `<tr><td>🧩 Plugin Studio</td><td>Kelola modul aktif</td></tr>` +
        `<tr><td>⚙️ Settings</td><td>Anti-PM, AFK, identity</td></tr>`
      : `<tr><td>🚀 Register</td><td>Daftarkan userbot baru</td></tr>`) +
    (isOwner(ctx)
      ? `<tr><td>👑 Panel Admin</td><td>Operasi owner & maintenance</td></tr>`
      : '') +
    `</table>` +
    `<p>Pilih menu di bawah untuk mengelola userbot Anda.</p>`;
}

export function panelUserbot(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const running = userbotManager.isRunning(ctx.from.id);
  const botName = session?.custom_name || ctx.me?.first_name || 'Bot';

  const featureRows = [
    ['Koneksi', running ? '🟢 Online' : '🔴 Offline'],
    ['Anti-PM', badge(session?.anti_pm === 1, '🟢 ON', '🔴 OFF')],
    ['AFK / Auto-Reply', badge(session?.auto_reply === 1, '🟢 ON', '🔴 OFF')],
  ];

  const sessionRows = [
    ['ID Akun', `<code>${ctx.from.id}</code>`],
    ['Telepon', session?.phone ? `<tg-spoiler><code>+${session.phone}</code></tg-spoiler>` : 'Disembunyikan'],
    ['Masa Aktif', daysLeftText(session?.expired_at)],
    ['Inline Bot', session?.inline_bot_username ? `@${session.inline_bot_username}` : 'Belum diset'],
  ];

  return `<h1>🤖 Dashboard ${escapeHtml(botName)}</h1>` +
    `<blockquote>Panel kendali untuk sesi userbot Anda.</blockquote>` +
    `<table bordered striped><caption>📊 Status</caption>` +
    `<tr><th>Fitur</th><th>Status</th></tr>` +
    featureRows.map(([k, v]) => `<tr><td>${k}</td><td align="center">${v}</td></tr>`).join('') +
    `</table>` +
    `<table bordered striped><caption>ℹ️ Info Sesi</caption>` +
    `<tr><th>Detail</th><th>Nilai</th></tr>` +
    sessionRows.map(([k, v]) => `<tr><td>${k}</td><td align="center">${v}</td></tr>`).join('') +
    `</table>`;
}

export function panelPlugins(ctx, page = 1, notice = '') {
  const disabled = normalizedDisabled(ctx.from.id);
  const disabledSet = new Set(disabled);
  const { plugins, page: currentPage, totalPages, total } = pluginPageInfo(page);
  const active = sortedPlugins().filter(p => !disabledSet.has(String(p.name).toLowerCase())).length;

  const rows = plugins.map(plugin => {
    const name = String(plugin.name);
    const lower = name.toLowerCase();
    const isActive = !disabledSet.has(lower);
    const isProtected = PROTECTED_PLUGINS.includes(lower);
    return `<tr><td>${escapeHtml(name)}</td><td align="center">${isActive ? '✅ Aktif' : '❌ Nonaktif'}</td><td align="center">${isProtected ? '🔒' : '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Tidak ada plugin</td></tr>';

  return `<h1>🧩 Plugin Studio</h1>` +
    (notice ? `<blockquote>${escapeHtml(notice)}</blockquote>` : '<blockquote>Kelola modul bot Anda.</blockquote>') +
    `<table bordered striped><caption>📊 Statistik</caption><tr>` +
    `<td align="center"><b>Total</b><br>${total}</td>` +
    `<td align="center"><b>✅ Aktif</b><br>${active}</td>` +
    `<td align="center"><b>❌ Nonaktif</b><br>${Math.max(0, total - active)}</td>` +
    `</tr></table>` +
    `<table bordered striped><caption>📋 Plugin · Hal ${currentPage}/${totalPages}</caption>` +
    `<tr><th>Plugin</th><th>Status</th><th>Guard</th></tr>` +
    rows +
    `</table>` +
    `<p>🔒 = protected (tidak bisa dinonaktifkan)</p>`;
}

export function panelSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const afkReason = session?.afk_reason || 'AFK (default)';
  return `<h1>⚙️ Settings</h1>` +
    `<blockquote>Atur preferensi bot dan identitas.</blockquote>` +
    `<table bordered striped><caption>🔀 Feature Switch</caption><tr>` +
    `<td align="center"><b>🚫 Anti-PM</b><br>${badge(session?.anti_pm === 1, '🟢 ON', '🔴 OFF')}</td>` +
    `<td align="center"><b>🤖 AFK</b><br>${badge(session?.auto_reply === 1, '🟢 ON', '🔴 OFF')}</td>` +
    `<td align="center"><b>📦 Sesi</b><br>${session ? '✅ Ada' : '🔴 Tidak ada'}</td>` +
    `</tr></table>` +
    `<table bordered striped><caption>🆔 Identity</caption>` +
    `<tr><th>Item</th><th>Detail</th></tr>` +
    `<tr><td>Nama Bot</td><td align="center">${escapeHtml(session?.custom_name || '—')}</td></tr>` +
    `<tr><td>Inline Bot</td><td align="center">${session?.inline_bot_username ? `@${session.inline_bot_username}` : 'Belum diset'}</td></tr>` +
    `<tr><td>💬 AFK Reason</td><td align="center"><tg-spoiler><code>${escapeHtml(afkReason)}</code></tg-spoiler></td></tr>` +
    `</table>`;
}

export function panelRegister(ctx) {
  return `<h1>🚀 Pilih Metode Login</h1>` +
    `<blockquote>Halo, ${escapeHtml(ctx.from.first_name || 'User')}. Pilih metode login yang paling nyaman.</blockquote>` +
    `<table bordered striped><caption>📋 Perbandingan</caption>` +
    `<tr><th>Metode</th><th>Detail</th></tr>` +
    `<tr><td>📱 OTP</td><td>Kode Telegram via aplikasi/SMS</td></tr>` +
    `<tr><td>🔍 QR</td><td>Scan dari Telegram > Devices</td></tr>` +
    `</table>` +
    `<blockquote>⚠️ <b>Peringatan:</b> Jangan bagikan OTP, password 2FA, atau session string kepada siapa pun.</blockquote>`;
}

function getSystemVarValue(key: string, fallback: string): string {
  return String((systemConfigCache.vars as Record<string, unknown>)?.[key] ?? '') || fallback;
}
function getSystemVarNum(key: string, fallback: number): number {
  return Number((systemConfigCache.vars as Record<string, unknown>)?.[key]) || fallback;
}

export function panelSubscription(_ctx) {
  const premiumDays = getSystemVarNum('SUBSCRIPTION_DAYS', 30);
  const trialDays = getSystemVarNum('TRIAL_DAYS', 7);
  return `<h1>💎 Pilih Paket Langganan</h1>` +
    `<blockquote>Dapatkan akses penuh ke fitur premium.</blockquote>` +
    `<table bordered striped><caption>📋 Paket</caption>` +
    `<tr><th>Paket</th><th>Durasi</th></tr>` +
    `<tr><td>🎁 Coba Gratis</td><td align="center">${trialDays} Hari (1x klaim)</td></tr>` +
    `<tr><td>💎 Premium</td><td align="center">${premiumDays} Hari — Soon</td></tr>` +
    `</table>`;
}

export function panelAccessDenied(ctx) {
  return `<h1>🔒 Akses Belum Dibuka</h1>` +
    `<blockquote>Registrasi bot membutuhkan persetujuan owner.</blockquote>` +
    `<table bordered striped><caption>📋 Status</caption>` +
    `<tr><th>Item</th><th>Detail</th></tr>` +
    `<tr><td>Akun</td><td align="center"><code>${ctx.from.id}</code></td></tr>` +
    `<tr><td>Status</td><td align="center">🕐 Menunggu approval</td></tr>` +
    `</table>`;
}

export function panelAdmin(_ctx) {
  const users = getAllRegisteredUsers();
  const running = userbotManager.clients.size;
  const activeCount = users.filter(u => u.is_active === 1).length;
  return `<h1>👑 Admin Command Center</h1>` +
    `<blockquote>Panel owner untuk operasi server dan maintenance.</blockquote>` +
    `<table bordered striped><caption>📊 Snapshot</caption><tr>` +
    `<td align="center"><b>👥 User</b><br>${users.length}</td>` +
    `<td align="center"><b>✅ Aktif</b><br>${activeCount}</td>` +
    `<td align="center"><b>⚡ Running</b><br>${running}</td>` +
    `<td align="center"><b>🧩 Plugins</b><br>${loadedPlugins.length}</td>` +
    `</tr></table>`;
}

export function panelStats(_ctx) {
  const users = getAllRegisteredUsers();
  const running = userbotManager.clients.size;
  const mem = process.memoryUsage();
  return `<h1>📊 System Analytics</h1>` +
    `<blockquote>Ringkasan performa layanan.</blockquote>` +
    `<table bordered striped><caption>📊 Metrics</caption><tr>` +
    `<td align="center"><b>👥 User</b><br>${users.length}</td>` +
    `<td align="center"><b>⚡ Running</b><br>${running}</td>` +
    `<td align="center"><b>⏱ Uptime</b><br>${Math.round(process.uptime() / 60)}m</td>` +
    `</tr></table>` +
    `<table bordered striped><caption>💾 Memory</caption>` +
    `<tr><th>Item</th><th>Detail</th></tr>` +
    `<tr><td>RSS</td><td align="center">${formatBytesRef(mem.rss)}</td></tr>` +
    `<tr><td>Heap</td><td align="center">${formatBytesRef(mem.heapUsed)} / ${formatBytesRef(mem.heapTotal)}</td></tr>` +
    `</table>`;
}

export function panelQuickHelp(_ctx) {
  return `<h1>❓ Quick Guide</h1>` +
    `<blockquote>Panduan singkat navigasi dashboard.</blockquote>` +
    `<table bordered striped><caption>📋 Navigasi</caption>` +
    `<tr><th>Menu</th><th>Fungsi</th></tr>` +
    `<tr><td>🤖 Dashboard</td><td>Kontrol userbot pribadi</td></tr>` +
    `<tr><td>🧩 Plugin Studio</td><td>Kelola modul</td></tr>` +
    `<tr><td>⚙️ Settings</td><td>Preferensi & identitas</td></tr>` +
    `<tr><td>🩺 Health</td><td>Cek layanan server</td></tr>` +
    `</table>`;
}

export function panelDonate(_ctx) {
  const ewallet = getSystemVarValue('DONATE_EWALLET', '');
  const bank = getSystemVarValue('DONATE_BANK', '');
  const ewalletName = getSystemVarValue('DONATE_EWALLET_NAME', 'e-Wallet');
  const bankName = getSystemVarValue('DONATE_BANK_NAME', 'Transfer Bank');

  const ewalletCell = ewallet ? `<tg-spoiler><code>${ewallet}</code></tg-spoiler>` : '<i>Belum diset</i>';
  const bankCell = bank ? `<tg-spoiler><code>${bank}</code></tg-spoiler>` : '<i>Belum diset</i>';

  return `<h1>💰 Support Project</h1>` +
    `<blockquote>Dukungan membantu pengembangan dan maintenance server. Nomor tersembunyi — tap untuk melihat.</blockquote>` +
    `<table bordered striped><caption>💳 Channel Donasi</caption>` +
    `<tr><th>Metode</th><th>Detail</th></tr>` +
    `<tr><td>${escapeHtml(ewalletName)}</td><td align="center">${ewalletCell}</td></tr>` +
    `<tr><td>${escapeHtml(bankName)}</td><td align="center">${bankCell}</td></tr>` +
    `</table>`;
}

export function panelHealth(mongoStatus = 'Unknown') {
  const users = getAllRegisteredUsers();
  const rows = users.slice(0, 10).map(user => {
    const running = userbotManager.isRunning(user.telegram_id) ? '🟢' : '🔴';
    return `<tr><td>${escapeHtml(user.telegram_id)}</td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? '✅ active' : '❌ inactive'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot</td></tr>';

  return `<h1>🩺 Server Health</h1>` +
    `<blockquote>Status runtime, database, dan userbot aktif.</blockquote>` +
    `<table bordered striped><caption>📊 Core</caption><tr>` +
    `<td align="center"><b>🍃 MongoDB</b><br>${mongoStatus}</td>` +
    `<td align="center"><b>⚡ Running</b><br>${userbotManager.clients.size}</td>` +
    `<td align="center"><b>⏱ Uptime</b><br>${Math.round(process.uptime() / 60)}m</td>` +
    `</tr></table>` +
    `<table bordered striped><caption>⚙️ Runtime</caption>` +
    `<tr><th>Item</th><th>Detail</th></tr>` +
    `<tr><td>Node</td><td align="center">${process.version}</td></tr>` +
    `<tr><td>Platform</td><td align="center">${process.platform} ${process.arch}</td></tr>` +
    `<tr><td>Plugins</td><td align="center">${loadedPlugins.length}</td></tr>` +
    `</table>` +
    `<details><summary>👥 Userbot Snapshot</summary>` +
    `<table bordered striped>` +
    `<tr><th>ID</th><th>Status</th><th>Aktif</th></tr>` +
    rows +
    `</table></details>`;
}

/** Format bytes human-readable (tanpa import tambahan). */
function formatBytesRef(bytes: number): string {
  if (!bytes) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ==========================================================================
// SECTION 2 — KEYBOARDS
// ==========================================================================

export function keyboardMain(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const rows = [];

  if (session) {
    rows.push([{ text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot', style: 'primary' }]);
  } else {
    rows.push([{ text: '🚀 Daftar Sekarang', callback_data: 'rich:subscription', style: 'success' }]);
  }

  rows.push([
    { text: '📊 Stats', callback_data: 'rich:stats', style: 'primary' },
    { text: '❓ Bantuan', callback_data: 'rich:guide', style: 'primary' },
  ]);

  if (isOwner(ctx)) {
    rows.push([{ text: '👑 Panel Admin', callback_data: 'rich:admin', style: 'danger' }]);
  }

  rows.push([{ text: '💰 Donasi', callback_data: 'rich:donate', style: 'primary' }]);

  return { inline_keyboard: rows };
}

export function keyboardPanelMenu(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const rows = [];

  if (session) {
    rows.push([{ text: '🤖 Panel Userbot', callback_data: 'rich:ubot', style: 'primary' }]);
  } else {
    rows.push([{ text: '🚀 Register', callback_data: 'rich:subscription', style: 'success' }]);
  }

  if (isOwner(ctx)) {
    rows.push([{ text: '👑 Panel Admin', callback_data: 'rich:admin', style: 'danger' }]);
  }

  rows.push([{ text: '🔙 Kembali', callback_data: 'rich:main' }]);
  return { inline_keyboard: rows };
}

export function keyboardUserbot(ctx) {
  const isRunning = userbotManager.isRunning(ctx.from.id);
  return { inline_keyboard: [
    [{ text: isRunning ? '🔌 Matikan Bot' : '⚡ Hidupkan Bot', callback_data: 'rich:toggle_power', style: isRunning ? 'danger' : 'success' }],
    [
      { text: '🧩 Plugin', callback_data: 'rich:plugin_page:1' },
      { text: '⚙️ Settings', callback_data: 'rich:settings' },
    ],
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
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
    const action = isDisabled ? '✅' : '❌';
    const label = protectedPlugin ? `🔒 ${name}` : `${action} ${name}`;
    return [{ text: label, callback_data: `rich:plugin_toggle:${encodeURIComponent(lower)}:${currentPage}` }];
  });

  const nav = [];
  if (currentPage > 1) {nav.push({ text: '⬅️', callback_data: `rich:plugin_page:${currentPage - 1}` });}
  nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
  if (currentPage < totalPages) {nav.push({ text: '➡️', callback_data: `rich:plugin_page:${currentPage + 1}` });}
  rows.push(nav);

  rows.push([{ text: '🔙 Dashboard Bot', callback_data: 'rich:ubot' }]);
  return { inline_keyboard: rows };
}

export function keyboardSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;

  return { inline_keyboard: [
    [{ text: isAntiPm ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF', callback_data: 'rich:toggle_anti_pm', style: isAntiPm ? 'primary' : 'default' }],
    [{ text: isAfk ? '🤖 AFK: 🟢 ON' : '🤖 AFK: 🔴 OFF', callback_data: 'rich:toggle_afk', style: isAfk ? 'primary' : 'default' }],
    [
      { text: '📝 Pesan AFK', callback_data: 'rich:edit_afk' },
      { text: '⚙️ Vars', callback_data: 'rich:edit_vars' },
    ],
    [{ text: '🗑️ Hapus Sesi', callback_data: 'rich:danger_delete_session', style: 'danger' }],
    [{ text: '🔙 Dashboard Bot', callback_data: 'rich:ubot' }],
  ] };
}

export function keyboardDangerDelete() {
  return { inline_keyboard: [
    [{ text: '🗑️ Ya, Hapus Permanen', callback_data: 'rich:confirm_delete_session', style: 'danger' }],
    [{ text: '❌ Batal', callback_data: 'rich:settings', style: 'primary' }],
  ] };
}

export function keyboardRegister() {
  return { inline_keyboard: [
    [{ text: '📱 Login OTP', callback_data: 'rich:otp', style: 'success' }, { text: '🔍 Scan QR', callback_data: 'rich:qr', style: 'success' }],
    [{ text: '🔙 Kembali', callback_data: 'rich:subscription' }],
  ] };
}

export function keyboardSubscription() {
  const premiumDays = getSystemVarNum('SUBSCRIPTION_DAYS', 30);
  return { inline_keyboard: [
    [{ text: '🎁 Coba Gratis (7 Hari)', callback_data: 'rich:claim_trial', style: 'success' }],
    [{ text: `💎 Premium ${premiumDays} Hari`, callback_data: 'rich:buy_premium', style: 'primary' }],
    [{ text: '🔙 Menu', callback_data: 'rich:main' }],
  ] };
}

export function keyboardAdmin() {
  return { inline_keyboard: [
    [
      { text: '👥 User Directory', callback_data: 'rich:admin_users', style: 'primary' },
      { text: '🩺 Health', callback_data: 'rich:health', style: 'primary' },
    ],
    [
      { text: '⚙️ System Vars', callback_data: 'rich:edit_system_vars', style: 'primary' },
      { text: '📦 Backup', callback_data: 'rich:backup', style: 'primary' },
    ],
    [{ text: '🔙 Menu', callback_data: 'rich:main' }],
  ] };
}

export function keyboardBack(target = 'main') {
  return { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: `rich:${target}` }]] };
}

// ==========================================================================
// SECTION 3 — DASHBOARD HANDLERS
// ==========================================================================

function styleForButtonText(text = '') {
  const label = String(text).trim();
  if (label.includes('Login') || label.includes('Daftar') || label.includes('Gratis')) {return 'success';}
  if (label.includes('Dashboard') || label.includes('Menu')) {return 'primary';}
  if (label.includes('Hapus') || label.includes('Danger')) {return 'danger';}
  return undefined;
}

export function applyButtonStylesToPayload(payload) {
  const keyboard = payload?.reply_markup?.inline_keyboard;
  if (!Array.isArray(keyboard)) {return;}
  for (const row of keyboard) {
    if (!Array.isArray(row)) {continue;}
    for (const button of row) {
      if (!button?.style) {
        const style = styleForButtonText(button?.text);
        if (style) {button.style = style;}
      }
    }
  }
}

async function mongoStatusLabel() {
  try {
    const mongoose = await import('mongoose');
    return mongoose.default.connection.readyState === 1
      ? `🟢 Connected (${mongoose.default.connection.name})`
      : `🔴 State ${mongoose.default.connection.readyState}`;
  } catch (_e) {
    return '🔴 Disconnected';
  }
}

async function sendRich(ctx, rich, reply_markup, { deleteOld = false } = {}) {
  if (ctx.inlineMessageId) {
    if (ctx.answerCallbackQuery) {
      await ctx.answerCallbackQuery({ text: '⚠️ Akses menu ini melalui Private Chat (DM) bot.', show_alert: true }).catch(()=>{});
    }
    return;
  }
  const rich_message = typeof rich === 'string' ? { html: rich } : rich;
  try {
    await ctx.replyWithRichMessage(rich_message, { reply_markup });
    if (deleteOld) {
      try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
    }
  } catch (err) {
    Logger.logSystem(`sendRichMessage failed: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    await ctx.replyWithRichMessage({ html: `<blockquote><b>❌</b> Gagal kirim rich message. Kirim /menu lagi.</blockquote>` });
  }
}

async function openMain(ctx, options = {}) {
  await sendRich(ctx, panelMain(ctx), keyboardMain(ctx), options);
}

function findPlugin(name) {
  const target = decodeURIComponent(String(name || '')).trim().toLowerCase();
  return loadedPlugins.find(plugin => String(plugin.name).toLowerCase() === target);
}

function pluginNotice(pluginName, enabled) {
  return `${enabled ? 'Plugin diaktifkan' : 'Plugin dinonaktifkan'}: ${pluginName}`;
}

async function openPluginStudio(ctx, page = 1, notice = '', options = {}) {
  await sendRich(ctx, panelPlugins(ctx, page, notice), keyboardPluginStudio(ctx, page), options);
}

export function registerRichHandlers(bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    applyButtonStylesToPayload(payload);
    if (Array.isArray(payload?.results)) {
      for (const result of payload.results) {applyButtonStylesToPayload(result);}
    }
    return prev(method, payload, signal);
  });

  bot.command(['start', 'menu'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await replyRich(ctx, `🤖 <b>${ctx.me.first_name} Aktif!</b>\n\n<blockquote>Silakan kirim pesan secara privat (PM) untuk mengelola bot Anda.</blockquote>`, {
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Buka Private Chat', url: `https://t.me/${ctx.me.username}?start=true` }]]
        }
      });
      return;
    }
    await openMain(ctx);
  });

  bot.command('health', async (ctx) => {
    if (!isOwner(ctx)) {return;}
    await sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'));
  });

  bot.command('revoke', async (ctx) => {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {
      return ctx.replyWithRichMessage({ html: `<blockquote>❌ Anda belum memiliki sesi bot yang aktif.</blockquote>` });
    }

    await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Menghapus sesi dan logout...</blockquote>` });

    try {
      const ubot = userbotManager.clients.get(telegramId);
      if (ubot && ubot.client) {
        await (ubot.client as unknown as { call: (opts: Record<string, unknown>) => Promise<unknown> }).call({ _: 'auth.logOut' });
      }
    } catch (e) {
      Logger.logUser(telegramId, `Failed to logout remotely: ${e.message}`, 'WARN');
    }

    await userbotManager.stopUserbot(telegramId);
    await deleteUserbot(telegramId);

    await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ Berhasil</b>\nSesi dihapus sepenuhnya. Ketik /menu untuk mendaftar ulang.</blockquote>` });
  });

  bot.callbackQuery(/^rich:(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    try { await ctx.answerCallbackQuery(); } catch (_) { /* empty */ }

    if (action === 'main') {return openMain(ctx, { deleteOld: true });}
    if (action === 'noop') {return;}

    if (action === 'panel_menu') {return sendRich(ctx, panelMenuList(ctx), keyboardPanelMenu(ctx), { deleteOld: true });}

    if (action === 'ubot') {
      try {
        const thinking = await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Memuat data...</blockquote>` });
        await sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
        if (thinking && thinking.message_id) {
          await ctx.api.deleteMessage(ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id, thinking.message_id).catch(()=>{});
        }
      } catch (err) {
        Logger.logSystem(`Thinking error: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
        await sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
      }
      return;
    }

    if (action === 'toggle_power') {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}

      const isRunning = userbotManager.isRunning(telegramId);
      if (isRunning) {
        await ctx.answerCallbackQuery('Mematikan Bot...');
        await userbotManager.stopUserbot(telegramId);
        updateUserbotStatus(telegramId, false);
      } else {
        await ctx.answerCallbackQuery('Menghidupkan Bot...');
        try {
          await userbotManager.startUserbot(telegramId, session.session_string);
          updateUserbotStatus(telegramId, true);
        } catch (err) {
          return ctx.replyWithRichMessage({ html: `<blockquote>❌ <b>Gagal menghidupkan:</b> ${escapeHtml(err.message)}</blockquote>` });
        }
      }
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
    }

    if (action.startsWith('plugin_page:')) {
      const page = Number(action.split(':')[1] || 1);
      return openPluginStudio(ctx, page, '', { deleteOld: true });
    }

    if (action.startsWith('plugin_toggle:')) {
      const [, rawName, rawPage] = action.split(':');
      const page = Number(rawPage || 1);
      const plugin = findPlugin(rawName);
      if (!plugin) {
        return openPluginStudio(ctx, page, 'Plugin tidak ditemukan.', { deleteOld: true });
      }
      const pluginName = String(plugin.name);
      const lower = pluginName.toLowerCase();
      const protectedPlugins = ['admin', 'pluginmanager'];
      const disabled = getDisabledPlugins(ctx.from.id).map(name => String(name).toLowerCase());
      const isDisabled = disabled.includes(lower);

      if (!isDisabled && protectedPlugins.includes(lower)) {
        return openPluginStudio(ctx, page, `Plugin protected: ${pluginName}`, { deleteOld: true });
      }

      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        return openPluginStudio(ctx, page, pluginNotice(pluginName, true), { deleteOld: true });
      }

      await disablePlugin(ctx.from.id, pluginName);
      return openPluginStudio(ctx, page, pluginNotice(pluginName, false), { deleteOld: true });
    }

    if (action === 'settings') {return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });}

    if (action === 'toggle_anti_pm') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}
      const newStatus = session.anti_pm === 1 ? 0 : 1;
      await updateUserbotFeature(ctx.from.id, 'anti_pm', newStatus);
      await ctx.answerCallbackQuery(`Anti-PM: ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
    }

    if (action === 'toggle_afk') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}
      const newStatus = session.auto_reply === 1 ? 0 : 1;
      await updateUserbotFeature(ctx.from.id, 'auto_reply', newStatus);
      await ctx.answerCallbackQuery(`AFK: ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
    }

    if (action === 'edit_afk') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('afk-reason-conv');
    }

    if (action === 'edit_vars') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('manage-vars-conv');
    }

    if (action === 'danger_delete_session') {
      await ctx.answerCallbackQuery();
      const text = `🔺 <b>KONFIRMASI HAPUS SESI</b>\n\nTindakan ini akan mematikan bot dan menghapus session string dari database.\n\nJika hanya ingin berhenti sementara, gunakan tombol <b>Matikan Bot</b>.`;
      return sendRich(ctx, text, keyboardDangerDelete(), { deleteOld: true });
    }

    if (action === 'confirm_delete_session') {
      await ctx.answerCallbackQuery('Menghapus sesi...');
      const telegramId = ctx.from.id;

      try {
        const ubot = userbotManager.clients.get(telegramId);
        if (ubot && ubot.client) {
          await ubot.client.invoke(new Api.auth.LogOut());
        }
      } catch (e) {
        Logger.logUser(telegramId, `Failed to logout: ${e.message}`, 'WARN');
      }

      if (userbotManager.isRunning(telegramId)) {
        await userbotManager.stopUserbot(telegramId);
      }
      await deleteUserbot(telegramId);
      await ctx.replyWithRichMessage({ html: `<blockquote>🗑️ <b>Sesi dihapus permanen.</b></blockquote>` });
      return openMain(ctx, { deleteOld: true });
    }

    if (action === 'subscription') {return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(), { deleteOld: true });}
    if (action === 'register') {return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { deleteOld: true });}

    if (action === 'claim_trial') {
      await ctx.answerCallbackQuery();
      const claimed = hasClaimedTrial(ctx.from.id);
      if (claimed) {
        return ctx.replyWithRichMessage({ html: `<blockquote>❌ Anda sudah pernah klaim trial gratis.</blockquote>` });
      }
      setTrialClaimed(ctx.from.id);
      return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { deleteOld: true });
    }

    if (action === 'buy_premium') {
      return ctx.answerCallbackQuery({ text: '⏳ Coming Soon.', show_alert: true });
    }

    if (action === 'stats') {return sendRich(ctx, panelStats(ctx), keyboardBack('main'), { deleteOld: true });}
    if (action === 'guide') {return sendRich(ctx, panelQuickHelp(ctx), keyboardBack('main'), { deleteOld: true });}
    if (action === 'donate') {return sendRich(ctx, panelDonate(ctx), keyboardBack('main'), { deleteOld: true });}

    if (action === 'admin') {
      if (!isOwner(ctx)) {return;}
      return sendRich(ctx, panelAdmin(ctx), keyboardAdmin(), { deleteOld: true });
    }
    if (action === 'health') {
      if (!isOwner(ctx)) {return;}
      return sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'), { deleteOld: true });
    }
    if (action === 'edit_system_vars') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('manage-system-vars-conv');
    }
    if (action === 'admin_users') {
      if (!isOwner(ctx)) {return;}
      const users = getAllRegisteredUsers();
      const rows = users.slice(0, 20).map(u => {
        const running = userbotManager.isRunning(u.telegram_id);
        const status = running ? '🟢' : (u.is_active === 1 ? '🟡' : '🔴');
        const expiry = u.expired_at ? new Date(u.expired_at).toLocaleDateString() : '♾️';
        return `<tr><td align="center">${status}</td><td><code>${u.telegram_id}</code></td><td align="center">${u.is_active === 1 ? '✅' : '❌'}</td><td align="center">${u.custom_name || '—'}</td><td align="center">${expiry}</td></tr>`;
      }).join('') || '<tr><td colspan="5" align="center">Belum ada user</td></tr>';
      return ctx.replyWithRichMessage({ html: `<h1>👥 User Directory</h1><blockquote>Total: ${users.length} user terdaftar</blockquote><table bordered striped><tr><th>St</th><th>ID</th><th>Aktif</th><th>Nama</th><th>Expired</th></tr>${rows}</table>` });
    }
    if (action === 'backup') {
      if (!isOwner(ctx)) {return;}
      return ctx.replyWithRichMessage({ html: `<blockquote>Gunakan: <code>/backup</code> — backup database\n<code>/stats_db</code> — statistik database</blockquote>` });
    }
    if (action === 'otp') {return ctx.conversation.enter('otp-reg');}
    if (action === 'qr') {return ctx.conversation.enter('qr-reg');}
  });
}

export async function sendAccessDeniedRich(ctx) {
  await sendRich(ctx, panelAccessDenied(ctx), keyboardBack('main'), { deleteOld: true });
}
