/**
 * DeltaUbotJS — Dashboard (UI builders + rich handlers)
 * Redesigned layout — cleaner panels, organized keyboards, consistent navigation.
 */
import fs from 'fs';
import { Api } from 'teleproto';
import { InputFile } from 'grammy';
import config from '../../../config.js';
import { replyRich, escapeHtml } from '../../../utils/richMessage.js';
import { sendWithNativeDraft } from '../../../utils/streamRich.js';
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
  setSystemVar,
  UserbotModel,
  getSchedules,
} from '../../../infrastructure/database.js';
import { stopLoop } from '../../../userbot/handlers/util/loop.js';
import { getAllVouchers, deleteVoucher, redeemVoucher, broadcastVoucherToChannel } from '../../../services/VoucherService.js';
import { systemConfigCache } from '../../../infrastructure/dbCore.js';
import { loadedPlugins } from '../../../userbot/engine/pluginRegistry.js';
import userbotManager from '../../../userbot/engine/manager.js';
import {
  isApproved,
  approveUser,
  revokeUser,
  isPendingApproval,
  addPendingApproval,
  removePendingApproval,
  getPendingApprovals,
  getApprovedUsers,
  getApprovedUserMeta,
  hasAcceptedTerms,
  setAcceptedTerms,
} from '../../state/approvedUsers.js';
import { setUserVar } from '../../../services/SystemVarService.js';

// ==========================================================================
// SECTION 1 — UI BUILDERS
// ==========================================================================

const PROTECTED_PLUGINS = ['admin', 'pluginmanager'];
const PLUGINS_PER_PAGE = 8;

export const PLUGIN_CATEGORIES: Record<string, { label: string; icon: string }> = {
  all: { label: 'Semua', icon: '📦' },
  group: { label: 'Grup', icon: '👥' },
  util: { label: 'Utility', icon: '🛠️' },
  tools: { label: 'Tools', icon: '🎨' },
  admin: { label: 'Admin', icon: '🛡️' },
  system: { label: 'Sistem', icon: '⚙️' },
};

export function getPluginCategory(plugin: any): string {
  if (plugin && plugin.file) {
    const topDir = String(plugin.file).split(/[/\\]/)[0].toLowerCase();
    if (topDir in PLUGIN_CATEGORIES) {return topDir;}
  }
  return 'util';
}

export function formatModuleName(name: string): string {
  if (!name) {return '';}
  if (name.toLowerCase() === 'antipm') {return 'AntiPM';}
  if (name.length <= 3) {return name.toUpperCase();}
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function normalizedDisabled(telegramId) {
  return getDisabledPlugins(telegramId).map(name => String(name).toLowerCase());
}

function sortedPlugins() {
  return [...loadedPlugins].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function pluginCategoryInfo(category = 'all', page = 1) {
  let list = sortedPlugins();
  const selectedCat = (category in PLUGIN_CATEGORIES) ? category : 'all';
  if (selectedCat !== 'all') {
    list = list.filter(p => getPluginCategory(p) === selectedCat);
  }
  const totalPages = Math.max(1, Math.ceil(list.length / PLUGINS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * PLUGINS_PER_PAGE;
  return {
    plugins: list.slice(start, start + PLUGINS_PER_PAGE),
    page: currentPage,
    totalPages,
    total: list.length,
    category: selectedCat
  };
}

export function pluginPageInfo(page = 1) {
  return pluginCategoryInfo('all', page);
}

function daysLeftText(dateValue: string | Date | undefined | null, isRegistered = true, isOwnerUser = false) {
  if (isOwnerUser) {return '👑 Owner (Permanen)';}
  if (!isRegistered) {return '🎁 Trial 7 Hari Tersedia';}
  if (dateValue === null || dateValue === undefined || dateValue === '') {return '♾️ Unlimited';}
  const expDate = new Date(dateValue);
  if (Number.isNaN(expDate.getTime())) {return '♾️ Unlimited';}
  const diffDays = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diffDays > 0
    ? `${expDate.toLocaleDateString('id-ID')} · ${diffDays} hari lagi`
    : `${expDate.toLocaleDateString('id-ID')} · kedaluwarsa`;
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
  const isRegistered = !!session;
  const running = isRegistered && userbotManager.isRunning(ctx.from.id);
  const statusBadge = !isRegistered
    ? '🔴 Belum Terdaftar'
    : (running ? '🟢 Aktif &amp; Berjalan' : '🟡 Terdaftar (Mati)');

  if (!isRegistered) {
    const approved = isOwner(ctx) || isApproved(ctx.from.id);
    const pending = isPendingApproval(ctx.from.id);

    if (pending) {
      return `<h1 align="center">⚡ DeltaUserJS Manager</h1>` +
        `<p>Halo, <b>${escapeHtml(firstName)}</b>!<br>` +
        `Permohonan coba gratis <b>7 Hari</b> Anda sedang menunggu persetujuan owner.</p>` +
        `<table bordered striped>` +
        `<tr><th>Tahap Pendaftaran</th><th>Status</th><th>Keterangan</th></tr>` +
        `<tr><td>1. Request Trial</td><td align="center">✅ Selesai</td><td>Terkirim ke Owner</td></tr>` +
        `<tr><td>2. Review Owner</td><td align="center">⏳ Menunggu</td><td>Sedang Ditinjau</td></tr>` +
        `<tr><td>3. Tautkan Akun</td><td align="center">🔒 Terkunci</td><td>Scan QR / OTP</td></tr>` +
        `<tr><td>4. Userbot Aktif</td><td align="center">🔒 Terkunci</td><td>Teleproto 229</td></tr>` +
        `</table>` +
        `<hr/>` +
        `<h3>ℹ️ Langkah Selanjutnya</h3>` +
        `<p>Owner akan meninjau permohonan Anda. Begitu disetujui, bot akan mengirimkan notifikasi agar Anda dapat langsung login via Scan QR Code atau OTP.</p>` +
        `<footer>Ketuk tombol 🔄 Cek Status Approval di bawah untuk memperbarui status.</footer>`;
    }

    if (approved) {
      return `<h1 align="center">⚡ DeltaUserJS Manager</h1>` +
        `<p>Halo, <b>${escapeHtml(firstName)}</b>!<br>` +
        `🎉 <b>Akses Disetujui!</b> Akun Anda siap untuk menghubungkan userbot.</p>` +
        `<table bordered striped>` +
        `<tr><th>Tahap Pendaftaran</th><th>Status</th><th>Keterangan</th></tr>` +
        `<tr><td>1. Request Trial</td><td align="center">✅ Selesai</td><td>Disetujui</td></tr>` +
        `<tr><td>2. Review Owner</td><td align="center">✅ Disetujui</td><td>Izin Diberikan</td></tr>` +
        `<tr><td>3. Tautkan Akun</td><td align="center">🔓 Siap Login</td><td>Scan QR / OTP</td></tr>` +
        `<tr><td>4. Userbot Aktif</td><td align="center">🚀 Siap</td><td>Langkah Terakhir</td></tr>` +
        `</table>` +
        `<footer>Ketuk tombol 🚀 Mulai Daftar Userbot di bawah untuk menghubungkan akun Telegram Anda.</footer>`;
    }

    return `<h1 align="center">⚡ DeltaUserJS <sup>v2.4</sup></h1>` +
      `<p>Halo, <b>${escapeHtml(firstName)}</b> <sub>(Pengguna Baru)</sub>! Selamat datang di <b>${escapeHtml(botName)}</b>.<br>` +
      `Platform modular untuk mengelola userbot Telegram Anda dengan mudah, cepat, dan aman.</p>` +
      `<table bordered striped>` +
      `<tr><th>Layanan Platform</th><th>Status</th><th>Keterangan</th></tr>` +
      `<tr><td>🤖 Userbot Engine <sub>(MTProto)</sub></td><td align="center">🟢 Online <sup>[v229]</sup></td><td>Teleproto Layer 229</td></tr>` +
      `<tr><td>🎁 Uji Coba Gratis <sub>(trial)</sub></td><td align="center">7 Hari <sup>Gratis</sup></td><td>Request ke Owner</td></tr>` +
      `<tr><td>📦 Modul Tersedia <sub>(plugins)</sub></td><td align="center">${loadedPlugins.length} Plugin <sup>Aktif</sup></td><td>Siap Digunakan</td></tr>` +
      `</table>` +
      `<hr/>` +
      `<h3>🚀 Alur Pendaftaran Cepat (4 Langkah):</h3>` +
      `<ol>` +
      `<li>Ajukan coba gratis dengan menekan tombol <b>🎁 Request Coba Gratis</b> di bawah.</li>` +
      `<li>Tunggu persetujuan singkat dari owner bot.</li>` +
      `<li>Pindai Scan QR Code atau masukkan kode OTP Telegram.</li>` +
      `<li>Userbot Anda langsung online &amp; siap digunakan!</li>` +
      `</ol>` +
      `<footer>Silakan pilih menu di bawah untuk memulai.</footer>`;
  }

  // Tampilan Menu Utama untuk Pengguna Terdaftar (Portal Ringkas)
  const roleBadge = isOwner(ctx) ? 'Owner' : 'VIP Member';
  return `<h1 align="center">⚡ DeltaUserJS <sup>v2.4</sup></h1>` +
    `<p>Halo, <b>${escapeHtml(firstName)}</b> <sub>(${roleBadge})</sub>! Selamat datang di <b>${escapeHtml(botName)}</b>.<br>` +
    `Pusat kendali &amp; portal utama userbot Telegram Anda.</p>` +
    `<table bordered striped>` +
    `<tr><th>Informasi Akun</th><th>Status</th><th>Keterangan</th></tr>` +
    `<tr><td>🤖 Status Userbot <sub>(engine)</sub></td><td align="center">${running ? '🟢 Online <sup>[RUNNING]</sup>' : '🔴 Offline <sup>[STOPPED]</sup>'}</td><td>${running ? 'Teleproto 229' : 'Siap Dijalankan'}</td></tr>` +
    `<tr><td>⏳ Masa Aktif <sub>(akses)</sub></td><td align="center">${daysLeftText(session?.expired_at, true, isOwner(ctx))}</td><td>Akses Penuh</td></tr>` +
    `<tr><td>⚡ Core Engine <sub>(MTProto)</sub></td><td align="center">Teleproto <sup>Layer 229</sup></td><td>Layer MTProto</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Akses Cepat Pengguna:</h3>` +
    `<ul>` +
    `<li>Gunakan tombol <b>🤖 Buka Dashboard Userbot</b> untuk kontrol daya &amp; prefix.</li>` +
    `<li>Buka <b>🧩 Plugin Studio</b> untuk mengaktifkan/mematikan ${loadedPlugins.length} modul aktif.</li>` +
    `<li>Kirim <code>.help</code> di chat mana pun untuk melihat cheatsheet perintah.</li>` +
    `</ul>` +
    `<footer>Ketuk 🤖 Buka Dashboard Userbot di bawah untuk mengelola modul, kontrol daya, dan pengaturan akun Anda.</footer>`;
}

export function panelMenuList(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const hasBot = !!session;
  const running = hasBot && userbotManager.isRunning(ctx.from.id);

  const statusLine = !hasBot
    ? '🔴 Belum Terdaftar'
    : (running ? '🟢 Online &amp; Berjalan <sup>[AKTIF]</sup>' : '🟡 Terdaftar <sub>(Offline)</sub>');

  return `<h1 align="center">🎛️ Panel Menu Kontrol <sup>PORTAL</sup></h1>` +
    `<p>Status Akun: <b>${statusLine}</b></p>` +
    `<table bordered striped>` +
    `<tr><th>Menu Kontrol</th><th>Deskripsi Layanan</th><th>Akses</th></tr>` +
    (hasBot
      ? `<tr><td>🤖 Panel Userbot <sub>(kendali)</sub></td><td>Kendali daya, restart, &amp; info sesi</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>🧩 Plugin Studio <sub>(modul)</sub></td><td>Manajemen ${loadedPlugins.length} modul perintah aktif</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>⚙️ Pengaturan <sub>(keamanan)</sub></td><td>Anti-PM, Mode AFK, &amp; custom prefix</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>🩺 Diagnostik <sub>(network)</sub></td><td>Uji latensi MTProto &amp; data center</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>💎 Langganan <sub>(billing)</sub></td><td>Status durasi akses &amp; perpanjangan</td><td align="center">🟢 Siap</td></tr>`
      : `<tr><td>🚀 Registrasi Akun <sub>(baru)</sub></td><td>Daftar userbot baru via OTP atau QR Code</td><td align="center">🟡 Perlu Setup</td></tr>` +
        `<tr><td>💎 Paket VIP <sub>(premium)</sub></td><td>Pilihan durasi berlangganan premium</td><td align="center">🟢 Tersedia</td></tr>`) +
    (isOwner(ctx) ? `<tr><td>👑 Panel Admin <sub>(owner)</sub></td><td>Operasi owner &amp; maintenance sistem</td><td align="center">🔴 Owner <sup>ROOT</sup></td></tr>` : '') +
    `</table>` +
    `<footer>Pilih salah satu menu di bawah untuk melanjutkan.</footer>`;
}

export function panelUserbot(ctx) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {
    const approved = isOwner(ctx) || isApproved(ctx.from.id);
    if (approved) {
      return `<h1 align="center">🔓 Akses Disetujui: Hubungkan Userbot</h1>` +
        `<p>Akun Anda <b>sudah disetujui</b> oleh owner, tetapi Anda belum menghubungkan sesi Telegram.</p>` +
        `<table bordered striped><caption>🚀 Status Pendaftaran</caption>` +
        `<tr><th>Tahapan</th><th>Status</th></tr>` +
        `<tr><td>Status Izin</td><td align="center">✅ Disetujui (Approved)</td></tr>` +
        `<tr><td>Sesi Userbot</td><td align="center">⚪ Belum Ditautkan</td></tr>` +
        `</table>` +
        `<footer>Silakan ketuk tombol 🚀 Mulai Daftar Userbot di bawah untuk menghubungkan via QR Code atau OTP.</footer>`;
    }
    return `<h1 align="center">❌ Sesi Tidak Ditemukan</h1><p>Akun Anda belum terdaftar di DeltaUserJS. Silakan hubungkan akun terlebih dahulu via <code>/daftar</code>.</p><footer>Ketik /menu untuk membuka menu utama.</footer>`;
  }
  const running = userbotManager.isRunning(ctx.from.id);
  const ubot = userbotManager.clients.get(ctx.from.id);
  const isConnected = running && Boolean(ubot?.client?.connected);
  const dcId = String((ubot?.client?.session as any)?.dcId || '4');
  const botName = session?.custom_name || ctx.me?.first_name || 'Bot';
  const currentPrefix = session?.vars?.PREFIX || '.';
  const disabled = normalizedDisabled(ctx.from.id);
  const activePlugins = Math.max(0, loadedPlugins.length - disabled.length);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;
  const flood = userbotManager.getFloodStatus(ctx.from.id);
  const mySchedules = getSchedules(ctx.from.id);
  const loopCount = mySchedules.filter(s => s.type === 'loop').length;

  const connStatus = running
    ? (isConnected ? '🟢 Online' : '🟡 Menghubungkan...')
    : '🔴 Offline';

  // Rich Buttons interaktif langsung di dalam cell tabel
  const powerBtn = running
    ? `<tg-button type="callback_data" data="rich:toggle_power">🔌 Matikan</tg-button>`
    : `<tg-button type="callback_data" data="rich:toggle_power">⚡ Nyalakan</tg-button>`;
  const restartBtn = running
    ? ` <tg-button type="callback_data" data="rich:user_restart_ubot">🔄 Restart</tg-button>`
    : '';
  const prefixBtn = `<tg-button type="callback_data" data="rich:pick_prefix">✏️ Ubah</tg-button>`;
  const antiPmBtn = `<tg-button type="callback_data" data="rich:toggle_anti_pm_ubot">${isAntiPm ? '🔴 Matikan' : '🟢 Aktifkan'}</tg-button>`;
  const afkBtn = `<tg-button type="callback_data" data="rich:toggle_afk_ubot">${isAfk ? '🔴 Matikan' : '🟢 Aktifkan'}</tg-button>`;
  const nameBtn = `<tg-button type="callback_data" data="rich:edit_name">✏️ Ganti</tg-button>`;
  const pluginBtn = `<tg-button type="callback_data" data="rich:p_cat:all:1">📦 Buka</tg-button>`;
  const diagBtn = `<tg-button type="callback_data" data="rich:ubot_diag">🩺 Tes</tg-button>`;
  const loopBtn = `<tg-button type="callback_data" data="rich:user_loops:1">⏰ Kelola</tg-button>`;
  const subBtn = `<tg-button type="callback_data" data="rich:subscription">💎 VIP</tg-button>`;

  const phoneText = session?.phone
    ? `<tg-spoiler>${session.phone.startsWith('+') ? session.phone : `+${session.phone}`}</tg-spoiler>`
    : '<i>Disembunyikan</i>';

  const floodBanner = flood.inCooldown
    ? `<h3>⚠️ Mode Hibernasi FloodGuard Aktif</h3>` +
      `<p>Akun dalam jeda aman Telegram (<b>${flood.secondsLeft} detik tersisa</b>) untuk mencegah pembatasan akun. Aksi keluar ditahan otomatis hingga hitungan mundur selesai.</p><hr/>`
    : '';

  return `<h1 align="center">🤖 Dashboard ${escapeHtml(botName)} <sup>PRO</sup></h1>` +
    floodBanner +
    `<h3>${running ? '🟢 Status: Online <sup>[RUNNING]</sup>' : '🔴 Status: Offline <sup>[STOPPED]</sup>'}</h3>` +
    `<p>Teleproto <sup>Layer 229</sup> · Telegram Datacenter <sub>DC ${dcId}</sub> · Latensi Real-time</p>` +
    `<table bordered striped><caption>🎛️ Panel Kendali &amp; Aksi Interaktif</caption>` +
    `<tr><th>Fitur / Layanan</th><th>Status Saat Ini</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>⚡ Daya Userbot <sub>(power)</sub></td><td>${connStatus}</td><td align="center">${powerBtn}${restartBtn}</td></tr>` +
    `<tr><td>💬 Prefix Perintah <sub>(trigger)</sub></td><td><code>${escapeHtml(currentPrefix)}</code></td><td align="center">${prefixBtn}</td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM <sub>(guard)</sub></td><td>${badge(isAntiPm, '🟢 ON', '🔴 OFF')}</td><td align="center">${antiPmBtn}</td></tr>` +
    `<tr><td>💤 Mode AFK Auto <sub>(reply)</sub></td><td>${badge(isAfk, '🟢 ON', '🔴 OFF')}</td><td align="center">${afkBtn}</td></tr>` +
    `<tr><td>🏷️ Nama Kustom <sub>(branding)</sub></td><td><b>${escapeHtml(botName)}</b></td><td align="center">${nameBtn}</td></tr>` +
    `<tr><td>🧩 Modul Plugin <sub>(active)</sub></td><td>🟢 ${activePlugins}/${loadedPlugins.length} Aktif</td><td align="center">${pluginBtn}</td></tr>` +
    `<tr><td>⏰ Auto-Loop <sub>(broadcast)</sub></td><td><b>${loopCount}</b> Jadwal Aktif</td><td align="center">${loopBtn}</td></tr>` +
    `<tr><td>🛡️ FloodGuard <sub>(hibernasi)</sub></td><td>${flood.inCooldown ? `⏳ Cooldown <sub>(${flood.secondsLeft}s)</sub>` : '🟢 Normal <sup>[AMAN]</sup>'}</td><td align="center">${diagBtn}</td></tr>` +
    `<tr><td>⏱️ Masa Langganan <sub>(durasi)</sub></td><td>${daysLeftText(session?.expired_at, true, isOwner(ctx))}</td><td align="center">${subBtn}</td></tr>` +
    `</table>` +
    `<table bordered striped><caption>👤 Profil Akun Terhubung</caption>` +
    `<tr><th>Informasi Akun</th><th>Nilai</th></tr>` +
    `<tr><td>📱 Nomor Telegram <sub>(phone)</sub></td><td align="center">${phoneText}</td></tr>` +
    `<tr><td>🆔 ID Telegram <sub>(UID)</sub></td><td align="center"><code>${ctx.from.id}</code></td></tr>` +
    `</table>` +
    `<hr/>` +
    `<details>` +
    `<summary>💡 Cheatsheet Perintah Populer (7 Perintah)</summary>` +
    `<ul>` +
    `<li><code>${escapeHtml(currentPrefix)}ping</code> — Uji kecepatan latensi koneksi respon MTProto</li>` +
    `<li><code>${escapeHtml(currentPrefix)}alive</code> — Tampilkan kartu status userbot &amp; engine di chat</li>` +
    `<li><code>${escapeHtml(currentPrefix)}help</code> — Buka pustaka inline interaktif ${loadedPlugins.length} modul</li>` +
    `<li><code>${escapeHtml(currentPrefix)}afk [alasan]</code> — Aktifkan status &amp; pesan sibuk otomatis</li>` +
    `<li><code>${escapeHtml(currentPrefix)}purge</code> — Hapus pesan massal secara instan (reply pesan)</li>` +
    `<li><code>${escapeHtml(currentPrefix)}tagall [pesan]</code> — Mention seluruh member grup sekaligus</li>` +
    `<li><code>${escapeHtml(currentPrefix)}id</code> — Cek ID obrolan, pengguna, atau channel saat ini</li>` +
    `</ul>` +
    `</details>` +
    `<footer>Ketuk tombol aksi di dalam tabel atau gunakan tombol navigasi di bawah.</footer>`;
}

export function panelPlugins(ctx, page = 1, category = 'all', notice = '') {
  const disabled = normalizedDisabled(ctx.from.id);
  const disabledSet = new Set(disabled);
  const { plugins, page: currentPage, totalPages, total, category: activeCat } = pluginCategoryInfo(category, page);
  const activeCount = sortedPlugins().filter(p => !disabledSet.has(String(p.name).toLowerCase())).length;

  const rows = plugins.map(plugin => {
    const name = String(plugin.name);
    const lower = name.toLowerCase();
    const isActive = !disabledSet.has(lower);
    const isProtected = PROTECTED_PLUGINS.includes(lower);

    const infoBtn = `<tg-button type="callback_data" data="rich:p_info:${encodeURIComponent(lower)}:${currentPage}:${activeCat}">ℹ️ Info</tg-button>`;
    const actionBtn = isProtected
      ? '🔒'
      : `<tg-button type="callback_data" data="rich:p_tog:${encodeURIComponent(lower)}:${currentPage}:${activeCat}">${isActive ? '✅ ON' : '❌ OFF'}</tg-button>`;
    return `<tr><td><b>${escapeHtml(name)}</b></td><td align="center">${infoBtn}</td><td align="center">${actionBtn}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Tidak ada plugin di kategori ini</td></tr>';

  // Category filter keyboard (2 rows)
  const catRow1 = [
    { text: `${activeCat === 'group' ? '🔘' : '👥'} Grup`, callback_data: `rich:p_cat:group:1` },
    { text: `${activeCat === 'util' ? '🔘' : '🛠️'} Utility`, callback_data: `rich:p_cat:util:1` },
    { text: `${activeCat === 'tools' ? '🔘' : '🎨'} Tools`, callback_data: `rich:p_cat:tools:1` },
  ];
  const catRow2 = [
    { text: `${activeCat === 'admin' ? '🔘' : '🛡️'} Admin`, callback_data: `rich:p_cat:admin:1` },
    { text: `${activeCat === 'system' ? '🔘' : '⚙️'} Sistem`, callback_data: `rich:p_cat:system:1` },
    { text: `${activeCat === 'all' ? '🔘' : '📦'} Semua`, callback_data: `rich:p_cat:all:1` },
  ];

  // Pagination navigation
  const navRow: any[] = [];
  if (currentPage > 1) {
    navRow.push({ text: '⬅️ Prev', callback_data: `rich:p_page:${currentPage - 1}:${activeCat}` });
  }
  navRow.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
  if (currentPage < totalPages) {
    navRow.push({ text: 'Next ➡️', callback_data: `rich:p_page:${currentPage + 1}:${activeCat}` });
  }

  const keyboard = {
    inline_keyboard: [
      catRow1,
      catRow2,
      navRow,
      [{ text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' }],
    ]
  };

  const catLabel = PLUGIN_CATEGORIES[activeCat]?.label || 'Semua';
  const catIcon = PLUGIN_CATEGORIES[activeCat]?.icon || '📦';

  return {
    rich:
      `<h1 align="center">🧩 Plugin Studio <sup>v1.0</sup></h1>` +
      (notice ? `<p>🔔 <b>${escapeHtml(notice)}</b></p>` : `<p>Kelola <b>${loadedPlugins.length}</b> modul perintah untuk userbot Telegram Anda.</p>`) +
      `<table bordered striped><caption>📊 Filter Kategori: ${catIcon} ${escapeHtml(catLabel)} <sub>(${total} plugin)</sub></caption>` +
      `<tr><th>Total Kategori</th><th>Total Aktif</th><th>Total Off</th><th>Halaman</th></tr>` +
      `<tr><td align="center">${total}</td><td align="center">🟢 ${activeCount}</td><td align="center">🔴 ${Math.max(0, loadedPlugins.length - activeCount)}</td><td align="center">${currentPage}/${totalPages}</td></tr>` +
      `</table>` +
      `<table bordered striped><caption>📋 Modul ${escapeHtml(catLabel)} <sub>(Hal ${currentPage}/${totalPages})</sub></caption>` +
      `<tr><th>Plugin</th><th align="center">Detail</th><th align="center">Status</th></tr>` +
      rows +
      `</table>` +
      `<hr/>` +
      `<h3>💡 Panduan Modul:</h3>` +
      `<ul>` +
      `<li>Ketuk tombol <b>ℹ️ Info</b> untuk melihat fungsi &amp; cheatsheet perintah.</li>` +
      `<li>Ketuk tombol status <b>ON/OFF</b> untuk mengaktifkan/mematikan plugin.</li>` +
      `<li>Simbol 🔒 menandakan modul inti sistem (protected).</li>` +
      `</ul>` +
      `<footer>Pilih kategori atau ketuk tombol modul di atas untuk konfigurasi.</footer>`,
    keyboard
  };
}

export function panelPluginDetail(ctx, pluginName: string, page = 1, category = 'all') {
  const target = decodeURIComponent(String(pluginName || '')).trim().toLowerCase();
  const plugin = loadedPlugins.find(p => String(p.name).toLowerCase() === target);
  if (!plugin) {
    return {
      rich: `<h1 align="center">❌ Modul Tidak Ditemukan</h1><p>Plugin <code>${escapeHtml(pluginName)}</code> tidak ditemukan di pustaka.</p><footer>Gunakan tombol di bawah untuk kembali.</footer>`,
      keyboard: { inline_keyboard: [[{ text: '🔙 Kembali ke Plugin Studio', callback_data: `rich:p_cat:${category}:${page}` }]] }
    };
  }

  const disabled = normalizedDisabled(ctx.from.id);
  const isActive = !disabled.includes(target);
  const isProtected = PROTECTED_PLUGINS.includes(target);
  const cat = getPluginCategory(plugin);
  const catLabel = PLUGIN_CATEGORIES[cat]?.label || cat;
  const catIcon = PLUGIN_CATEGORIES[cat]?.icon || '📦';

  const title = plugin.help?.title || formatModuleName(plugin.name);
  const desc = plugin.help?.description || 'Modul perintah otomatis untuk userbot Telegram.';
  const usage = plugin.help?.usage || `.${plugin.name}`;
  const detail = plugin.help?.detail || 'Gunakan modul ini di chat pribadi atau grup.';

  const rich = `<h1 align="center">🧩 Modul: ${escapeHtml(title)}</h1>` +
    `<p>${escapeHtml(desc)}</p>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th>Keterangan</th></tr>` +
    `<tr><td>🏷️ Nama Modul</td><td><code>${escapeHtml(plugin.name)}</code></td></tr>` +
    `<tr><td>📂 Kategori</td><td>${catIcon} ${escapeHtml(catLabel)}</td></tr>` +
    `<tr><td>⚡ Status Modul</td><td align="center">${isProtected ? '🔒 Terkunci (Sistem)' : (isActive ? '🟢 Aktif' : '🔴 Nonaktif')}</td></tr>` +
    `<tr><td>💬 Sintaks / Usage</td><td><code>${escapeHtml(usage)}</code></td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Petunjuk Penggunaan:</h3>` +
    `<p>${escapeHtml(detail)}</p>` +
    `<footer>Kelola status aktif modul ini menggunakan tombol di bawah.</footer>`;

  const actionRows: any[] = [];
  if (!isProtected) {
    actionRows.push([
      {
        text: isActive ? '🔴 Nonaktifkan Modul Ini' : '🟢 Aktifkan Modul Ini',
        callback_data: `rich:p_tog_det:${encodeURIComponent(target)}:${page}:${category}`
      }
    ]);
  }
  actionRows.push([
    { text: '🔙 Kembali ke Daftar Modul', callback_data: `rich:p_cat:${category}:${page}` },
    { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
  ]);

  return { rich, keyboard: { inline_keyboard: actionRows } };
}

export function panelSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const afkReason = session?.afk_reason || 'AFK (default)';
  const currentPrefix = session?.vars?.PREFIX || '.';
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;
  const botName = session?.custom_name || ctx.me?.first_name || 'Userbot';
  const helperUser = session?.inline_bot_username ? `@${session.inline_bot_username}` : '<i>Belum diset</i>';

  const antiPmBtn = `<tg-button type="callback_data" data="rich:toggle_anti_pm">${isAntiPm ? '🔴 Matikan' : '🟢 Aktifkan'}</tg-button>`;
  const afkBtn = `<tg-button type="callback_data" data="rich:toggle_afk">${isAfk ? '🔴 Matikan' : '🟢 Aktifkan'}</tg-button>`;
  const prefixBtn = `<tg-button type="callback_data" data="rich:pick_prefix">✏️ Ubah</tg-button>`;
  const nameBtn = `<tg-button type="callback_data" data="rich:edit_name">✏️ Ganti</tg-button>`;
  const afkReasonBtn = `<tg-button type="callback_data" data="rich:edit_afk">✏️ Edit</tg-button>`;
  const helperBtn = `<tg-button type="callback_data" data="rich:setup_helper">⚙️ Setup</tg-button>`;

  return `<h1 align="center">⚙️ Pengaturan &amp; Keamanan <sup>SYSTEM</sup></h1>` +
    `<p>Atur preferensi keamanan, identitas bot, dan respons otomatis akun Anda.</p>` +
    `<table bordered striped><caption>🛠️ Konfigurasi Fitur Akun</caption>` +
    `<tr><th>Pengaturan</th><th>Nilai / Status</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>💬 Prefix Perintah <sub>(trigger)</sub></td><td><code>${escapeHtml(currentPrefix)}</code></td><td align="center">${prefixBtn}</td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM <sub>(guard)</sub></td><td>${badge(isAntiPm, '🟢 ON', '🔴 OFF')}</td><td align="center">${antiPmBtn}</td></tr>` +
    `<tr><td>💤 Mode AFK Auto <sub>(reply)</sub></td><td>${badge(isAfk, '🟢 ON', '🔴 OFF')}</td><td align="center">${afkBtn}</td></tr>` +
    `<tr><td>🏷️ Nama Kustom Bot <sub>(identity)</sub></td><td><b>${escapeHtml(botName)}</b></td><td align="center">${nameBtn}</td></tr>` +
    `<tr><td>📝 Pesan Balasan AFK <sub>(template)</sub></td><td><tg-spoiler><code>${escapeHtml(afkReason)}</code></tg-spoiler></td><td align="center">${afkReasonBtn}</td></tr>` +
    `<tr><td>🤖 Inline Helper <sub>(botfather)</sub></td><td>${helperUser}</td><td align="center">${helperBtn}</td></tr>` +
    `<tr><td>📦 Database Sesi <sub>(storage)</sub></td><td>${session ? '🟢 Tersimpan <sup>[OK]</sup>' : '🔴 Kosong'}</td><td align="center">MongoDB</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>⚠️ Keamanan Sesi Telegram:</h3>` +
    `<p>String sesi akun Anda disimpan aman di database MongoDB. Jika Anda menduga ada aktivitas mencurigakan, gunakan tombol <b>🗑️ Hapus Sesi Akun</b> untuk logout secara permanen dari server.</p>` +
    `<footer>Ketuk tombol di tabel atau gunakan tombol di bawah untuk setelan lanjutan.</footer>`;
}

export function panelPrefixPicker(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const currentPrefix = session?.vars?.PREFIX || '.';
  return `<h1 align="center">💬 Ganti Prefix Perintah <sup>CONFIG</sup></h1>` +
    `<p>Prefix saat ini: <code>${escapeHtml(currentPrefix)}</code><br>` +
    `Pilih salah satu simbol prefix di bawah untuk mengubah prefix perintah userbot Anda:</p>` +
    `<table bordered striped>` +
    `<tr><th>Simbol</th><th>Contoh Perintah</th><th>Keterangan</th></tr>` +
    `<tr><td><code>.</code> <sub>(Titik)</sub></td><td><code>.ping</code>, <code>.alive</code></td><td>Standar <sup>Default</sup></td></tr>` +
    `<tr><td><code>!</code> <sub>(Seru)</sub></td><td><code>!ping</code>, <code>!alive</code></td><td>Populer <sup>Bot</sup></td></tr>` +
    `<tr><td><code>,</code> <sub>(Koma)</sub></td><td><code>,ping</code>, <code>,alive</code></td><td>Mudah <sup>Ketik</sup></td></tr>` +
    `<tr><td><code>#</code> <sub>(Pagar)</sub></td><td><code>#ping</code>, <code>#alive</code></td><td>Alternatif</td></tr>` +
    `<tr><td><code>?</code> <sub>(Tanya)</sub></td><td><code>?ping</code>, <code>?alive</code></td><td>Alternatif</td></tr>` +
    `<tr><td><code>~</code> <sub>(Tilde)</sub></td><td><code>~ping</code>, <code>~alive</code></td><td>Alternatif</td></tr>` +
    `</table>` +
    `<footer>Ketuk tombol prefix di bawah untuk langsung mengganti.</footer>`;
}

export function panelInlineHelper(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const botUser = session?.inline_bot_username;
  return `<h1 align="center">🤖 Setup Inline Helper Bot <sup>BOTFATHER</sup></h1>` +
    `<p>Inline Helper Bot memungkinkan perintah <code>.help</code> di obrolan mana pun memunculkan tombol menu interaktif.</p>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th>Status</th></tr>` +
    `<tr><td>Status Helper <sub>(username)</sub></td><td align="center">${botUser ? `🟢 Terpasang <sup>(@${escapeHtml(botUser)})</sup>` : '🔴 Belum Terpasang'}</td></tr>` +
    `<tr><td>Metode Pemasangan <sub>(auth)</sub></td><td align="center">Via @BotFather <sup>HTTP API</sup></td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>📝 Cara Mendapatkan Token Bot:</h3>` +
    `<ol>` +
    `<li>Buka @BotFather di Telegram.</li>` +
    `<li>Kirim perintah <code>/newbot</code> dan ikuti instruksi (beri nama &amp; username akhiran 'bot').</li>` +
    `<li>Kirim perintah <code>/setinline</code> ke @BotFather lalu pilih bot Anda.</li>` +
    `<li>Salin <b>HTTP API Token</b> yang diberikan @BotFather.</li>` +
    `<li>Ketuk tombol <b>🔑 Masukkan Token Bot</b> di bawah untuk menyimpannya.</li>` +
    `</ol>` +
    `<footer>Helper bot hanya digunakan untuk merender menu bantuan inline.</footer>`;
}

export async function panelUserbotDiag(ctx) {
  const telegramId = ctx.from.id;
  const session = getUserbotSession(telegramId);
  const isRunning = userbotManager.isRunning(telegramId);
  const ubot = userbotManager.clients.get(telegramId);

  let pingMs = -1;
  let dcId = '4';
  let connected = false;

  if (isRunning && ubot && ubot.client) {
    connected = Boolean(ubot.client.connected);
    dcId = String((ubot.client.session as any)?.dcId || '4');
    try {
      const start = Date.now();
      await ubot.client.invoke(new Api.help.GetNearestDc());
      pingMs = Date.now() - start;
    } catch (_) {
      pingMs = -1;
    }
  }

  const disabledCount = getDisabledPlugins(telegramId).length;
  const activeCount = Math.max(0, loadedPlugins.length - disabledCount);
  const flood = userbotManager.getFloodStatus(telegramId);

  const retryBtn = `<tg-button type="callback_data" data="rich:ubot_diag">🔄 Uji Ulang</tg-button>`;
  const backUbotBtn = `<tg-button type="callback_data" data="rich:ubot">🤖 Dashboard</tg-button>`;

  const floodInfo = flood.inCooldown
    ? `<h3>⚠️ Peringatan FloodWait Telegram:</h3>` +
      `<p>Akun Anda saat ini sedang dalam masa pendinginan aman sebesar <b>${flood.secondsLeft} detik</b>. DeltaUbotJS otomatis menahan seluruh aktivitas perintah keluar agar akun tidak terkena batasan banned dari Telegram. Sistem akan kembali normal secara otomatis begitu hitungan mundur selesai.</p><hr/>`
    : '';

  return `<h1 align="center">🩺 Diagnostik &amp; Latensi MTProto <sup>v2.4</sup></h1>` +
    floodInfo +
    `<p>Hasil pengujian langsung soket MTProto Telegram dan status runtime engine.</p>` +
    `<table bordered striped><caption>📊 Hasil Pengujian Real-Time</caption>` +
    `<tr><th>Parameter Uji</th><th>Hasil / Nilai</th><th align="center">Aksi</th></tr>` +
    `<tr><td>⚡ Status Client <sub>(koneksi)</sub></td><td>${isRunning ? (connected ? '🟢 Online &amp; Terhubung <sup>[OK]</sup>' : '🟡 Menghubungkan...') : '🔴 Offline / Mati'}</td><td align="center">${retryBtn}</td></tr>` +
    `<tr><td>📡 Latensi Telegram DC <sub>(ping)</sub></td><td>${pingMs > 0 ? `<b>${pingMs} ms</b>` : (isRunning ? '🟡 Mengukur...' : '🔴 N/A')}</td><td align="center">Layer 229 <sup>MTProto</sup></td></tr>` +
    `<tr><td>🌐 Server Datacenter <sub>(lokasi)</sub></td><td>Telegram DC ${dcId} <sup>[DC${dcId}]</sup></td><td align="center">Teleproto</td></tr>` +
    `<tr><td>🛡️ FloodWait Guard <sub>(proteksi)</sub></td><td>${flood.inCooldown ? `⏳ Hibernasi <sub>(${flood.secondsLeft}s)</sub>` : '🟢 Normal <sup>[AMAN]</sup>'}</td><td align="center">Proteksi</td></tr>` +
    `<tr><td>🧩 Modul Aktif <sub>(plugins)</sub></td><td>🟢 ${activeCount} / ${loadedPlugins.length} Plugin</td><td align="center">${backUbotBtn}</td></tr>` +
    `<tr><td>🛡️ Filter Anti-PM <sub>(shield)</sub></td><td>${session?.anti_pm === 1 ? '🟢 Aktif <sup>[ON]</sup>' : '🔴 Nonaktif <sup>[OFF]</sup>'}</td><td align="center">Spam Shield</td></tr>` +
    `<tr><td>🤖 Auto-Reply AFK <sub>(status)</sub></td><td>${session?.auto_reply === 1 ? '🟢 Aktif <sup>[ON]</sup>' : '🔴 Nonaktif <sup>[OFF]</sup>'}</td><td align="center">Auto-Reply</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Panduan Indikator Latensi:</h3>` +
    `<ul>` +
    `<li><b>&lt; 50 ms</b>: Sangat Cepat (Respon bot instan)</li>` +
    `<li><b>50 - 150 ms</b>: Normal (Kecepatan standar jaringan MTProto Telegram)</li>` +
    `<li><b>&gt; 200 ms</b>: Lambat (Beban jaringan atau antrean di Datacenter Telegram)</li>` +
    `</ul>` +
    (isRunning
      ? `<footer>✅ Koneksi userbot berjalan lancar dan siap mengeksekusi perintah secara instan.</footer>`
      : `<footer>⚠️ Userbot sedang mati. Gunakan tombol Hidupkan Userbot di bawah untuk menyalakan.</footer>`);
}

export function panelTermsOfService(ctx) {
  const firstName = ctx.from?.first_name || 'User';
  return {
    blocks: [
      {
        type: 'paragraph',
        text: `📜 Syarat & Ketentuan Layanan\n\nHalo, ${firstName}!\nSebelum menghubungkan akun Telegram Anda ke platform DeltaUserJS, mohon baca dan pahami ketentuan berikut:`
      },
      {
        type: 'details',
        summary: '📋 Rincian 4 Poin Ketentuan Layanan',
        blocks: [
          {
            type: 'table',
            is_compact: true,
            cells: [
              [{ text: 'Poin Ketentuan' }, { text: 'Penjelasan' }],
              [{ text: '🔐 Keamanan Sesi' }, { text: 'Sesi login Anda dienkripsi aman. Jangan pernah membagikan OTP / Session kepada pihak mana pun.' }],
              [{ text: '⚖️ Tanggung Jawab' }, { text: 'Penggunaan userbot sepenuhnya tanggung jawab pemilik akun. Hindari spamming liar atau pelanggaran ToS Telegram.' }],
              [{ text: '🛡️ Batasan Server' }, { text: 'Pengembang tidak bertanggung jawab atas pembatasan (limit/flood) nomor akibat spam pengguna.' }],
              [{ text: '🗑️ Hak Akses & Sesi' }, { text: 'Anda berhak menghentikan userbot atau menghapus sesi login kapan saja melalui dashboard.' }]
            ]
          }
        ]
      },
      { type: 'divider' },
      {
        type: 'paragraph',
        text: '⚠️ Pernyataan Persetujuan:\nDengan menekan tombol persetujuan di bawah, Anda menyatakan telah membaca, memahami, dan mematuhi seluruh syarat dan ketentuan layanan di atas.'
      },
      {
        type: 'buttons',
        buttons: [
          { text: '✅ Saya Setuju & Lanjutkan', style: 'success', callback_data: 'rich:tos_agree' }
        ]
      },
      {
        type: 'buttons',
        buttons: [
          { text: '❌ Tolak & Batal', style: 'danger', callback_data: 'rich:tos_decline' }
        ]
      },
      {
        type: 'footer',
        text: 'Silakan tentukan persetujuan Anda di atas untuk melanjutkan pendaftaran.'
      }
    ]
  };
}

export function panelTermsDeclined(ctx) {
  const firstName = ctx.from?.first_name || 'User';
  return {
    blocks: [
      {
        type: 'paragraph',
        text: `❌ Pendaftaran Dibatalkan\n\nHalo, ${firstName}.\nAnda telah menolak Syarat & Ketentuan Layanan. Akun Telegram Anda tidak akan dihubungkan ke server.`
      },
      { type: 'divider' },
      {
        type: 'paragraph',
        text: 'ℹ️ Informasi Penting:\nPersetujuan syarat & ketentuan diperlukan demi keamanan bersama dan mencegah penyalahgunaan platform. Anda tetap dapat menjelajahi menu publik bot.'
      },
      {
        type: 'buttons',
        buttons: [
          { text: '🔄 Baca Ulang Ketentuan', style: 'primary', callback_data: 'rich:tos_view' }
        ]
      },
      {
        type: 'buttons',
        buttons: [
          { text: '🔙 Menu Utama', callback_data: 'rich:main' }
        ]
      },
      {
        type: 'footer',
        text: 'Jika berubah pikiran, Anda dapat membaca ulang ketentuan kapan saja untuk melanjutkan pendaftaran.'
      }
    ]
  };
}

export function panelDangerDelete(ctx?: any) {
  const firstName = ctx?.from?.first_name || 'User';
  return {
    blocks: [
      {
        type: 'paragraph',
        text: `⚠️ KONFIRMASI PENGHAPUSAN SESI AKUN\n\nHalo, ${firstName}!\nAnda meminta untuk menghapus sesi userbot Telegram Anda secara permanen dari server.`
      },
      {
        type: 'details',
        summary: '📋 Rincian Konsekuensi Penghapusan Sesi',
        blocks: [
          {
            type: 'table',
            is_compact: true,
            cells: [
              [{ text: 'Konsekuensi' }, { text: 'Keterangan' }],
              [{ text: '🔌 Koneksi MTProto' }, { text: 'Userbot otomatis dimatikan dan logout dari Datacenter Telegram.' }],
              [{ text: '🔐 String Sesi' }, { text: 'Session string akun di database MongoDB akan dihapus permanen.' }],
              [{ text: '⚙️ Konfigurasi Akun' }, { text: 'Seluruh variabel kustom (PREFIX, AFK, Anti-PM) akan di-reset.' }],
              [{ text: '💡 Berhenti Sementara' }, { text: 'Gunakan tombol Matikan Userbot jika hanya ingin berhenti sementara.' }]
            ]
          }
        ]
      },
      { type: 'divider' },
      {
        type: 'paragraph',
        text: '🚨 Peringatan Keamanan:\nTindakan ini tidak dapat dibatalkan. Jika Anda ingin menggunakan bot lagi nantinya, Anda wajib login ulang via Scan QR atau OTP.'
      },
      {
        type: 'buttons',
        buttons: [
          { text: '🗑️ Ya, Hapus Sesi Akun Permanen', style: 'danger', callback_data: 'rich:confirm_delete_session' }
        ]
      },
      {
        type: 'buttons',
        buttons: [
          { text: '❌ Batalkan & Kembali ke Pengaturan', style: 'primary', callback_data: 'rich:settings' }
        ]
      },
      {
        type: 'footer',
        text: 'Pilih salah satu tombol tindakan di atas.'
      }
    ]
  };
}

export function panelRegister(ctx) {
  const claimed = hasClaimedTrial(ctx.from.id);
  const statusTrial = claimed ? 'Sudah Diklaim <sup>[USED]</sup>' : '🎁 Gratis 7 Hari <sup>[FREE]</sup>';
  return `<h1 align="center">🚀 Daftar Userbot Telegram <sup>ONBOARDING</sup></h1>` +
    `<p>Halo, <b>${escapeHtml(ctx.from.first_name || 'User')}</b>! Pilih metode login untuk mengaktifkan userbot Anda.</p>` +
    `<table bordered striped>` +
    `<tr><th>Metode Login</th><th>Keterangan</th><th>Trial</th></tr>` +
    `<tr><td>📱 OTP Telegram <sub>(SMS/App)</sub></td><td>Kode verifikasi via SMS / App</td><td align="center">${statusTrial}</td></tr>` +
    `<tr><td>🔍 Scan QR Code <sub>(Settings)</sub></td><td>Pindai via Settings &gt; Devices</td><td align="center">${statusTrial}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>🛡️ Jaminan Keamanan:</h3>` +
    `<ul>` +
    `<li>Sesi dienkripsi AES-256 aman di database cluster.</li>` +
    `<li>Anda dapat membatalkan pendaftaran kapan pun dengan tombol Batal atau ketik /cancel.</li>` +
    `<li>Anda dapat menghapus sesi kapan saja melalui menu Pengaturan.</li>` +
    `</ul>` +
    `<footer>Ketuk salah satu metode di bawah untuk mulai masuk.</footer>`;
}

function getSystemVarValue(key: string, fallback: string): string {
  return String((systemConfigCache.vars as Record<string, unknown>)?.[key] ?? '') || fallback;
}
function getSystemVarNum(key: string, fallback: number): number {
  return Number((systemConfigCache.vars as Record<string, unknown>)?.[key]) || fallback;
}

export function panelSubscription(ctx?: any) {
  const premiumDays = getSystemVarNum('SUBSCRIPTION_DAYS', 30);
  const trialDays = getSystemVarNum('TRIAL_DAYS', 7);
  const userId = ctx?.from?.id;
  const owner = isOwner(ctx);
  const session = userId ? getUserbotSession(userId) : null;

  const packagesTable = `<table bordered striped><caption>✨ Pilihan Paket &amp; Tarif Langganan VIP</caption>` +
    `<tr><th>Pilihan Paket</th><th>Durasi</th><th>Investasi</th><th>Keterangan</th></tr>` +
    `<tr><td>🎁 Coba Gratis <sub>(trial)</sub></td><td align="center">${trialDays} Hari</td><td align="center">Rp 0 <sup>Free</sup></td><td>Akses awal coba fitur</td></tr>` +
    `<tr><td>💎 Premium Bulanan <sub>(starter)</sub></td><td align="center">${premiumDays} Hari</td><td align="center">Rp 50.000</td><td>Full akses 30 hari</td></tr>` +
    `<tr><td>🚀 Paket Triwulanan <sub>(hemat)</sub></td><td align="center">90 Hari</td><td align="center">Rp 135.000</td><td>Diskon 10% (3 bulan)</td></tr>` +
    `<tr><td>👑 Paket Tahunan <sub>(hemat)</sub></td><td align="center">365 Hari</td><td align="center">Rp 480.000</td><td>Diskon 20% (1 tahun)</td></tr>` +
    `<tr><td>♾️ Lifetime VIP <sub>(permanen)</sub></td><td align="center">Selamanya</td><td align="center">Rp 1.500.000</td><td>Bayar sekali selamanya</td></tr>` +
    `<tr><td>🎟️ Kupon Promo <sub>(voucher)</sub></td><td align="center">Variatif</td><td align="center">Gratis</td><td>Tukar kode voucher promo</td></tr>` +
    `</table>`;

  // 1. Tampilan Khusus OWNER / SUPERADMIN
  if (owner) {
    const running = userId ? userbotManager.isRunning(userId) : false;
    const ubot = userId ? userbotManager.clients.get(userId) : null;
    const isConnected = running && Boolean(ubot?.client?.connected);
    const connStatus = running
      ? (isConnected ? '🟢 Online <sup>[RUNNING]</sup>' : '🟡 Menghubungkan...')
      : (session ? '🔴 Offline <sup>[STOPPED]</sup>' : '⚪ Belum Ditautkan <sup>[IDLE]</sup>');
    const phoneText = session?.phone
      ? `<tg-spoiler>${session.phone.startsWith('+') ? session.phone : `+${session.phone}`}</tg-spoiler>`
      : (session ? '<i>Terhubung</i>' : '<i>Belum Ada Sesi</i>');

    return `<h1 align="center">👑 Status Akses &amp; Langganan <sup>OWNER</sup></h1>` +
      `<p>Akun Anda terdaftar sebagai <b>Owner / Superadmin</b> dengan hak akses penuh, prioritas server tertinggi, dan tanpa batasan durasi.</p>` +
      `<table bordered striped><caption>📋 Kartu Status Langganan &amp; Akses</caption>` +
      `<tr><th>Parameter Akun</th><th>Informasi / Status</th></tr>` +
      `<tr><td>🆔 ID Telegram <sub>(UID)</sub></td><td align="center"><code>${userId || 'Root'}</code></td></tr>` +
      `<tr><td>👑 Tingkat Akses <sub>(tier)</sub></td><td align="center">👑 Owner <sup>[ROOT]</sup></td></tr>` +
      `<tr><td>⏱️ Masa Aktif <sub>(durasi)</sub></td><td align="center">♾️ Unlimited <sup>[PERMANEN]</sup></td></tr>` +
      `<tr><td>⚡ Status Mesin <sub>(engine)</sub></td><td align="center">${connStatus}</td></tr>` +
      `<tr><td>📱 Akun Userbot <sub>(session)</sub></td><td align="center">${phoneText}</td></tr>` +
      `</table>` +
      packagesTable +
      `<hr/>` +
      `<details>` +
      `<summary>✨ Fasilitas Eksklusif Akun Owner</summary>` +
      `<ul>` +
      `<li><b>Akses Permanen:</b> Tidak terikat batas kedaluwarsa sistem.</li>` +
      `<li><b>Server Prioritas:</b> Latensi rendah &amp; alokasi memori dedicated Teleproto.</li>` +
      `<li><b>Pusat Kendali Sistem:</b> Akses penuh ke Panel Admin Command Center &amp; audit log.</li>` +
      `<li><b>Manajemen Fleet:</b> Pantau dan kelola seluruh userbot yang aktif di sistem.</li>` +
      `<li><b>Generator Voucher:</b> Buat dan terbitkan kupon promo durasi untuk pengguna.</li>` +
      `</ul>` +
      `</details>` +
      `<footer>Gunakan tombol di bawah untuk membuka menu beli paket, tukar voucher, atau dashboard.</footer>`;
  }

  // 2. Tampilan Pengguna Terdaftar (Mempunyai Sesi Userbot)
  if (session) {
    const running = userId ? userbotManager.isRunning(userId) : false;
    const ubot = userId ? userbotManager.clients.get(userId) : null;
    const isConnected = running && Boolean(ubot?.client?.connected);
    const connStatus = running
      ? (isConnected ? '🟢 Online <sup>[RUNNING]</sup>' : '🟡 Menghubungkan...')
      : '🔴 Offline <sup>[STOPPED]</sup>';
    const phoneText = session.phone
      ? `<tg-spoiler>${session.phone.startsWith('+') ? session.phone : `+${session.phone}`}</tg-spoiler>`
      : '<i>Terhubung</i>';

    const expDate = session.expired_at ? new Date(session.expired_at) : null;
    const isUnlimited = !expDate || Number.isNaN(expDate.getTime());
    const diffDays = expDate && !isUnlimited ? Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999;
    const isExpired = !isUnlimited && diffDays <= 0;

    const tierText = isExpired
      ? '🔴 VIP Kedaluwarsa <sup>[EXPIRED]</sup>'
      : (isUnlimited ? '♾️ Unlimited VIP <sup>[ACTIVE]</sup>' : '💎 VIP Member <sup>[ACTIVE]</sup>');

    const durationText = isExpired
      ? `⚠️ Kedaluwarsa <sub>(${expDate!.toLocaleDateString('id-ID')})</sub>`
      : (isUnlimited ? '♾️ Unlimited <sup>[LIFETIME]</sup>' : `${expDate!.toLocaleDateString('id-ID')} <sub>(${diffDays} hari tersisa)</sub>`);

    const headingTitle = isExpired
      ? `<h1 align="center">⚠️ Masa Aktif Berakhir <sup>EXPIRED</sup></h1>`
      : `<h1 align="center">💎 Status Langganan &amp; Masa Aktif <sup>VIP</sup></h1>`;

    const subText = isExpired
      ? `<p>Masa aktif VIP akun Anda telah berakhir. Beli perpanjangan atau tukar kode voucher promo untuk mengaktifkan kembali mesin userbot.</p>`
      : `<p>Akun userbot Anda aktif dan terhubung ke server cloud DeltaUserJS dengan fitur lengkap.</p>`;

    return headingTitle +
      subText +
      `<table bordered striped><caption>📋 Kartu Status Langganan &amp; Akses</caption>` +
      `<tr><th>Parameter Akun</th><th>Informasi / Status</th></tr>` +
      `<tr><td>🆔 ID Telegram <sub>(UID)</sub></td><td align="center"><code>${userId}</code></td></tr>` +
      `<tr><td>💎 Status Paket <sub>(tier)</sub></td><td align="center">${tierText}</td></tr>` +
      `<tr><td>⏱️ Masa Aktif <sub>(durasi)</sub></td><td align="center">${durationText}</td></tr>` +
      `<tr><td>⚡ Status Mesin <sub>(engine)</sub></td><td align="center">${connStatus}</td></tr>` +
      `<tr><td>📱 Nomor Telepon <sub>(phone)</sub></td><td align="center">${phoneText}</td></tr>` +
      `</table>` +
      packagesTable +
      `<hr/>` +
      `<details>` +
      `<summary>✨ Keuntungan &amp; Fasilitas VIP Member</summary>` +
      `<ul>` +
      `<li><b>Semua Modul Aktif:</b> Akses ke ${loadedPlugins.length} pustaka modul perintah userbot.</li>` +
      `<li><b>Anti-PM &amp; Auto-AFK:</b> Perlindungan spam dan balasan otomatis 24/7.</li>` +
      `<li><b>Auto-Loop Broadcast:</b> Penjadwalan pesan otomatis ke grup/channel.</li>` +
      `<li><b>FloodGuard Hybrid:</b> Proteksi pintar terhadap pembatasan akun Telegram.</li>` +
      `<li><b>Server Cloud 24/7:</b> Userbot terus online walau aplikasi Telegram ditutup.</li>` +
      `</ul>` +
      `</details>` +
      `<footer>Gunakan tombol di bawah untuk membeli paket VIP, menukar voucher, atau kembali ke dashboard.</footer>`;
  }

  // 3. Tampilan Pengguna Tamu / Belum Punya Sesi Userbot
  return `<h1 align="center">💎 Paket Langganan &amp; Voucher <sup>VIP</sup></h1>` +
    `<p>Dapatkan akses penuh ke fitur userbot tanpa batas, prioritas server berkecepatan tinggi, dan penukaran kupon promo.</p>` +
    packagesTable +
    `<hr/>` +
    `<h3>💡 Punya Kode Voucher Promo?</h3>` +
    `<p>Jika Anda memiliki voucher dari owner atau promo spesial, gunakan tombol <b>🎟️ Tukar Kode Voucher Promo</b> di bawah untuk langsung mengaktifkan akun.</p>` +
    `<details>` +
    `<summary>📋 Langkah Memulai DeltaUserJS</summary>` +
    `<ul>` +
    `<li><b>1. Dapatkan Izin Akses:</b> Klaim coba gratis atau ajukan permohonan ke owner.</li>` +
    `<li><b>2. Hubungkan Sesi Akun:</b> Login mudah via scan QR Code atau kode OTP.</li>` +
    `<li><b>3. Nikmati Fitur Lengkap:</b> Langsung gunakan puluhan modul perintah otomatis.</li>` +
    `</ul>` +
    `</details>` +
    `<footer>Pilih salah satu menu di bawah untuk melanjutkan:</footer>`;
}

export function panelBuySubscription(_ctx?: any) {
  const premiumDays = getSystemVarNum('SUBSCRIPTION_DAYS', 30);
  const trialDays = getSystemVarNum('TRIAL_DAYS', 7);

  return `<h1 align="center">🛒 Beli &amp; Perpanjang Langganan <sup>VIP</sup></h1>` +
    `<p>Pilih paket langganan <b>DeltaUserJS</b> untuk mendapatkan akses penuh tanpa batasan modul, server prioritas berkecepatan tinggi, dan proteksi cloud 24/7.</p>` +
    `<table bordered striped><caption>✨ Daftar Paket &amp; Tarif Langganan</caption>` +
    `<tr><th>Paket VIP</th><th>Durasi</th><th>Investasi</th><th>Keterangan</th></tr>` +
    `<tr><td>🎁 Coba Gratis <sub>(trial)</sub></td><td align="center">${trialDays} Hari</td><td align="center">Rp 0 <sup>Free</sup></td><td>Akses awal coba fitur</td></tr>` +
    `<tr><td>💎 Premium Bulanan <sub>(starter)</sub></td><td align="center">${premiumDays} Hari</td><td align="center">Rp 50.000</td><td>Full akses 30 hari</td></tr>` +
    `<tr><td>🚀 Paket Triwulanan <sub>(hemat)</sub></td><td align="center">90 Hari</td><td align="center">Rp 135.000</td><td>Diskon 10% (3 bulan)</td></tr>` +
    `<tr><td>👑 Paket Tahunan <sub>(hemat)</sub></td><td align="center">365 Hari</td><td align="center">Rp 480.000</td><td>Diskon 20% (1 tahun)</td></tr>` +
    `<tr><td>♾️ Lifetime VIP <sub>(permanen)</sub></td><td align="center">Selamanya</td><td align="center">Rp 1.500.000</td><td>Bayar sekali selamanya</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Pilihan Cara Aktivasi / Pembelian:</h3>` +
    `<ul>` +
    `<li><b>Kupon / Voucher Promo:</b> Jika Anda memiliki kode voucher, tekan tombol <b>🎟️ Tukar Kode Promo</b> di bawah untuk langsung aktif instan tanpa biaya.</li>` +
    `<li><b>Transfer Bank / e-Wallet (QRIS):</b> Tekan tombol <b>💬 Hubungi Owner untuk Order</b> atau <b>💰 Info Rekening Pembayaran</b> untuk konfirmasi dan aktivasi langsung.</li>` +
    `<li><b>Garansi Aktif 24/7:</b> Userbot langsung menyala di server cloud dan siap digunakan.</li>` +
    `</ul>` +
    `<footer>Tekan tombol di bawah untuk memilih opsi pemesanan atau kembali:</footer>`;
}

export function panelAccessDenied(ctx) {
  const trialDays = getSystemVarNum('TRIAL_DAYS', 7);
  const pending = isPendingApproval(ctx.from.id);
  const statusText = pending ? '🕐 Menunggu Approval Owner <sup>[PENDING]</sup>' : '🔴 Belum Disetujui <sup>[LOCKED]</sup>';
  return `<h1 align="center">🔒 Akses Belum Disetujui <sup>RESTRICTED</sup></h1>` +
    `<p>Pendaftaran userbot memerlukan persetujuan dari owner.</p>` +
    `<table bordered striped>` +
    `<tr><th>Informasi Akun</th><th>Status</th></tr>` +
    `<tr><td>ID Telegram <sub>(UID)</sub></td><td align="center"><code>${ctx.from.id}</code></td></tr>` +
    `<tr><td>Status Akses <sub>(izin)</sub></td><td align="center">${statusText}</td></tr>` +
    `<tr><td>Uji Coba Gratis <sub>(trial)</sub></td><td align="center">${trialDays} Hari <sup>Free</sup></td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Cara Mendapatkan Akses:</h3>` +
    `<p>Tekan tombol <b>🎁 Request Coba Gratis</b> di bawah untuk mengirimkan permohonan ke owner. Begitu disetujui, Anda dapat langsung login via scan QR code atau OTP.</p>` +
    `<footer>Silakan pilih menu di bawah:</footer>`;
}

export function keyboardAccessDenied(ctx) {
  const pending = isPendingApproval(ctx.from.id);
  const rows = [];
  if (pending) {
    rows.push([{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }]);
  } else {
    rows.push([{ text: '🎁 Request Coba Gratis', callback_data: 'rich:claim_trial' }]);
  }
  rows.push([{ text: '🔙 Menu Utama', callback_data: 'rich:main' }]);
  return { inline_keyboard: rows };
}

const ADMIN_USERS_PER_PAGE = 6;

export interface CombinedAdminUser {
  telegram_id: number;
  custom_name?: string;
  username?: string;
  is_active: number;
  is_awaiting_reg: boolean;
  expired_at?: string | null;
  approved_at?: number;
}

export function getCombinedAdminUsers(): CombinedAdminUser[] {
  const registeredUsers = getAllRegisteredUsers();
  const registeredIds = new Set(registeredUsers.map(u => Number(u.telegram_id)));

  const awaitingUsers: CombinedAdminUser[] = getApprovedUsers()
    .filter(id => !registeredIds.has(Number(id)))
    .map(id => {
      const meta = getApprovedUserMeta(id);
      return {
        telegram_id: id,
        custom_name: meta?.name || 'Calon User',
        username: meta?.username,
        is_active: 1,
        is_awaiting_reg: true,
        approved_at: meta?.approvedAt,
      };
    });

  const registeredFormatted: CombinedAdminUser[] = registeredUsers.map(u => ({
    telegram_id: u.telegram_id,
    custom_name: u.custom_name,
    username: (u as any).username,
    is_active: u.is_active,
    is_awaiting_reg: false,
    expired_at: u.expired_at,
  }));

  return [...registeredFormatted, ...awaitingUsers];
}

export function panelAdmin(_ctx) {
  const registeredUsers = getAllRegisteredUsers();
  const registeredIds = new Set(registeredUsers.map(u => Number(u.telegram_id)));
  const awaitingCount = getApprovedUsers().filter(id => !registeredIds.has(Number(id))).length;
  const totalUsers = registeredUsers.length + awaitingCount;
  const running = userbotManager.clients.size;
  const pending = getPendingApprovals();
  const vouchers = getAllVouchers();
  const mem = process.memoryUsage();
  const uptimeMin = Math.round(process.uptime() / 60);

  const pendingBtn = `<tg-button type="callback_data" data="rich:admin_pending">${pending.length > 0 ? `⏳ Review (${pending.length})` : '🔍 Cek'}</tg-button>`;
  const usersBtn = `<tg-button type="callback_data" data="rich:admin_users:1">👥 Kelola</tg-button>`;
  const fleetBtn = `<tg-button type="callback_data" data="rich:admin_fleet">⚡ Kontrol</tg-button>`;
  const voucherBtn = `<tg-button type="callback_data" data="rich:admin_vouchers:1">🎟️ Kelola</tg-button>`;
  const healthBtn = `<tg-button type="callback_data" data="rich:health">🩺 Health</tg-button>`;
  const subsBtn = `<tg-button type="callback_data" data="rich:admin_subs">💳 Billing</tg-button>`;
  const backupBtn = `<tg-button type="callback_data" data="rich:admin_backup">💾 Backup</tg-button>`;

  const userMetricsStr = awaitingCount > 0
    ? `<b>${totalUsers}</b> Akun (${registeredUsers.length} Sesi, ${awaitingCount} Siap Login)`
    : `<b>${registeredUsers.length}</b> Sesi`;

  return `<h1 align="center">👑 Admin Command Center <sup>ROOT</sup></h1>` +
    `<p>Pusat kendali operasional, manajemen armada userbot, dan pemeliharaan platform.</p>` +
    `<table bordered striped><caption>📊 Metrik Real-Time &amp; Aksi Cepat</caption>` +
    `<tr><th>Komponen Sistem</th><th>Metrik / Nilai</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>👥 Total Pengguna <sub>(users)</sub></td><td align="center">${userMetricsStr}</td><td align="center">${usersBtn}</td></tr>` +
    `<tr><td>⚡ Userbot Aktif <sub>(fleet)</sub></td><td align="center"><b>${running}</b> Client Running <sup>[ONLINE]</sup></td><td align="center">${fleetBtn}</td></tr>` +
    `<tr><td>⏳ Antrean Approval <sub>(pending)</sub></td><td align="center"><b>${pending.length}</b> Menunggu <sup>[QUEUE]</sup></td><td align="center">${pendingBtn}</td></tr>` +
    `<tr><td>🎟️ Voucher Promo <sub>(coupons)</sub></td><td align="center"><b>${vouchers.length}</b> Kupon <sup>[ACTIVE]</sup></td><td align="center">${voucherBtn}</td></tr>` +
    `<tr><td>💳 Status Langganan <sub>(billing)</sub></td><td align="center">Metrik Finansial</td><td align="center">${subsBtn}</td></tr>` +
    `<tr><td>💾 Backup &amp; Audit <sub>(database)</sub></td><td align="center">MongoDB Cluster</td><td align="center">${backupBtn}</td></tr>` +
    `<tr><td>🩺 Kesehatan Server <sub>(health)</sub></td><td align="center">${uptimeMin}m · ${formatBytesRef(mem.rss)}</td><td align="center">${healthBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Status Lingkungan Runtime:</h3>` +
    `<ul>` +
    `<li>Engine: <b>Teleproto Layer 229</b> (${loadedPlugins.length} Plugin Dimuat)</li>` +
    `<li>Node.js: <code>${process.version}</code> · PID <code>${process.pid}</code></li>` +
    `<li>Alokasi RAM (Heap): ${formatBytesRef(mem.heapUsed)} / ${formatBytesRef(mem.heapTotal)}</li>` +
    `</ul>` +
    `<footer>Ketuk tombol aksi di tabel atau pilih menu di bawah:</footer>`;
}

export function panelAdminPending() {
  const pendingList = getPendingApprovals();
  if (pendingList.length === 0) {
    return `<h1 align="center">⏳ Antrean Approval <sup>PENDING</sup></h1>` +
      `<p>Tidak ada permohonan coba gratis yang menunggu persetujuan saat ini.</p>` +
      `<footer>Semua permohonan sudah diproses atau belum ada user baru yang mengajukan.</footer>`;
  }

  const rows = pendingList.map(p => {
    const timeStr = new Date(p.requestedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
    const userLabel = p.username ? `@${escapeHtml(p.username)}` : escapeHtml(p.name);
    const approveBtn = `<tg-button type="callback_data" data="rich:admin_apprv:${p.userId}">✅ Terima</tg-button>`;
    const rejectBtn = `<tg-button type="callback_data" data="rich:admin_rjct:${p.userId}">❌ Tolak</tg-button>`;
    return `<tr><td><code>${p.userId}</code></td><td>${userLabel}</td><td align="center">${timeStr}</td><td align="center">${approveBtn} ${rejectBtn}</td></tr>`;
  }).join('');

  return `<h1 align="center">⏳ Antrean Approval <sup>[${pendingList.length}]</sup></h1>` +
    `<p>Daftar pengguna yang mengajukan permohonan coba gratis 7 Hari:</p>` +
    `<table bordered striped><caption>📋 Permohonan Masuk</caption>` +
    `<tr><th>ID Pemohon</th><th>Nama / Username</th><th align="center">Waktu</th><th align="center">Aksi Cepat</th></tr>` +
    rows +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Catatan Approval:</h3>` +
    `<p>Pengguna yang disetujui akan otomatis mendapatkan durasi coba gratis <b>7 Hari</b> dan dapat langsung login via QR Code atau OTP.</p>` +
    `<footer>Ketuk tombol aksi di baris tabel untuk memproses permohonan.</footer>`;
}

export function panelAdminUsers(page = 1) {
  const allUsers = getCombinedAdminUsers();
  const registeredCount = allUsers.filter(u => !u.is_awaiting_reg).length;
  const awaitingCount = allUsers.filter(u => u.is_awaiting_reg).length;
  const totalPages = Math.max(1, Math.ceil(allUsers.length / ADMIN_USERS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * ADMIN_USERS_PER_PAGE;
  const currentUsers = allUsers.slice(start, start + ADMIN_USERS_PER_PAGE);

  const rows = currentUsers.map(u => {
    if (u.is_awaiting_reg) {
      const status = '🔵 Siap <sup>[WAIT]</sup>';
      const name = escapeHtml(u.custom_name || 'Calon User');
      const expiry = '⏳ Belum Login';
      const detailBtn = `<tg-button type="callback_data" data="rich:admin_user:${u.telegram_id}">🔍 Buka</tg-button>`;
      return `<tr><td align="center">${status}</td><td><code>${u.telegram_id}</code></td><td>${name}</td><td align="center">${expiry}</td><td align="center">${detailBtn}</td></tr>`;
    }

    const running = userbotManager.isRunning(u.telegram_id);
    const status = running ? '🟢 On <sup>[RUN]</sup>' : (u.is_active === 1 ? '🟡 Off <sup>[IDLE]</sup>' : '🔴 Revoked <sup>[OFF]</sup>');
    const name = u.custom_name ? escapeHtml(u.custom_name) : 'User';
    const expiry = u.expired_at ? new Date(u.expired_at).toLocaleDateString('id-ID') : '♾️ <sup>Unlim</sup>';
    const detailBtn = `<tg-button type="callback_data" data="rich:admin_user:${u.telegram_id}">🔍 Buka</tg-button>`;
    return `<tr><td align="center">${status}</td><td><code>${u.telegram_id}</code></td><td>${name}</td><td align="center">${expiry}</td><td align="center">${detailBtn}</td></tr>`;
  }).join('') || '<tr><td colspan="5" align="center">Belum ada user</td></tr>';

  const summaryBadge = awaitingCount > 0
    ? ` (${registeredCount} sesi aktif, ${awaitingCount} siap login)`
    : '';

  return `<h1 align="center">👥 Manajemen Pengguna <sup>DIRECTORY</sup></h1>` +
    `<p>Total terdaftar: <b>${allUsers.length}</b> akun${summaryBadge} &bull; Halaman <sup>${currentPage}/${totalPages}</sup></p>` +
    `<table bordered striped><caption>📋 Direktori Akun Userbot</caption>` +
    `<tr><th>Status</th><th>ID Telegram</th><th>Nama Akun</th><th>Expired</th><th align="center">Aksi</th></tr>` +
    rows +
    `</table>` +
    `<hr/>` +
    `<h3>ℹ️ Keterangan Status Akun:</h3>` +
    `<ul>` +
    `<li>🟢 <b>On</b>: Userbot sedang aktif berjalan.</li>` +
    `<li>🟡 <b>Off</b>: Sesi terdaftar namun bot dimatikan.</li>` +
    `<li>🔵 <b>Siap</b>: Sudah disetujui owner, belum menautkan nomor/QR Telegram.</li>` +
    `<li>🔴 <b>Revoked</b>: Izin dinonaktifkan oleh owner.</li>` +
    `</ul>` +
    `<footer>Ketuk <b>🔍 Buka</b> pada baris akun untuk menginspeksi konfigurasi atau mencabut izin:</footer>`;
}

export function panelAdminUserDetail(targetId: number) {
  const session = getUserbotSession(targetId);
  if (!session) {
    if (isApproved(targetId)) {
      const meta = getApprovedUserMeta(targetId);
      const name = meta?.name || 'Calon Pengguna';
      const uname = meta?.username ? `@${meta.username}` : '<i>Tidak diset</i>';
      const approvedAtStr = meta?.approvedAt
        ? new Date(meta.approvedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
        : '<i>Baru saja</i>';
      const revokeBtn = `<tg-button type="callback_data" data="rich:admin_revoke_user:${targetId}">🚫 Cabut Izin</tg-button>`;

      return `<h1 align="center">👤 Detail Calon User: ${escapeHtml(name)} <sup>APPROVAL</sup></h1>` +
        `<p>Akun ini <b>telah disetujui (Approved)</b> oleh Owner, tetapi <b>belum menghubungkan sesi userbot</b> (belum login via OTP atau Scan QR).</p>` +
        `<table bordered striped><caption>ℹ️ Status Izin &amp; Akses</caption>` +
        `<tr><th>Parameter Akun</th><th>Nilai / Status</th><th align="center">Aksi Langsung</th></tr>` +
        `<tr><td>ID Telegram <sub>(UID)</sub></td><td><code>${targetId}</code></td><td align="center">Whitelist</td></tr>` +
        `<tr><td>Username <sub>(handle)</sub></td><td>${uname}</td><td align="center">Telegram</td></tr>` +
        `<tr><td>Status Akses <sub>(izin)</sub></td><td>🔵 Disetujui <sup>[Approved]</sup></td><td align="center">Approved</td></tr>` +
        `<tr><td>Sesi Userbot <sub>(session)</sub></td><td>⚪ Belum Ditautkan</td><td align="center">Scan QR / OTP</td></tr>` +
        `<tr><td>Waktu Disetujui <sub>(timestamp)</sub></td><td>${approvedAtStr}</td><td align="center">Timestamp</td></tr>` +
        `<tr><td>Tindakan Keamanan <sub>(danger)</sub></td><td>Batalkan hak registrasi akun</td><td align="center">${revokeBtn}</td></tr>` +
        `</table>` +
        `<footer>Jika izin dicabut, status akun dikembalikan ke tamu dan pengguna tidak dapat mendaftar tanpa permohonan baru.</footer>`;
    }

    return `<h1 align="center">❌ User Tidak Ditemukan</h1><p>Sesi akun untuk ID <code>${targetId}</code> tidak ditemukan di database.</p><footer>Gunakan tombol di bawah untuk kembali.</footer>`;
  }
  const isRunning = userbotManager.isRunning(targetId);
  const disabledCount = getDisabledPlugins(targetId).length;
  const expStr = session.expired_at ? new Date(session.expired_at).toLocaleDateString('id-ID') : '♾️ <sup>Unlimited</sup>';

  const powerBtn = `<tg-button type="callback_data" data="rich:admin_power_user:${targetId}">${isRunning ? '⏹️ Matikan' : '▶️ Nyalakan'}</tg-button>`;
  const ext7Btn = `<tg-button type="callback_data" data="rich:admin_extend:${targetId}:7">➕ 7H</tg-button>`;
  const ext30Btn = `<tg-button type="callback_data" data="rich:admin_extend:${targetId}:30">➕ 30H</tg-button>`;
  const extInfBtn = `<tg-button type="callback_data" data="rich:admin_extend:${targetId}:0">♾️ Unlim</tg-button>`;
  const revokeBtn = `<tg-button type="callback_data" data="rich:admin_revoke_user:${targetId}">🚫 Revoke</tg-button>`;
  const deleteBtn = `<tg-button type="callback_data" data="rich:admin_delete_user:${targetId}">🗑️ Hapus</tg-button>`;

  return `<h1 align="center">👤 Detail Akun: ${escapeHtml(session.custom_name || String(targetId))} <sup>USER</sup></h1>` +
    `<p>Inspeksi konfigurasi dan kontrol langsung untuk akun userbot ini.</p>` +
    `<table bordered striped><caption>🛠️ Pengaturan &amp; Status Sesi</caption>` +
    `<tr><th>Parameter Akun</th><th>Nilai / Status</th><th align="center">Aksi Langsung</th></tr>` +
    `<tr><td>ID Telegram <sub>(UID)</sub></td><td><code>${targetId}</code></td><td align="center">${powerBtn}</td></tr>` +
    `<tr><td>Nomor Telepon <sub>(phone)</sub></td><td>${session.phone ? `<tg-spoiler>${session.phone}</tg-spoiler>` : '<i>Tidak diset</i>'}</td><td align="center">MTProto</td></tr>` +
    `<tr><td>Status Userbot <sub>(engine)</sub></td><td>${isRunning ? '🟢 Online <sup>[RUNNING]</sup>' : '🔴 Offline <sup>[STOPPED]</sup>'}</td><td align="center">${powerBtn}</td></tr>` +
    `<tr><td>Masa Aktif Akun <sub>(expired)</sub></td><td>${expStr}</td><td align="center">${ext7Btn} ${ext30Btn}</td></tr>` +
    `<tr><td>Paket Unlimited <sub>(akses)</sub></td><td>Akses Permanen</td><td align="center">${extInfBtn}</td></tr>` +
    `<tr><td>Proteksi Anti-PM <sub>(guard)</sub></td><td>${session.anti_pm === 1 ? '🟢 Aktif <sup>[ON]</sup>' : '🔴 Nonaktif <sup>[OFF]</sup>'}</td><td align="center">Shield</td></tr>` +
    `<tr><td>Auto-Reply AFK <sub>(reply)</sub></td><td>${session.auto_reply === 1 ? '🟢 Aktif <sup>[ON]</sup>' : '🔴 Nonaktif <sup>[OFF]</sup>'}</td><td align="center">Auto</td></tr>` +
    `<tr><td>Plugin Dinonaktifkan <sub>(plugin)</sub></td><td>${disabledCount} Modul</td><td align="center">Studio</td></tr>` +
    `<tr><td>Tindakan Keamanan <sub>(danger)</sub></td><td>Izin &amp; Basis Data</td><td align="center">${revokeBtn} ${deleteBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Panduan Aksi Administrator:</h3>` +
    `<ul>` +
    `<li><b>➕ 7H / ➕ 30H</b>: Perpanjang masa aktif akun secara bertahap.</li>` +
    `<li><b>♾️ Unlim</b>: Berikan akses unlimited permanen.</li>` +
    `<li><b>🚫 Revoke</b>: Cabut akses dan matikan userbot.</li>` +
    `<li><b>🗑️ Hapus</b>: Hapus sesi userbot secara permanen dari database.</li>` +
    `</ul>` +
    `<footer>Ketuk tombol aksi langsung di tabel atau gunakan tombol di bawah:</footer>`;
}

export function panelAdminBroadcast() {
  const totalUsers = getAllRegisteredUsers().length;
  return `<h1 align="center">📢 Panel Broadcast Pengumuman</h1>` +
    `<p>Kirimkan pengumuman masal ke seluruh pengguna userbot terdaftar.</p>` +
    `<table bordered striped><caption>📢 Parameter Siaran Masal</caption>` +
    `<tr><th>Parameter</th><th>Keterangan</th></tr>` +
    `<tr><td>Total Target</td><td align="center"><b>${totalUsers}</b> Pengguna Terdaftar</td></tr>` +
    `<tr><td>Dukungan Format</td><td align="center">HTML Telegram (b, i, code, quote)</td></tr>` +
    `<tr><td>Kecepatan Pengiriman</td><td align="center">Anti-Flood Delay (100ms)</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>ℹ️ Petunjuk Penggunaan:</h3>` +
    `<p>Tekan tombol <b>📢 Tulis Pesan Broadcast</b> di bawah. Anda akan dipandu untuk memasukkan teks pesan yang ingin disebarkan. Tekan ❌ Batal kapan saja jika ingin membatalkan.</p>` +
    `<footer>Broadcast diproses berurutan secara aman untuk mencegah rate-limit.</footer>`;
}

export function panelAdminFleet() {
  const users = getAllRegisteredUsers();
  const running = userbotManager.clients.size;
  const mem = process.memoryUsage();

  const restartAllBtn = `<tg-button type="callback_data" data="rich:admin_fleet_restart">🔄 Restart Fleet</tg-button>`;
  const stopAllBtn = `<tg-button type="callback_data" data="rich:admin_fleet_stop">🛑 Stop Fleet</tg-button>`;
  const startAllBtn = `<tg-button type="callback_data" data="rich:admin_fleet_start">🚀 Start Fleet</tg-button>`;
  const restartBotBtn = `<tg-button type="callback_data" data="rich:admin_restart_bot">🔄 Restart Master</tg-button>`;

  return `<h1 align="center">⚡ Fleet &amp; Userbot Control <sup>FLEET</sup></h1>` +
    `<p>Operasi massal dan kontrol darurat untuk seluruh client userbot di server.</p>` +
    `<table bordered striped><caption>🚀 Operasi Armada Server</caption>` +
    `<tr><th>Operasi Armada</th><th>Status / Nilai</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>⚡ Userbot Berjalan <sub>(active)</sub></td><td align="center"><b>${running}</b> / ${users.length} Client <sup>[ONLINE]</sup></td><td align="center">${startAllBtn}</td></tr>` +
    `<tr><td>🔄 Restart Massal <sub>(reboot)</sub></td><td align="center">Seluruh Userbot Aktif</td><td align="center">${restartAllBtn}</td></tr>` +
    `<tr><td>🛑 Emergency Stop <sub>(shutdown)</sub></td><td align="center">Matikan Semua Sesi</td><td align="center">${stopAllBtn}</td></tr>` +
    `<tr><td>🤖 Master Bot PM2 <sub>(daemon)</sub></td><td align="center">PID ${process.pid} <sup>[L229]</sup></td><td align="center">${restartBotBtn}</td></tr>` +
    `<tr><td>🧠 Memori RAM <sub>(RSS)</sub></td><td align="center">${formatBytesRef(mem.rss)}</td><td align="center">Server RAM</td></tr>` +
    `<tr><td>⏱️ Uptime Node.js <sub>(uptime)</sub></td><td align="center">${Math.round(process.uptime() / 60)} Menit</td><td align="center">Uptime</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>⚠️ Peringatan Emergency Stop:</h3>` +
    `<p>Menghentikan armada akan memutuskan koneksi seluruh userbot yang sedang berjalan. Anda dapat menyalakannya kembali menggunakan tombol <b>🚀 Start Fleet</b>.</p>` +
    `<footer>Ketuk tombol aksi langsung di tabel atau gunakan tombol di bawah:</footer>`;
}

export async function panelAdminSubs() {
  let stats: any = {
    total: 0, active: 0, expired: 0, trial: 0, grace: 0, totalRevenue: 0,
  };
  try {
    const { getSubscriptionStats } = await import('../../../services/SubscriptionService.js');
    stats = await getSubscriptionStats();
  } catch (_) { /* ignore */ }

  const formattedRev = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(stats.totalRevenue || 0);

  const expiredUsersBtn = `<tg-button type="callback_data" data="rich:admin_expired_users">👥 Lihat (${stats.expired})</tg-button>`;
  const refreshBtn = `<tg-button type="callback_data" data="rich:admin_subs">🔄 Refresh</tg-button>`;

  return `<h1 align="center">💎 Statistik Langganan &amp; Finansial <sup>FINANCE</sup></h1>` +
    `<p>Ringkasan metrik pelanggan, status aktif, dan pendapatan platform.</p>` +
    `<table bordered striped><caption>📊 Analisis Finansial &amp; Akun</caption>` +
    `<tr><th>Kategori Metrik</th><th>Statistik</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>💰 Total Pendapatan <sub>(omset)</sub></td><td align="center"><b>${formattedRev}</b></td><td align="center">Semua Transaksi</td></tr>` +
    `<tr><td>💎 Akun VIP Aktif <sub>(member)</sub></td><td align="center"><b>${stats.active}</b> Akun <sup>[VIP]</sup></td><td align="center">Berlangganan Penuh</td></tr>` +
    `<tr><td>🎁 Akun Trial <sub>(uji coba)</sub></td><td align="center"><b>${stats.trial}</b> Akun <sup>[TRIAL]</sup></td><td align="center">Masa Uji Coba</td></tr>` +
    `<tr><td>⏳ Masa Tenggang <sub>(grace)</sub></td><td align="center"><b>${stats.grace}</b> Akun <sup>[GRACE]</sup></td><td align="center">Grace Period</td></tr>` +
    `<tr><td>🔴 Kedaluwarsa <sub>(expired)</sub></td><td align="center"><b>${stats.expired}</b> Akun <sup>[EXP]</sup></td><td align="center">${expiredUsersBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Keterangan Status Langganan:</h3>` +
    `<ul>` +
    `<li><b>VIP Aktif</b>: Akun yang memiliki durasi langganan berjalan.</li>` +
    `<li><b>Akun Trial</b>: Pengguna dalam masa coba gratis 7 hari.</li>` +
    `<li><b>Masa Tenggang</b>: Akun habis tempo dalam 3 hari terakhir (Grace Period).</li>` +
    `<li><b>Kedaluwarsa</b>: Akun yang masa aktifnya telah habis sepenuhnya.</li>` +
    `</ul>` +
    `<footer>Data diperbarui secara real-time dari riwayat pembayaran. ${refreshBtn}</footer>`;
}

export function panelAdminBackup() {
  const users = getAllRegisteredUsers();

  const downloadBtn = `<tg-button type="callback_data" data="rich:admin_download_backup">📥 Unduh JSON</tg-button>`;
  const auditBtn = `<tg-button type="callback_data" data="rich:admin_view_audit">📜 10 Log Terakhir</tg-button>`;

  return `<h1 align="center">💾 Backup Database &amp; Riwayat Audit <sup>BACKUP</sup></h1>` +
    `<p>Pencadangan database MongoDB dan inspeksi riwayat kepatuhan sistem.</p>` +
    `<table bordered striped><caption>📦 Manajemen Data &amp; Audit</caption>` +
    `<tr><th>Layanan Database</th><th>Status / Nilai</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>📦 Backup MongoDB <sub>(snapshot)</sub></td><td align="center">${users.length} Akun Terdaftar</td><td align="center">${downloadBtn}</td></tr>` +
    `<tr><td>📜 Riwayat Audit <sub>(compliance)</sub></td><td align="center">Log Aktivitas Sistem</td><td align="center">${auditBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>ℹ️ Format Backup:</h3>` +
    `<p>File backup dikirimkan dalam format JSON terstruktur lengkap dengan session string dan custom variables masing-masing userbot. Simpan file ini di tempat aman.</p>` +
    `<footer>Ketuk tombol aksi di tabel atau gunakan tombol di bawah:</footer>`;
}

export function panelAdminSettings() {
  const trialDays = getSystemVarNum('TRIAL_DAYS', 7);
  const vipDays = getSystemVarNum('SUBSCRIPTION_DAYS', 30);
  const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';

  const toggleApproveBtn = `<tg-button type="callback_data" data="rich:admin_toggle_auto_approve">${autoApprove ? '🔒 Ubah ke Manual' : '🌐 Ubah ke Bebas'}</tg-button>`;
  const editVarsBtn = `<tg-button type="callback_data" data="rich:edit_system_vars">✏️ Edit Nilai</tg-button>`;

  return `<h1 align="center">⚙️ Pengaturan Cepat Sistem <sup>CONFIG</sup></h1>` +
    `<p>Konfigurasi parameter global platform tanpa restart server atau edit file .env.</p>` +
    `<table bordered striped><caption>🛠️ Parameter Global Platform</caption>` +
    `<tr><th>Parameter Sistem</th><th>Setelan Saat Ini</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>🛡️ Mode Registrasi <sub>(policy)</sub></td><td align="center"><b>${autoApprove ? '🌐 Buka Bebas <sup>[OPEN]</sup>' : '🔒 Butuh Approval <sup>[LOCK]</sup>'}</b></td><td align="center">${toggleApproveBtn}</td></tr>` +
    `<tr><td>🎁 Durasi Trial Default <sub>(trial)</sub></td><td align="center"><b>${trialDays} Hari <sup>Free</sup></b></td><td align="center">${editVarsBtn}</td></tr>` +
    `<tr><td>💎 Durasi VIP Default <sub>(billing)</sub></td><td align="center"><b>${vipDays} Hari <sup>Akses</sup></b></td><td align="center">${editVarsBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Penjelasan Mode Registrasi:</h3>` +
    `<ul>` +
    `<li><b>🔒 Butuh Approval</b>: Setiap pendaftar baru wajib disetujui owner secara manual sebelum bisa scan QR / OTP.</li>` +
    `<li><b>🌐 Buka Bebas</b>: Pengguna baru langsung dapat mendaftar tanpa menunggu konfirmasi owner.</li>` +
    `</ul>` +
    `<footer>Ketuk tombol aksi di tabel atau gunakan tombol di bawah:</footer>`;
}

export function panelStats(_ctx) {
  const users = getAllRegisteredUsers();
  const running = userbotManager.clients.size;
  const mem = process.memoryUsage();
  return `<h1 align="center">📊 System Analytics <sup>METRICS</sup></h1>` +
    `<p>Ringkasan performa server dan konsumsi memori runtime.</p>` +
    `<table bordered striped>` +
    `<tr><th>Metrik Performa</th><th>Statistik</th><th>Keterangan</th></tr>` +
    `<tr><td>👥 Total Pengguna <sub>(database)</sub></td><td align="center">${users.length} Akun</td><td>Terdaftar di DB</td></tr>` +
    `<tr><td>⚡ Userbot Aktif <sub>(engine)</sub></td><td align="center">${running} Running <sup>[OK]</sup></td><td>Teleproto 229</td></tr>` +
    `<tr><td>⏱️ Server Uptime <sub>(durasi)</sub></td><td align="center">${Math.round(process.uptime() / 60)} Menit</td><td>Node.js Runtime</td></tr>` +
    `<tr><td>💾 RAM Resident <sub>(RSS)</sub></td><td align="center">${formatBytesRef(mem.rss)}</td><td>Total Memori Fisik</td></tr>` +
    `<tr><td>🧠 Heap Memory <sub>(V8)</sub></td><td align="center">${formatBytesRef(mem.heapUsed)} / ${formatBytesRef(mem.heapTotal)}</td><td>Alokasi V8 Engine</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Keterangan Metrik Server:</h3>` +
    `<ul>` +
    `<li><b>Heap Memory</b>: Memori objek JavaScript &amp; cache runtime V8 engine.</li>` +
    `<li><b>RAM RSS</b>: Total penggunaan memori fisik proses Node.js di server VPS.</li>` +
    `<li><b>Teleproto Clients</b>: Seluruh userbot berjalan hemat resource dalam single event loop.</li>` +
    `</ul>` +
    `<footer>Monitoring performa server Node.js &amp; Teleproto Layer 229.</footer>`;
}

const LOOPS_PER_PAGE = 5;

export function panelUserLoops(ctx: any, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter(s => s.type === 'loop');
  const running = userbotManager.isRunning(telegramId);

  const totalPages = Math.max(1, Math.ceil(loops.length / LOOPS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * LOOPS_PER_PAGE;
  const pageItems = loops.slice(start, start + LOOPS_PER_PAGE);

  let rows = '';
  if (pageItems.length === 0) {
    rows = `<tr><td colspan="4" align="center"><i>Belum ada jadwal loop/broadcast yang tersimpan.</i></td></tr>`;
  } else {
    rows = pageItems.map((item, idx) => {
      const num = start + idx + 1;
      const targetStr = escapeHtml(String(item.chatKey));
      const shortMsg = item.message.length > 20
        ? escapeHtml(item.message.substring(0, 20)) + '...'
        : escapeHtml(item.message);
      const encodedTarget = Buffer.from(item.chatKey).toString('hex');
      const delBtn = `<tg-button type="callback_data" data="rich:del_loop:${encodedTarget}">⏹️ Hapus</tg-button>`;
      return `<tr><td><b>${num}.</b> <code>${targetStr}</code></td><td align="center">${item.value}m</td><td><i>"${shortMsg}"</i></td><td align="center">${delBtn}</td></tr>`;
    }).join('');
  }

  const addBtn = `<tg-button type="callback_data" data="rich:add_loop">➕ Tambah Jadwal Baru</tg-button>`;

  return `<h1 align="center">⏰ Visual Broadcast Scheduler <sup>LOOP</sup></h1>` +
    `<p>Jadwal pengiriman pesan berkala otomatis tanpa mengetik perintah manual.</p>` +
    `<table bordered striped><caption>🔁 Jadwal Loop Aktif (${loops.length} Jadwal)</caption>` +
    `<tr><th>Target Chat</th><th align="center">Interval</th><th>Cuplikan Pesan</th><th align="center">Aksi</th></tr>` +
    rows +
    `</table>` +
    `<p align="center">${addBtn}</p>` +
    `<hr/>` +
    `<h3>💡 Panduan &amp; Tips Auto-Loop:</h3>` +
    `<ul>` +
    `<li>Pesan dikirim otomatis setiap interval menit yang ditentukan.</li>` +
    `<li>Seluruh jadwal disimpan permanen di database dan akan dipulihkan otomatis saat userbot direstart.</li>` +
    `<li>Anda juga dapat mengontrol loop langsung dari obrolan manapun menggunakan perintah <code>.loop &lt;menit&gt; &lt;pesan&gt;</code> dan <code>.rmloop</code>.</li>` +
    `</ul>` +
    (running
      ? `<footer>🟢 Userbot online: Jadwal broadcast di atas sedang berjalan otomatis.</footer>`
      : `<footer>🟡 Userbot offline: Jadwal tersimpan dan akan langsung aktif saat userbot dinyalakan.</footer>`);
}

const VOUCHERS_PER_PAGE = 5;

export function panelAdminVouchers(page = 1) {
  const vouchers = getAllVouchers();
  const totalPages = Math.max(1, Math.ceil(vouchers.length / VOUCHERS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * VOUCHERS_PER_PAGE;
  const pageItems = vouchers.slice(start, start + VOUCHERS_PER_PAGE);

  let rows = '';
  if (pageItems.length === 0) {
    rows = `<tr><td colspan="5" align="center"><i>Belum ada voucher promo yang dibuat.</i></td></tr>`;
  } else {
    rows = pageItems.map((v) => {
      const code = escapeHtml(v.code);
      const daysStr = v.days === 0 ? '♾️ Unlimited' : `+${v.days}h`;
      const usesStr = v.max_uses === -1 ? `${v.used_by.length}/♾️` : `${v.used_by.length}/${v.max_uses}`;
      const isExpired = v.expires_at && v.expires_at < Date.now();
      const isFull = v.max_uses !== -1 && v.used_by.length >= v.max_uses;
      const statusBadge = isExpired ? '🔴 Exp' : (isFull ? '🟡 Habis' : '🟢 Aktif');
      const hexCode = Buffer.from(v.code).toString('hex');
      const actionBtns = `<tg-button type="callback_data" data="rich:broadcast_voucher:${hexCode}">📢 Kirim</tg-button> <tg-button type="callback_data" data="rich:del_voucher:${hexCode}">🗑️</tg-button>`;
      return `<tr><td><code>${code}</code></td><td align="center">${daysStr}</td><td align="center">${usesStr}</td><td align="center">${statusBadge}</td><td align="center">${actionBtns}</td></tr>`;
    }).join('');
  }

  const createBtn = `<tg-button type="callback_data" data="rich:admin_new_voucher">➕ Buat Voucher Baru</tg-button>`;

  return `<h1 align="center">🎟️ Kelola Voucher Promo <sup>COUPONS</sup></h1>` +
    `<p>Pusat manajemen kupon promo dan perpanjangan masa aktif userbot.</p>` +
    `<table bordered striped><caption>🎟️ Daftar Voucher (${vouchers.length} Kupon)</caption>` +
    `<tr><th>Kode Voucher</th><th align="center">Durasi</th><th align="center">Kuota</th><th align="center">Status</th><th align="center">Aksi</th></tr>` +
    rows +
    `</table>` +
    `<p align="center">${createBtn}</p>` +
    `<hr/>` +
    `<h3>💡 Ketentuan Kode Voucher:</h3>` +
    `<ul>` +
    `<li><b>Durasi</b>: Memberikan penambahan masa aktif userbot (atau lifetime jika 0 hari).</li>` +
    `<li><b>Auto-Approval</b>: Pengguna baru yang menukarkan kode voucher otomatis di-approve whitelist!</li>` +
    `<li><b>Kuota</b>: Tiap pengguna hanya dapat menukarkan 1 kali per kode unik.</li>` +
    `</ul>` +
    `<footer>Ketuk tombol aksi di tabel atau gunakan tombol navigasi di bawah:</footer>`;
}

export function panelQuickHelp(_ctx) {
  return `<h1 align="center">📚 Pusat Bantuan &amp; Panduan <sup>GUIDE</sup></h1>` +
    `<p>Selamat datang di Pusat Bantuan <b>DeltaUserJS</b>.<br>` +
    `Temukan panduan lengkap, cheatsheet perintah, dan solusi kendala di bawah ini.</p>` +
    `<table bordered striped>` +
    `<tr><th>Topik Bantuan</th><th>Deskripsi</th></tr>` +
    `<tr><td>🚀 Panduan Mulai <sub>(quickstart)</sub></td><td>Langkah pertama konfigurasi userbot baru</td></tr>` +
    `<tr><td>📜 Cheatsheet Perintah <sub>(cheatsheet)</sub></td><td>Daftar perintah wajib tahu &amp; terpopuler</td></tr>` +
    `<tr><td>❓ FAQ &amp; Kendala <sub>(troubleshoot)</sub></td><td>Pertanyaan umum dan solusi troubleshooting</td></tr>` +
    `<tr><td>💬 Hubungi Owner <sub>(support)</sub></td><td>Konsultasi langsung untuk bantuan teknis</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Perintah Bantuan Cepat:</h3>` +
    `<p>Kirim perintah <code>.help</code> di chat mana pun untuk membuka pustaka bantuan interaktif ${loadedPlugins.length} modul bawaan.</p>` +
    `<footer>Pilih topik panduan di bawah untuk membaca lebih detail:</footer>`;
}

export function panelHelpQuickstart() {
  return `<h1 align="center">🚀 Panduan Mulai Cepat <sup>QUICKSTART</sup></h1>` +
    `<p>4 langkah mudah memaksimalkan userbot Anda setelah berhasil login:</p>` +
    `<table bordered striped>` +
    `<tr><th>Langkah</th><th>Tindakan</th><th>Keterangan</th></tr>` +
    `<tr><td>1. Tes Koneksi <sub>(status)</sub></td><td>Kirim <code>.alive</code></td><td>Menampilkan kartu status bot di chat</td></tr>` +
    `<tr><td>2. Cek Kecepatan <sub>(latency)</sub></td><td>Kirim <code>.ping</code></td><td>Mengukur responsivitas koneksi</td></tr>` +
    `<tr><td>3. Amankan Akun <sub>(security)</sub></td><td>Aktifkan Anti-PM</td><td>Mencegah spam pesan pribadi</td></tr>` +
    `<tr><td>4. Buka Modul <sub>(plugins)</sub></td><td>Kirim <code>.help</code></td><td>Membuka pustaka ${loadedPlugins.length} plugin aktif</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Tips Penting:</h3>` +
    `<ul>` +
    `<li>Anda dapat mengganti prefix default (<code>.</code>) menjadi simbol lain di menu <b>Pengaturan &gt; Ganti Prefix</b>.</li>` +
    `<li>Jangan membagikan session string akun Anda kepada siapa pun demi keamanan.</li>` +
    `<li>Gunakan tombol <b>Matikan Userbot</b> di Dashboard jika ingin berhenti sementara.</li>` +
    `</ul>` +
    `<footer>Panduan resmi onboarding DeltaUserJS.</footer>`;
}

export function panelHelpCommands(ctx?: any) {
  const session = ctx?.from?.id ? getUserbotSession(ctx.from.id) : null;
  const p = session?.vars?.PREFIX || '.';

  return `<h1 align="center">📜 Cheatsheet 16 Perintah Terpopuler <sup>CHEAT</sup></h1>` +
    `<p>Perintah yang sering digunakan untuk aktivitas harian (Prefix aktif: <code>${escapeHtml(p)}</code>):</p>` +
    `<table bordered striped>` +
    `<tr><th>Perintah</th><th>Kategori</th><th>Fungsi Utama</th></tr>` +
    `<tr><td><code>${p}alive</code></td><td>Informasi <sub>(status)</sub></td><td>Kartu status userbot &amp; engine</td></tr>` +
    `<tr><td><code>${p}ping</code></td><td>Informasi <sub>(latency)</sub></td><td>Cek latensi koneksi &amp; respon</td></tr>` +
    `<tr><td><code>${p}afk [alasan]</code></td><td>Status <sub>(away)</sub></td><td>Pasang pesan sibuk otomatis</td></tr>` +
    `<tr><td><code>${p}antipm on/off</code></td><td>Keamanan <sub>(guard)</sub></td><td>Proteksi spam pesan pribadi</td></tr>` +
    `<tr><td><code>${p}tagall [pesan]</code></td><td>Grup &amp; Admin <sub>(mention)</sub></td><td>Mention seluruh member grup</td></tr>` +
    `<tr><td><code>${p}purge</code></td><td>Moderasi <sub>(cleanup)</sub></td><td>Hapus pesan massal sekaligus</td></tr>` +
    `<tr><td><code>${p}gcast [pesan]</code></td><td>Broadcast <sub>(siaran)</sub></td><td>Siaran pesan ke semua grup userbot</td></tr>` +
    `<tr><td><code>${p}tr [lang] [teks]</code></td><td>Utilitas <sub>(translate)</sub></td><td>Terjemah bahasa internasional</td></tr>` +
    `<tr><td><code>${p}tts [teks]</code></td><td>Media <sub>(audio)</sub></td><td>Ubah teks ke pesan suara (VN)</td></tr>` +
    `<tr><td><code>${p}brat [teks]</code></td><td>Stiker <sub>(generator)</sub></td><td>Buat stiker animasi gaya brat</td></tr>` +
    `<tr><td><code>${p}quote</code></td><td>Kreatif <sub>(sticker)</sub></td><td>Ubah pesan chat menjadi stiker quote</td></tr>` +
    `<tr><td><code>${p}sangmata</code></td><td>Investigasi <sub>(history)</sub></td><td>Cek riwayat pergantian nama user</td></tr>` +
    `<tr><td><code>${p}id</code></td><td>Tools <sub>(inspect)</sub></td><td>Cek ID chat, user, atau channel</td></tr>` +
    `<tr><td><code>${p}calc [rumus]</code></td><td>Tools <sub>(math)</sub></td><td>Kalkulator matematika cepat</td></tr>` +
    `<tr><td><code>${p}weather [kota]</code></td><td>Utilitas <sub>(cuaca)</sub></td><td>Prakiraan cuaca terkini</td></tr>` +
    `<tr><td><code>${p}help</code></td><td>Bantuan <sub>(katalog)</sub></td><td>Buka katalog inline ${loadedPlugins.length} modul</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Tips Penggunaan Perintah:</h3>` +
    `<ul>` +
    `<li>Seluruh perintah di atas dapat langsung dijalankan di grup atau chat pribadi.</li>` +
    `<li>Balas (reply) pesan target saat memakai perintah moderasi seperti <code>${p}purge</code> atau <code>${p}kang</code>.</li>` +
    `<li>Eksekusi perintah diproses langsung via protokol MTProto Layer 229 tanpa perantara.</li>` +
    `</ul>` +
    `<footer>Kirim <code>${p}help [nama_modul]</code> di obrolan mana pun untuk melihat panduan lengkap suatu modul.</footer>`;
}

export function panelHelpFaq() {
  return `<h1 align="center">❓ FAQ &amp; Solusi Kendala</h1>` +
    `<p>Jawaban atas pertanyaan yang paling sering diajukan:</p>` +
    `<table bordered striped>` +
    `<tr><th>Pertanyaan</th><th>Solusi / Penjelasan</th></tr>` +
    `<tr><td>Kenapa userbot offline?</td><td>Server melakukan restart atau sesi terputus. Buka <b>Dashboard Userbot</b> lalu klik <b>⚡ Hidupkan Userbot</b>.</td></tr>` +
    `<tr><td>Apakah sesi saya aman?</td><td>Sangat aman. String sesi dienkripsi dengan standar AES-256 dan hanya digunakan untuk koneksi akun Anda sendiri.</td></tr>` +
    `<tr><td>Bagaimana cara ubah nama bot?</td><td>Buka menu <b>Pengaturan</b> &gt; <b>🏷️ Ganti Nama Bot</b>, lalu kirim nama yang Anda inginkan.</td></tr>` +
    `<tr><td>Bagaimana jika kena limit Telegram?</td><td>Hindari broadcast masal ke terlalu banyak grup dalam waktu berdekatan. Gunakan jeda wajar.</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>🆘 Masih butuh bantuan?</h3>` +
    `<p>Jika kendala Anda belum terselesaikan, silakan hubungi owner langsung melalui tombol di menu bantuan.</p>` +
    `<footer>Pusat Layanan Bantuan DeltaUserJS.</footer>`;
}

export function panelDonate(_ctx) {
  const ewallet = getSystemVarValue('DONATE_EWALLET', '');
  const bank = getSystemVarValue('DONATE_BANK', '');
  const ewalletName = getSystemVarValue('DONATE_EWALLET_NAME', 'e-Wallet');
  const bankName = getSystemVarValue('DONATE_BANK_NAME', 'Transfer Bank');

  const ewalletCell = ewallet ? `<tg-spoiler><code>${ewallet}</code></tg-spoiler>` : '<i>Belum diset</i>';
  const bankCell = bank ? `<tg-spoiler><code>${bank}</code></tg-spoiler>` : '<i>Belum diset</i>';

  return `<h1 align="center">💰 Dukungan &amp; Donasi <sup>SUPPORT</sup></h1>` +
    `<p>Dukungan Anda membantu operasional server dan maintenance berkelanjutan. Nomor tersembunyi — tap untuk melihat.</p>` +
    `<table bordered striped>` +
    `<tr><th>Metode Donasi</th><th>Nomor / Akun</th><th>Keterangan</th></tr>` +
    `<tr><td>${escapeHtml(ewalletName)} <sub>(digital)</sub></td><td align="center">${ewalletCell}</td><td>Tap untuk salin <sup>[COPY]</sup></td></tr>` +
    `<tr><td>${escapeHtml(bankName)} <sub>(transfer)</sub></td><td align="center">${bankCell}</td><td>Tap untuk salin <sup>[COPY]</sup></td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💖 Konfirmasi &amp; Reward Donasi:</h3>` +
    `<p>Setelah melakukan transfer atau donasi, silakan kirimkan bukti transfer ke kontak Owner untuk mendapatkan status VIP atau perpanjangan masa aktif userbot.</p>` +
    `<footer>Terima kasih atas dukungan Anda terhadap pengembangan platform ini.</footer>`;
}

export function panelHealth(mongoStatus = 'Unknown') {
  const users = getAllRegisteredUsers();
  const rows = users.slice(0, 5).map(user => {
    const running = userbotManager.isRunning(user.telegram_id) ? '🟢' : '🔴';
    return `<tr><td><code>${escapeHtml(user.telegram_id)}</code></td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? '✅ Aktif <sup>[OK]</sup>' : '❌ Nonaktif <sup>[OFF]</sup>'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot</td></tr>';

  return `<h1 align="center">🩺 Server Health <sup>STATUS</sup></h1>` +
    `<p>Status runtime, database cluster, dan kesehatan userbot aktif.</p>` +
    `<table bordered striped>` +
    `<tr><th>Komponen</th><th>Status</th><th>Keterangan</th></tr>` +
    `<tr><td>🍃 MongoDB Cluster <sub>(storage)</sub></td><td align="center">${mongoStatus}</td><td>Primary Replica</td></tr>` +
    `<tr><td>⚡ Userbot Engine <sub>(engine)</sub></td><td align="center">${userbotManager.clients.size} Running <sup>[OK]</sup></td><td>Teleproto Layer 229</td></tr>` +
    `<tr><td>⏱️ Waktu Aktif <sub>(uptime)</sub></td><td align="center">${Math.round(process.uptime() / 60)} Menit</td><td>Server Uptime</td></tr>` +
    `<tr><td>📦 Runtime Versi <sub>(runtime)</sub></td><td align="center">Node ${process.version} <sup>[LTS]</sup></td><td>${process.platform} ${process.arch}</td></tr>` +
    `<tr><td>🧩 Modul Plugin <sub>(modul)</sub></td><td align="center">${loadedPlugins.length} Modul <sup>Loaded</sup></td><td>Hot-Reload Siap</td></tr>` +
    `</table>` +
    `<table bordered striped><caption>👥 Snapshot Sesi Pengguna</caption>` +
    `<tr><th>ID Pengguna</th><th>Status</th><th>Langganan</th></tr>` +
    rows +
    `</table>` +
    `<footer>Monitoring kesehatan sistem &amp; kluster basis data.</footer>`;
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
  const rows: any[] = [];

  if (session) {
    // Pengguna Terdaftar: Portal Ringkas (fitur teknis dikelola di dalam Dashboard Userbot)
    rows.push([{ text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' }]);
    rows.push([
      { text: '📊 Statistik', callback_data: 'rich:stats' },
      { text: '❓ Panduan & Bantuan', callback_data: 'rich:guide' },
    ]);
    if (isOwner(ctx)) {
      rows.push([{ text: '👑 Panel Admin Command Center', callback_data: 'rich:admin' }]);
    }
    rows.push([{ text: '💰 Donasi', callback_data: 'rich:donate' }]);
  } else {
    // Pengguna Baru / Tamu ("Orang Lain")
    const approved = isOwner(ctx) || isApproved(ctx.from.id);
    const pending = isPendingApproval(ctx.from.id);

    if (approved) {
      rows.push([{ text: '🚀 Mulai Daftar Userbot', callback_data: 'rich:register' }]);
      rows.push([{ text: '💎 Paket VIP', callback_data: 'rich:subscription' }]);
    } else if (pending) {
      rows.push([{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }]);
      rows.push([{ text: '💎 Paket VIP', callback_data: 'rich:subscription' }]);
    } else {
      rows.push([{ text: '🎁 Request Coba Gratis (7 Hari)', callback_data: 'rich:claim_trial' }]);
      rows.push([{ text: '💎 Paket VIP', callback_data: 'rich:subscription' }]);
    }

    rows.push([
      { text: '📊 Statistik', callback_data: 'rich:stats' },
      { text: '❓ Panduan & Bantuan', callback_data: 'rich:guide' },
    ]);
    if (isOwner(ctx)) {
      rows.push([{ text: '👑 Panel Admin Command Center', callback_data: 'rich:admin' }]);
    }
    rows.push([{ text: '💰 Donasi', callback_data: 'rich:donate' }]);
  }

  return { inline_keyboard: rows };
}

export function keyboardPanelMenu(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const rows: any[] = [];

  if (session) {
    rows.push([
      { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
      { text: `🧩 Plugin Studio (${loadedPlugins.length})`, callback_data: 'rich:p_cat:all:1' },
    ]);
    rows.push([
      { text: '⚙️ Pengaturan', callback_data: 'rich:settings' },
      { text: '🩺 Diagnostik & Ping', callback_data: 'rich:ubot_diag' },
    ]);
    rows.push([
      { text: '💎 Status Langganan', callback_data: 'rich:subscription' },
      { text: '❓ Panduan & Bantuan', callback_data: 'rich:guide' },
    ]);
  } else {
    rows.push([
      { text: '🚀 Mulai Daftar Userbot', callback_data: 'rich:register' },
      { text: '💎 Paket VIP', callback_data: 'rich:subscription' },
    ]);
  }

  if (isOwner(ctx)) {
    rows.push([{ text: '👑 Panel Admin Command Center', callback_data: 'rich:admin' }]);
  }

  rows.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' }]);
  return { inline_keyboard: rows };
}

export function keyboardUserbot(ctx) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {
    const approved = isOwner(ctx) || isApproved(ctx.from.id);
    if (approved) {
      return {
        inline_keyboard: [
          [{ text: '🚀 Mulai Daftar Userbot', callback_data: 'rich:register' }],
          [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' }],
        ]
      };
    }
    return {
      inline_keyboard: [
        [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' }],
      ]
    };
  }

  const isRunning = userbotManager.isRunning(ctx.from.id);
  const rows: any[] = [];

  // Baris Daya & Restart
  if (isRunning) {
    rows.push([
      { text: '🔌 Matikan Userbot', callback_data: 'rich:toggle_power' },
      { text: '🔄 Restart Userbot', callback_data: 'rich:user_restart_ubot' },
    ]);
  } else {
    rows.push([
      { text: '⚡ Hidupkan Userbot', callback_data: 'rich:toggle_power' },
    ]);
  }

  // Baris Modul & Pengaturan
  rows.push([
    { text: `🧩 Plugin Studio (${loadedPlugins.length})`, callback_data: 'rich:p_cat:all:1' },
    { text: '⚙️ Pengaturan Fitur', callback_data: 'rich:settings' },
  ]);

  // Baris Scheduler & Diagnostik
  rows.push([
    { text: '⏰ Auto-Loop Broadcast', callback_data: 'rich:user_loops:1' },
    { text: '🩺 Tes Diagnostik MTProto', callback_data: 'rich:ubot_diag' },
  ]);

  // Baris Langganan & Cheatsheet
  rows.push([
    { text: '💎 Status Langganan', callback_data: 'rich:subscription' },
    { text: '📜 Cheatsheet Lengkap', callback_data: 'rich:help_commands' },
  ]);

  // Baris Refresh & Kembali
  rows.push([
    { text: '🔄 Refresh Status', callback_data: 'rich:ubot' },
    { text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' },
  ]);

  return { inline_keyboard: rows };
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

  rows.push([{ text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' }]);
  return { inline_keyboard: rows };
}

export function keyboardSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;

  return { inline_keyboard: [
    [
      { text: isAntiPm ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF', callback_data: 'rich:toggle_anti_pm' },
      { text: isAfk ? '🤖 AFK: 🟢 ON' : '🤖 AFK: 🔴 OFF', callback_data: 'rich:toggle_afk' },
    ],
    [
      { text: '🏷️ Ganti Nama Bot', callback_data: 'rich:edit_name' },
      { text: '💬 Ganti Prefix Cepat', callback_data: 'rich:pick_prefix' },
    ],
    [
      { text: '📝 Ubah Pesan AFK', callback_data: 'rich:edit_afk' },
      { text: '🤖 Setup Inline Helper', callback_data: 'rich:setup_helper' },
    ],
    [
      { text: '⚙️ Custom Vars', callback_data: 'rich:edit_vars' },
      { text: '🗑️ Hapus Sesi Akun', callback_data: 'rich:danger_delete_session' },
    ],
    [
      { text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' },
      { text: '🏠 Menu Utama', callback_data: 'rich:main' },
    ],
  ] };
}

export function keyboardPrefixPicker() {
  return { inline_keyboard: [
    [
      { text: '🔹 . (Titik)', callback_data: 'rich:set_prefix:.' },
      { text: '🔹 ! (Seru)', callback_data: 'rich:set_prefix:!' },
      { text: '🔹 , (Koma)', callback_data: 'rich:set_prefix:,' },
    ],
    [
      { text: '🔹 # (Pagar)', callback_data: 'rich:set_prefix:#' },
      { text: '🔹 ? (Tanya)', callback_data: 'rich:set_prefix:?' },
      { text: '🔹 ~ (Tilde)', callback_data: 'rich:set_prefix:~' },
    ],
    [{ text: '🔙 Pengaturan', callback_data: 'rich:settings' }],
  ] };
}

export function keyboardInlineHelper() {
  return { inline_keyboard: [
    [{ text: '🔑 Masukkan Token Bot', callback_data: 'rich:edit_vars' }],
    [{ text: '🔙 Pengaturan', callback_data: 'rich:settings' }],
  ] };
}

export function keyboardUserbotDiag(ctx) {
  const isRunning = userbotManager.isRunning(ctx.from.id);
  return { inline_keyboard: [
    [
      { text: '🔄 Uji Ulang Diagnostik', callback_data: 'rich:ubot_diag' },
      { text: isRunning ? '🔌 Matikan Userbot' : '⚡ Hidupkan Userbot', callback_data: 'rich:toggle_power' },
    ],
    [{ text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' }],
  ] };
}

export function keyboardHelpCenter() {
  return { inline_keyboard: [
    [
      { text: '🚀 Panduan Mulai Cepat', callback_data: 'rich:help_quickstart' },
      { text: '📜 Cheatsheet Perintah', callback_data: 'rich:help_commands' },
    ],
    [
      { text: '❓ FAQ & Troubleshooting', callback_data: 'rich:help_faq' },
      { text: '💬 Hubungi Owner', url: `tg://user?id=${config.ownerId}` },
    ],
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardHelpBack() {
  return { inline_keyboard: [
    [{ text: '🔙 Pusat Bantuan', callback_data: 'rich:guide' }],
    [{ text: '🏠 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardDangerDelete() {
  return { inline_keyboard: [] };
}

export function keyboardTermsOfService() {
  return { inline_keyboard: [
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardTermsDeclined() {
  return { inline_keyboard: [
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardRegister() {
  return { inline_keyboard: [
    [{ text: '📱 Login via OTP', callback_data: 'rich:otp' }, { text: '🔍 Scan QR Code', callback_data: 'rich:qr' }],
    [{ text: '📜 Syarat & Ketentuan', callback_data: 'rich:tos_view' }, { text: '💎 Paket VIP', callback_data: 'rich:subscription' }],
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardBuySubscription(_ctx?: any) {
  const rows: any[] = [];
  rows.push([
    { text: '🎟️ Tukar Kode Voucher Promo', callback_data: 'rich:redeem_voucher', style: 'success' },
  ]);
  if (config.ownerId) {
    rows.push([
      { text: '💬 Hubungi Owner untuk Order', url: `tg://user?id=${config.ownerId}` },
      { text: '💰 Info Rekening', callback_data: 'rich:donate' },
    ]);
  } else {
    rows.push([
      { text: '💰 Info Rekening Pembayaran', callback_data: 'rich:donate' },
    ]);
  }
  rows.push([
    { text: '💎 Cek Status Langganan', callback_data: 'rich:subscription' },
    { text: '🔙 Menu Utama', callback_data: 'rich:main' },
  ]);
  return { inline_keyboard: rows };
}

export function keyboardSubscription(ctx?: any) {
  const premiumDays = getSystemVarNum('SUBSCRIPTION_DAYS', 30);
  const trialDays = getSystemVarNum('TRIAL_DAYS', 7);
  const userId = ctx?.from?.id;
  const owner = isOwner(ctx);
  const session = userId ? getUserbotSession(userId) : null;
  const rows: any[] = [];

  if (owner) {
    rows.push([
      { text: '🛒 Menu Beli / Paket VIP', callback_data: 'rich:buy_premium', style: 'primary' },
      { text: '🎟️ Tukar Kode Promo', callback_data: 'rich:redeem_voucher', style: 'success' },
    ]);
    if (session) {
      rows.push([
        { text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' },
        { text: '👑 Panel Admin', callback_data: 'rich:admin' },
      ]);
    } else {
      rows.push([
        { text: '🚀 Hubungkan Sesi', callback_data: 'rich:register', style: 'success' },
        { text: '👑 Panel Admin', callback_data: 'rich:admin' },
      ]);
    }
    rows.push([
      { text: '🔙 Menu Utama', callback_data: 'rich:main' },
    ]);
    return { inline_keyboard: rows };
  }

  if (session) {
    const expDate = session.expired_at ? new Date(session.expired_at) : null;
    const isUnlimited = !expDate || Number.isNaN(expDate.getTime());
    const diffDays = expDate && !isUnlimited ? Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999;
    const isExpired = !isUnlimited && diffDays <= 0;

    rows.push([
      { text: '🛒 Beli / Perpanjang VIP', callback_data: 'rich:buy_premium', style: 'primary' },
      { text: '🎟️ Tukar Voucher Promo', callback_data: 'rich:redeem_voucher', style: 'success' },
    ]);
    rows.push([
      { text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' },
      { text: '🔙 Menu Utama', callback_data: 'rich:main' },
    ]);
    return { inline_keyboard: rows };
  }

  // Tamu / Pengguna baru tanpa sesi
  const approved = userId ? isApproved(userId) : false;
  const pending = userId ? isPendingApproval(userId) : false;
  const claimed = userId ? hasClaimedTrial(userId) : false;

  if (approved) {
    rows.push([{ text: '🚀 Hubungkan Sesi Userbot (Disetujui)', callback_data: 'rich:register', style: 'success' }]);
  } else if (pending) {
    rows.push([{ text: '⏳ Cek Status Approval Permohonan', callback_data: 'rich:check_approval', style: 'primary' }]);
  } else if (!claimed) {
    rows.push([{ text: `🎁 Klaim Coba Gratis (${trialDays} Hari)`, callback_data: 'rich:claim_trial', style: 'success' }]);
  } else {
    rows.push([{ text: '🚀 Mulai Daftar Userbot Baru', callback_data: 'rich:register', style: 'primary' }]);
  }

  rows.push([
    { text: '🛒 Menu Beli / Paket VIP', callback_data: 'rich:buy_premium', style: 'primary' },
    { text: '🎟️ Tukar Kode Voucher Promo', callback_data: 'rich:redeem_voucher' },
  ]);
  rows.push([
    { text: '🔙 Menu Utama', callback_data: 'rich:main' },
  ]);
  return { inline_keyboard: rows };
}

export function keyboardAdmin(pendingCount = 0) {
  const pendingLabel = pendingCount > 0 ? `⏳ Approval (${pendingCount})` : '⏳ Antrean Approval';
  return { inline_keyboard: [
    [
      { text: pendingLabel, callback_data: 'rich:admin_pending' },
      { text: '👥 Daftar Pengguna', callback_data: 'rich:admin_users:1' },
    ],
    [
      { text: '🎟️ Kelola Voucher', callback_data: 'rich:admin_vouchers:1' },
      { text: '📢 Broadcast Masal', callback_data: 'rich:admin_broadcast' },
    ],
    [
      { text: '⚡ Fleet & Userbot', callback_data: 'rich:admin_fleet' },
      { text: '💎 Langganan & Subs', callback_data: 'rich:admin_subs' },
    ],
    [
      { text: '⚙️ Pengaturan Cepat', callback_data: 'rich:admin_settings' },
      { text: '💾 Backup & Audit', callback_data: 'rich:admin_backup' },
    ],
    [
      { text: '🩺 Server Health', callback_data: 'rich:health' },
      { text: '🔙 Menu Utama', callback_data: 'rich:main' },
    ],
  ] };
}

export function keyboardAdminPending() {
  const pendingList = getPendingApprovals();
  const rows: any[] = [];

  if (pendingList.length > 1) {
    rows.push([
      { text: `✅ Setujui Semua (${pendingList.length} User)`, callback_data: 'rich:admin_approve_all' }
    ]);
  }

  rows.push([
    { text: '🔄 Muat Ulang', callback_data: 'rich:admin_pending' },
    { text: '🔙 Admin Hub', callback_data: 'rich:admin' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardAdminUsers(page = 1) {
  const allUsers = getCombinedAdminUsers();
  const totalPages = Math.max(1, Math.ceil(allUsers.length / ADMIN_USERS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * ADMIN_USERS_PER_PAGE;
  const currentUsers = allUsers.slice(start, start + ADMIN_USERS_PER_PAGE);

  const rows: any[] = [];

  for (let i = 0; i < currentUsers.length; i += 2) {
    const row: any[] = [];
    const u1 = currentUsers[i];
    const icon1 = u1.is_awaiting_reg ? '🔵' : (userbotManager.isRunning(u1.telegram_id) ? '🟢' : '🔴');
    const label1 = `${icon1} ${(u1.custom_name || String(u1.telegram_id)).slice(0, 12)}`;
    row.push({ text: label1, callback_data: `rich:admin_user:${u1.telegram_id}` });

    if (i + 1 < currentUsers.length) {
      const u2 = currentUsers[i + 1];
      const icon2 = u2.is_awaiting_reg ? '🔵' : (userbotManager.isRunning(u2.telegram_id) ? '🟢' : '🔴');
      const label2 = `${icon2} ${(u2.custom_name || String(u2.telegram_id)).slice(0, 12)}`;
      row.push({ text: label2, callback_data: `rich:admin_user:${u2.telegram_id}` });
    }
    rows.push(row);
  }

  if (totalPages > 1) {
    const nav: any[] = [];
    if (currentPage > 1) {
      nav.push({ text: '◀️ Prev', callback_data: `rich:admin_users:${currentPage - 1}` });
    }
    nav.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: `rich:admin_users:${currentPage}` });
    if (currentPage < totalPages) {
      nav.push({ text: 'Next ▶️', callback_data: `rich:admin_users:${currentPage + 1}` });
    }
    rows.push(nav);
  }

  rows.push([
    { text: '🔙 Admin Hub', callback_data: 'rich:admin' }
  ]);

  return { inline_keyboard: rows };
}

export function keyboardAdminUserDetail(targetId: number) {
  const session = getUserbotSession(targetId);
  if (!session) {
    if (isApproved(targetId)) {
      return { inline_keyboard: [
        [{ text: '🚫 Cabut Izin Approval', callback_data: `rich:admin_revoke_user:${targetId}` }],
        [
          { text: '🔙 Daftar User', callback_data: 'rich:admin_users:1' },
          { text: '👑 Admin Hub', callback_data: 'rich:admin' },
        ]
      ] };
    }
    return { inline_keyboard: [
      [{ text: '🔙 Daftar User', callback_data: 'rich:admin_users:1' }],
      [{ text: '👑 Admin Hub', callback_data: 'rich:admin' }],
    ] };
  }

  const isRunning = userbotManager.isRunning(targetId);
  return { inline_keyboard: [
    [
      { text: isRunning ? '⏹️ Matikan Userbot' : '▶️ Jalankan Userbot', callback_data: `rich:admin_power_user:${targetId}` }
    ],
    [
      { text: '➕ 7 Hari', callback_data: `rich:admin_extend:${targetId}:7` },
      { text: '➕ 30 Hari', callback_data: `rich:admin_extend:${targetId}:30` },
      { text: '♾️ Unlimited', callback_data: `rich:admin_extend:${targetId}:0` },
    ],
    [
      { text: '🚫 Cabut Izin', callback_data: `rich:admin_revoke_user:${targetId}` },
      { text: '🗑️ Hapus Akun', callback_data: `rich:admin_delete_user:${targetId}` },
    ],
    [
      { text: '🔙 Daftar User', callback_data: 'rich:admin_users:1' },
      { text: '👑 Admin Hub', callback_data: 'rich:admin' },
    ]
  ] };
}

export function keyboardAdminBroadcast() {
  return { inline_keyboard: [
    [{ text: '📢 Tulis Pesan Broadcast', callback_data: 'rich:admin_start_broadcast' }],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminFleet() {
  return { inline_keyboard: [
    [
      { text: '🔄 Restart Semua Userbot', callback_data: 'rich:admin_fleet_restart' },
      { text: '🛑 Matikan Semua Userbot', callback_data: 'rich:admin_fleet_stop' },
    ],
    [
      { text: '🚀 Jalankan Semua Userbot', callback_data: 'rich:admin_fleet_start' },
      { text: '🔄 Restart Master Bot', callback_data: 'rich:admin_restart_bot' },
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminSubs() {
  return { inline_keyboard: [
    [
      { text: '👥 Daftar User Expired', callback_data: 'rich:admin_expired_users' },
      { text: '🔄 Muat Ulang', callback_data: 'rich:admin_subs' },
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminBackup() {
  return { inline_keyboard: [
    [
      { text: '📥 Download Backup (.json)', callback_data: 'rich:admin_download_backup' },
      { text: '📜 Lihat 10 Audit Log', callback_data: 'rich:admin_view_audit' },
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminSettings() {
  const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
  return { inline_keyboard: [
    [
      { text: `🛡️ Mode: ${autoApprove ? '🌐 Buka Bebas' : '🔒 Approval Owner'}`, callback_data: 'rich:admin_toggle_auto_approve' }
    ],
    [
      { text: '⚙️ Kelola System Vars', callback_data: 'rich:edit_system_vars' }
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardUserLoops(ctx: any, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter(s => s.type === 'loop');
  const totalPages = Math.max(1, Math.ceil(loops.length / LOOPS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);

  const rows: any[] = [];
  rows.push([
    { text: '➕ Tambah Jadwal Loop', callback_data: 'rich:add_loop' },
  ]);

  if (totalPages > 1) {
    const nav: any[] = [];
    if (currentPage > 1) {
      nav.push({ text: '⬅️ Prev', callback_data: `rich:user_loops:${currentPage - 1}` });
    }
    nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
    if (currentPage < totalPages) {
      nav.push({ text: 'Next ➡️', callback_data: `rich:user_loops:${currentPage + 1}` });
    }
    rows.push(nav);
  }

  rows.push([
    { text: '🔄 Refresh', callback_data: `rich:user_loops:${currentPage}` },
    { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardAdminVouchers(page = 1) {
  const vouchers = getAllVouchers();
  const totalPages = Math.max(1, Math.ceil(vouchers.length / VOUCHERS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);

  const rows: any[] = [];
  rows.push([
    { text: '➕ Buat Voucher Baru', callback_data: 'rich:admin_new_voucher' },
  ]);

  if (totalPages > 1) {
    const nav: any[] = [];
    if (currentPage > 1) {
      nav.push({ text: '⬅️ Prev', callback_data: `rich:admin_vouchers:${currentPage - 1}` });
    }
    nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
    if (currentPage < totalPages) {
      nav.push({ text: 'Next ➡️', callback_data: `rich:admin_vouchers:${currentPage + 1}` });
    }
    rows.push(nav);
  }

  rows.push([
    { text: '🔄 Refresh', callback_data: `rich:admin_vouchers:${currentPage}` },
    { text: '👑 Panel Admin', callback_data: 'rich:admin' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardBack(target = 'main') {
  return { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: `rich:${target}` }]] };
}

// ==========================================================================
// SECTION 3 — DASHBOARD HANDLERS
// ==========================================================================

export function applyButtonStylesToPayload(payload) {
  const keyboard = payload?.reply_markup?.inline_keyboard;
  if (!Array.isArray(keyboard)) {return;}
  for (const row of keyboard) {
    if (!Array.isArray(row)) {continue;}
    for (const button of row) {
      if (button && 'style' in button) {
        delete button.style;
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

async function sendRich(ctx, rich, reply_markup, { deleteOld = false, edit = true } = {}) {
  if (ctx.inlineMessageId) {
    if (ctx.answerCallbackQuery) {
      await ctx.answerCallbackQuery({ text: '⚠️ Akses menu ini melalui Private Chat (DM) bot.', show_alert: true }).catch(()=>{});
    }
    return;
  }
  const rich_message = typeof rich === 'string' ? { html: rich } : rich;
  // Edit in-place kalau berasal dari callback pada pesan bot (message_id ada) & opsi edit aktif
  const cbMsgId = ctx.callbackQuery?.message?.message_id;
  if (edit && cbMsgId) {
    try {
      await ctx.api.editMessageText(ctx.callbackQuery.message.chat.id, cbMsgId, rich_message, { reply_markup });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('message is not modified')) {
        return;
      }
      Logger.logSystem(`editMessageText(rich) failed: ${msg}`, 'WARN');
      // fallback: kirim pesan baru di bawah
    }
  }
  // Efek draft native hanya untuk pengiriman pesan BARU di chat privat. Edit in-place tidak perlu draft.
  const chatId = ctx.chat?.id;
  const doSend = () => ctx.replyWithRichMessage(rich_message, { reply_markup });
  try {
    if (chatId && typeof chatId === 'number' && chatId > 0) {
      await sendWithNativeDraft(doSend, ctx.api, chatId, 'Memuat dashboard…');
    } else {
      await doSend();
    }
    if (deleteOld) {
      try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
    }
  } catch (err) {
    Logger.logSystem(`sendRichMessage failed: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    await ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal kirim pesan.</b> Silakan kirim /menu kembali.</p>` });
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

async function openPluginStudio(ctx, page = 1, category = 'all', notice = '', options = {}) {
  const result = panelPlugins(ctx, page, category, notice);
  // edit: true → kalau dipicu callback (tombol toggle/page), pesan diedit in-place, bukan hapus-kirim-ulang
  await sendRich(ctx, result.rich, result.keyboard, { edit: true, ...options });
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
      await replyRich(ctx, `🤖 <b>${ctx.me.first_name} Aktif!</b>\n\n<p>Silakan kirim pesan secara privat (PM) untuk mengelola bot Anda.</p>`, {
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Buka Private Chat', url: `https://t.me/${ctx.me.username}?start=true` }]]
        }
      });
      return;
    }

    const match = String(ctx.match || '').trim();
    if (match.startsWith('claim_') || match.startsWith('voucher_')) {
      const code = match.replace(/^(claim_|voucher_)/, '').trim();
      if (code) {
        const userMeta = { name: ctx.from?.first_name, username: ctx.from?.username };
        const result = await redeemVoucher(code, ctx.from.id, userMeta);
        const session = getUserbotSession(ctx.from.id);
        const keyboard = {
          inline_keyboard: [
            session
              ? [{ text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' }]
              : [{ text: '🚀 Mulai Hubungkan Userbot', callback_data: 'rich:main' }],
            [{ text: '💎 Menu Langganan', callback_data: 'rich:subscription' }, { text: '🔙 Menu Utama', callback_data: 'rich:main' }]
          ]
        };
        return replyRich(ctx,
          result.success
            ? `<h1 align="center">🎉 Penukaran Voucher Berhasil!</h1>` +
              `<p>${result.message}</p>` +
              `<footer>Layanan userbot Anda telah siap digunakan.</footer>`
            : `<h1 align="center">❌ Gagal Menukarkan Voucher</h1>` +
              `<p>${escapeHtml(result.message)}</p>`,
          { reply_markup: keyboard }
        );
      }
    }

    await openMain(ctx);
  });

  bot.command(['claim', 'voucher', 'tukar'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan lakukan penukaran voucher di Private Chat bot.</p>`);
    }
    const code = String(ctx.match || '').trim();
    if (!code) {
      return ctx.conversation.enter('user-redeem-voucher-conv');
    }
    const userMeta = { name: ctx.from?.first_name, username: ctx.from?.username };
    const result = await redeemVoucher(code, ctx.from.id, userMeta);
    const session = getUserbotSession(ctx.from.id);
    const keyboard = {
      inline_keyboard: [
        session
          ? [{ text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' }]
          : [{ text: '🚀 Mulai Hubungkan Userbot', callback_data: 'rich:main' }],
        [{ text: '💎 Menu Langganan', callback_data: 'rich:subscription' }, { text: '🔙 Menu Utama', callback_data: 'rich:main' }]
      ]
    };
    return replyRich(ctx,
      result.success
        ? `<h1 align="center">🎉 Penukaran Voucher Berhasil!</h1>` +
          `<p>${result.message}</p>` +
          `<footer>Layanan userbot Anda telah siap digunakan.</footer>`
        : `<h1 align="center">❌ Gagal Menukarkan Voucher</h1>` +
          `<p>${escapeHtml(result.message)}</p>`,
      { reply_markup: keyboard }
    );
  });

  bot.command(['sharevoucher', 'postvoucher'], async (ctx) => {
    if (!isOwner(ctx)) return;
    const code = String(ctx.match || '').trim();
    if (!code) {
      return replyRich(ctx, `<h3>💡 Petunjuk Berbagi Voucher</h3><p>Format: <code>/sharevoucher KODE</code><br>Contoh: <code>/sharevoucher PROMO-RAMADHAN</code></p>`);
    }
    const res = await broadcastVoucherToChannel(code);
    if (res.success) {
      return replyRich(ctx, `<p>✅ Voucher <code>${escapeHtml(code)}</code> berhasil dibagikan ke channel notifikasi dengan tombol klaim!</p>`);
    } else {
      return replyRich(ctx, `<p>❌ ${escapeHtml(res.message)}</p>`);
    }
  });

  bot.command(['paket', 'vip', 'langganan', 'subscribe', 'pricing'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan buka menu paket langganan di Private Chat bot.</p>`);
    }
    return sendRich(ctx, panelBuySubscription(ctx), keyboardBuySubscription(ctx));
  });

  bot.command(['daftar', 'login', 'register'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan kirim pesan secara privat (PM) untuk mendaftar userbot.</p>`);
    }
    const session = getUserbotSession(ctx.from.id);
    if (session) {
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx));
    }
    if (!isOwner(ctx) && !isApproved(ctx.from.id)) {
      return sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx));
    }
    if (!hasAcceptedTerms(ctx.from.id)) {
      return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: false });
    }
    await sendRich(ctx, panelRegister(ctx), keyboardRegister());
  });

  bot.command(['tos', 'rules', 'syarat', 'ketentuan'], async (ctx) => {
    if (ctx.chat.type !== 'private') {return;}
    return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: false });
  });

  bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const { abortActiveQr, activeRegClients } = await import('../../conversations/registration.js');
      await abortActiveQr(userId, ctx.api);
      const client = activeRegClients.get(userId);
      if (client) {
        try { await client.disconnect(); } catch (_) { /* empty */ }
        activeRegClients.delete(userId);
      }
    } catch (_) { /* empty */ }
    await ctx.conversation.exitAll();
    await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Ketik /menu untuk membuka Menu Utama.</p>`);
  });

  bot.command('health', async (ctx) => {
    if (!isOwner(ctx)) {return;}
    await sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'));
  });

  bot.command('revoke', async (ctx) => {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {
      return ctx.replyWithRichMessage({ html: `<p>❌ Anda belum memiliki sesi bot yang aktif.</p>` });
    }

    await ctx.replyWithRichMessage({ html: `<p>⏳ Menghapus sesi dan logout...</p>` });

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

    await ctx.replyWithRichMessage({ html: `<p><b>✅ Berhasil</b><br>Sesi dihapus sepenuhnya. Ketik /menu untuk mendaftar ulang.</p>` });
  });

  bot.callbackQuery(/^rich:(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    try { await ctx.answerCallbackQuery(); } catch (_) { /* empty */ }

    if (action === 'main') {return openMain(ctx, { edit: true });}
    if (action === 'noop') {return;}

    if (action === 'panel_menu') {return sendRich(ctx, panelMenuList(ctx), keyboardPanelMenu(ctx), { edit: true });}

    if (action === 'ubot') {
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
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
          return ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal menghidupkan:</b> ${escapeHtml(err.message)}</p>` });
        }
      }
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
    }

    if (action === 'user_restart_ubot') {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) {
        return ctx.answerCallbackQuery({ text: 'Sesi tidak ditemukan.', show_alert: true });
      }
      if (!userbotManager.isRunning(telegramId)) {
        return ctx.answerCallbackQuery({ text: 'Userbot sedang offline. Ketuk Hidupkan Userbot terlebih dahulu.', show_alert: true });
      }

      await ctx.answerCallbackQuery({ text: '🔄 Merestart koneksi userbot...' });
      try {
        await userbotManager.restartUserbot(telegramId);
        await updateUserbotStatus(telegramId, true);
        await ctx.answerCallbackQuery({ text: '✅ Userbot berhasil direstart & online!' });
      } catch (err) {
        return ctx.replyWithRichMessage({
          html: `<p>❌ <b>Gagal restart:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`
        });
      }
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
    }

    if (action.startsWith('plugin_page:')) {
      const page = Number(action.split(':')[1] || 1);
      return openPluginStudio(ctx, page, 'all');
    }

    if (action.startsWith('p_cat:')) {
      const parts = action.split(':');
      const category = parts[1] || 'all';
      const page = Number(parts[2]) || 1;
      await ctx.answerCallbackQuery();
      return openPluginStudio(ctx, page, category);
    }

    if (action.startsWith('p_page:')) {
      const parts = action.split(':');
      const page = Number(parts[1]) || 1;
      const category = parts[2] || 'all';
      await ctx.answerCallbackQuery();
      return openPluginStudio(ctx, page, category);
    }

    if (action.startsWith('p_info:')) {
      const parts = action.split(':');
      const pluginName = decodeURIComponent(parts[1] || '');
      const page = Number(parts[2]) || 1;
      const category = parts[3] || 'all';
      await ctx.answerCallbackQuery();
      const detail = panelPluginDetail(ctx, pluginName, page, category);
      return sendRich(ctx, detail.rich, detail.keyboard, { edit: true });
    }

    if (action.startsWith('p_tog:')) {
      const parts = action.split(':');
      const pluginName = decodeURIComponent(parts[1] || '');
      const page = Number(parts[2]) || 1;
      const category = parts[3] || 'all';
      const lower = pluginName.toLowerCase();

      if (PROTECTED_PLUGINS.includes(lower)) {
        return ctx.answerCallbackQuery('Plugin ini dilindungi sistem.');
      }

      const isDisabled = normalizedDisabled(ctx.from.id).includes(lower);
      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        await ctx.answerCallbackQuery(`✅ Plugin ${pluginName} diaktifkan`);
        return openPluginStudio(ctx, page, category, pluginNotice(pluginName, true));
      }

      await disablePlugin(ctx.from.id, pluginName);
      await ctx.answerCallbackQuery(`❌ Plugin ${pluginName} dinonaktifkan`);
      return openPluginStudio(ctx, page, category, pluginNotice(pluginName, false));
    }

    if (action.startsWith('p_tog_det:')) {
      const parts = action.split(':');
      const pluginName = decodeURIComponent(parts[1] || '');
      const page = Number(parts[2]) || 1;
      const category = parts[3] || 'all';
      const lower = pluginName.toLowerCase();

      if (PROTECTED_PLUGINS.includes(lower)) {
        return ctx.answerCallbackQuery('Plugin ini dilindungi sistem.');
      }

      const isDisabled = normalizedDisabled(ctx.from.id).includes(lower);
      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        await ctx.answerCallbackQuery(`✅ Plugin ${pluginName} diaktifkan`);
      } else {
        await disablePlugin(ctx.from.id, pluginName);
        await ctx.answerCallbackQuery(`❌ Plugin ${pluginName} dinonaktifkan`);
      }
      const detail = panelPluginDetail(ctx, pluginName, page, category);
      return sendRich(ctx, detail.rich, detail.keyboard, { edit: true });
    }

    if (action.startsWith('plugin_toggle:')) {
      const [, rawName, rawPage] = action.split(':');
      const page = Number(rawPage || 1);
      const plugin = findPlugin(rawName);
      if (!plugin) {
        return openPluginStudio(ctx, page, 'all', 'Plugin tidak ditemukan.');
      }
      const pluginName = String(plugin.name);
      const lower = pluginName.toLowerCase();
      const protectedPlugins = ['admin', 'pluginmanager'];
      const disabled = getDisabledPlugins(ctx.from.id).map(name => String(name).toLowerCase());
      const isDisabled = disabled.includes(lower);

      if (!isDisabled && protectedPlugins.includes(lower)) {
        return openPluginStudio(ctx, page, 'all', `Plugin protected: ${pluginName}`);
      }

      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        return openPluginStudio(ctx, page, 'all', pluginNotice(pluginName, true));
      }

      await disablePlugin(ctx.from.id, pluginName);
      return openPluginStudio(ctx, page, 'all', pluginNotice(pluginName, false));
    }

    if (action === 'toggle_stream') {
      return ctx.answerCallbackQuery('Fitur ini telah dinonaktifkan.');
    }

    if (action === 'settings') {return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx));}

    if (action === 'edit_name') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('custom-name-conv');
    }

    if (action === 'pick_prefix') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelPrefixPicker(ctx), keyboardPrefixPicker(), { edit: true });
    }

    if (action.startsWith('set_prefix:')) {
      const newPrefix = action.split(':')[1];
      await setUserVar(ctx.from.id, 'PREFIX', newPrefix);
      await ctx.answerCallbackQuery({ text: `✅ Prefix diubah ke: ${newPrefix}` });
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { edit: true });
    }

    if (action === 'setup_helper') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelInlineHelper(ctx), keyboardInlineHelper(), { edit: true });
    }

    if (action === 'ubot_diag') {
      await ctx.answerCallbackQuery({ text: 'Menguji koneksi MTProto...' });
      const diagHtml = await panelUserbotDiag(ctx);
      return sendRich(ctx, diagHtml, keyboardUserbotDiag(ctx), { edit: true });
    }

    if (action === 'toggle_anti_pm') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}
      const newStatus = session.anti_pm === 1 ? 0 : 1;
      await updateUserbotFeature(ctx.from.id, 'anti_pm', newStatus);
      await ctx.answerCallbackQuery(`Anti-PM: ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx));
    }

    if (action === 'toggle_afk') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}
      const newStatus = session.auto_reply === 1 ? 0 : 1;
      await updateUserbotFeature(ctx.from.id, 'auto_reply', newStatus);
      await ctx.answerCallbackQuery(`AFK: ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx));
    }

    if (action === 'toggle_anti_pm_ubot') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}
      const newStatus = session.anti_pm === 1 ? 0 : 1;
      await updateUserbotFeature(ctx.from.id, 'anti_pm', newStatus);
      await ctx.answerCallbackQuery(`Anti-PM: ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx));
    }

    if (action === 'toggle_afk_ubot') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}
      const newStatus = session.auto_reply === 1 ? 0 : 1;
      await updateUserbotFeature(ctx.from.id, 'auto_reply', newStatus);
      await ctx.answerCallbackQuery(`AFK: ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx));
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
      return sendRich(ctx, panelDangerDelete(ctx), keyboardDangerDelete(), { edit: true });
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
      await ctx.replyWithRichMessage({ html: `<p>🗑️ <b>Sesi dihapus permanen.</b></p>` });
      return openMain(ctx, { deleteOld: true });
    }

    if (action === 'subscription') {return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx), { edit: true });}
    if (action === 'register') {
      if (!isOwner(ctx) && !isApproved(ctx.from.id)) {
        return sendAccessDeniedRich(ctx);
      }
      if (!hasAcceptedTerms(ctx.from.id)) {
        return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
      }
      return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
    }

    if (action === 'tos_agree') {
      setAcceptedTerms(ctx.from.id, true);
      await ctx.answerCallbackQuery({ text: '✅ Syarat & Ketentuan disetujui!' });
      return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
    }

    if (action === 'tos_decline') {
      await ctx.answerCallbackQuery({ text: 'Pendaftaran dibatalkan.' });
      return sendRich(ctx, panelTermsDeclined(ctx), keyboardTermsDeclined(), { edit: true });
    }

    if (action === 'tos_view') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
    }

    if (action === 'claim_trial') {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const trialDays = getSystemVarNum('TRIAL_DAYS', 7);

      if (isOwner(ctx)) {
        approveUser(userId);
        return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
      }

      const session = getUserbotSession(userId);
      if (session) {
        return ctx.replyWithRichMessage({
          html: `<p>ℹ️ Anda sudah memiliki userbot yang aktif. Buka dashboard untuk mengelolanya.</p>`
        });
      }

      if (isApproved(userId)) {
        return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
      }

      if (hasClaimedTrial(userId)) {
        return ctx.replyWithRichMessage({
          html: `<p>❌ Anda sudah pernah menggunakan masa uji coba gratis sebelumnya. Hubungi owner atau pesan paket VIP.</p>`
        });
      }

      if (isPendingApproval(userId)) {
        return ctx.replyWithRichMessage({
          html: `<h3>⏳ Permintaan Sedang Diproses</h3><p>Permintaan coba gratis Anda sudah dikirim sebelumnya dan sedang menunggu persetujuan owner.<br>Harap tunggu notifikasi dari bot.</p>`
        });
      }

      addPendingApproval(userId, {
        name: ctx.from.first_name || 'User',
        username: ctx.from.username,
      });

      const targetChat = config.logGroupId || config.ownerId;
      const firstName = escapeHtml(ctx.from.first_name || 'User');
      const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : '<i>Tanpa Username</i>';
      const nowWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      if (targetChat) {
        try {
          const extraParams: Record<string, unknown> = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Setujui Trial', callback_data: `approve_trial:${userId}` },
                  { text: '❌ Tolak', callback_data: `reject_trial:${userId}` },
                ]
              ]
            }
          };
          if (config.logGroupId && config.logTopicId) {
            extraParams.message_thread_id = config.logTopicId;
          }
          await ctx.api.sendMessage(
            targetChat,
            `🔔 <b>Permintaan Uji Coba Gratis (Trial)</b>\n\n` +
            `Ada pengguna baru mengajukan permohonan coba gratis:\n` +
            `• <b>Nama:</b> ${firstName}\n` +
            `• <b>Username:</b> ${username}\n` +
            `• <b>ID Pengguna:</b> <code>${userId}</code>\n` +
            `• <b>Durasi:</b> <b>${trialDays} Hari</b>\n` +
            `• <b>Waktu:</b> <code>${nowWib} WIB</code>\n\n` +
            `<i>Pilih tindakan di bawah untuk menyetujui atau menolak:</i>`,
            { parse_mode: 'HTML', ...extraParams }
          );
        } catch (err) {
          Logger.logSystem(`Gagal kirim notifikasi trial request ke owner: ${err}`, 'WARN');
        }
      }

      const confirmationHtml =
        `<h1 align="center">🎁 Permintaan Uji Coba Terkirim</h1>` +
        `<p>Permintaan uji coba gratis <b>${trialDays} Hari</b> berhasil diajukan kepada owner.</p>` +
        `<table bordered striped>` +
        `<tr><th>Detail Permintaan</th><th>Keterangan</th></tr>` +
        `<tr><td>ID Telegram</td><td align="center"><code>${userId}</code></td></tr>` +
        `<tr><td>Paket Diajukan</td><td align="center">🎁 Coba Gratis</td></tr>` +
        `<tr><td>Durasi Akses</td><td align="center">${trialDays} Hari</td></tr>` +
        `<tr><td>Status Permohonan</td><td align="center">🕐 Menunggu Persetujuan</td></tr>` +
        `</table>` +
        `<h3>ℹ️ Apa langkah selanjutnya?</h3>` +
        `<p>Owner akan meninjau permohonan Anda. Setelah disetujui, bot akan otomatis mengirimkan notifikasi agar Anda dapat langsung login via Scan QR Code atau OTP.</p>` +
        `<footer>Harap menunggu konfirmasi persetujuan dari owner.</footer>`;

      return sendRich(ctx, confirmationHtml, {
        inline_keyboard: [
          [{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }],
          [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
        ]
      }, { edit: true });
    }

    if (action === 'check_approval') {
      const userId = ctx.from.id;
      if (isOwner(ctx) || isApproved(userId)) {
        await ctx.answerCallbackQuery({ text: '🎉 Akun Anda sudah disetujui!', show_alert: true });
        return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
      }
      await ctx.answerCallbackQuery({ text: '⏳ Permohonan Anda masih menunggu persetujuan dari owner.', show_alert: true });
      return;
    }

    if (action === 'buy_premium') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelBuySubscription(ctx), keyboardBuySubscription(ctx), { edit: true });
    }

    if (action === 'stats') {return sendRich(ctx, panelStats(ctx), keyboardBack('main'), { edit: true });}
    if (action === 'guide') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelQuickHelp(ctx), keyboardHelpCenter(), { edit: true });
    }
    if (action === 'help_quickstart') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelHelpQuickstart(), keyboardHelpBack(), { edit: true });
    }
    if (action === 'help_commands') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelHelpCommands(ctx), keyboardHelpBack(), { edit: true });
    }
    if (action === 'help_faq') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelHelpFaq(), keyboardHelpBack(), { edit: true });
    }
    if (action === 'donate') {return sendRich(ctx, panelDonate(ctx), keyboardBack('main'), { edit: true });}

    if (action === 'admin') {
      if (!isOwner(ctx)) {return;}
      const pendingCount = getPendingApprovals().length;
      return sendRich(ctx, panelAdmin(ctx), keyboardAdmin(pendingCount), { edit: true });
    }
    if (action === 'health') {
      if (!isOwner(ctx)) {return;}
      return sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'), { edit: true });
    }
    if (action === 'edit_system_vars') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('manage-system-vars-conv');
    }
    if (action === 'admin_pending') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action.startsWith('admin_apprv:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (targetId) {
        approveUser(targetId);
        removePendingApproval(targetId);
        try { await setTrialClaimed(targetId); } catch (_) { /* ignore */ }
        await ctx.answerCallbackQuery({ text: `✅ User ${targetId} disetujui!` });
        try {
          await ctx.api.sendMessage(
            targetId,
            `🎉 <b>Permintaan Uji Coba Disetujui!</b>\n\n` +
            `<p>Owner telah menyetujui permohonan coba gratis userbot <b>7 Hari</b> untuk akun Anda.</p>\n\n` +
            `<footer>Silakan klik tombol di bawah untuk mulai mendaftar userbot Anda:</footer>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
                  [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
                ],
              },
            }
          );
        } catch (_) { /* ignore */ }
      }
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action.startsWith('admin_rjct:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (targetId) {
        revokeUser(targetId);
        removePendingApproval(targetId);
        await ctx.answerCallbackQuery({ text: `❌ User ${targetId} ditolak.` });
        try {
          await ctx.api.sendMessage(
            targetId,
            `<h3>❌ Permintaan Uji Coba Ditolak</h3>\n` +
            `<p>Maaf, permohonan coba gratis Anda belum disetujui oleh owner saat ini.</p>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
                ],
              },
            }
          );
        } catch (_) { /* ignore */ }
      }
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action === 'admin_approve_all') {
      if (!isOwner(ctx)) {return;}
      const list = getPendingApprovals();
      for (const p of list) {
        approveUser(p.userId);
        removePendingApproval(p.userId);
        try { await setTrialClaimed(p.userId); } catch (_) { /* ignore */ }
        try {
          await ctx.api.sendMessage(
            p.userId,
            `🎉 <b>Permintaan Uji Coba Disetujui!</b>\n\n` +
            `<p>Owner telah menyetujui permohonan coba gratis userbot <b>7 Hari</b> untuk akun Anda.</p>\n\n` +
            `<footer>Silakan klik tombol di bawah untuk mulai mendaftar userbot Anda:</footer>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
                  [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
                ],
              },
            }
          );
        } catch (_) { /* ignore */ }
      }
      await ctx.answerCallbackQuery({ text: `✅ Berhasil menyetujui ${list.length} user!` });
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action.startsWith('admin_users')) {
      if (!isOwner(ctx)) {return;}
      const page = Number(action.split(':')[1]) || 1;
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminUsers(page), keyboardAdminUsers(page), { edit: true });
    }
    if (action.startsWith('admin_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_power_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
        await updateUserbotStatus(targetId, 0);
        await ctx.answerCallbackQuery({ text: `⏹️ Userbot ${targetId} dimatikan.` });
      } else {
        const session = getUserbotSession(targetId);
        if (session && session.session_string) {
          try {
            await userbotManager.startUserbot(targetId, session.session_string);
            await updateUserbotStatus(targetId, 1);
            await ctx.answerCallbackQuery({ text: `▶️ Userbot ${targetId} dinyalakan.` });
          } catch (err) {
            await ctx.answerCallbackQuery({ text: `❌ Gagal: ${err instanceof Error ? err.message : String(err)}` });
          }
        } else {
          await ctx.answerCallbackQuery({ text: `❌ Sesi userbot tidak valid.` });
        }
      }
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_extend:')) {
      if (!isOwner(ctx)) {return;}
      const parts = action.split(':');
      const targetId = Number(parts[1]);
      const days = Number(parts[2]);
      if (days === 0) {
        await updateUserbotFeature(targetId, 'expired_at', null);
        await ctx.answerCallbackQuery({ text: `♾️ Masa aktif diset Unlimited.` });
      } else {
        const session = getUserbotSession(targetId);
        const now = Date.now();
        const base = (session?.expired_at && new Date(session.expired_at).getTime() > now)
          ? new Date(session.expired_at).getTime()
          : now;
        const newExp = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
        await updateUserbotFeature(targetId, 'expired_at', newExp);
        await ctx.answerCallbackQuery({ text: `➕ Masa aktif ditambah ${days} hari.` });
      }
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_revoke_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      revokeUser(targetId);
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
      }
      await updateUserbotStatus(targetId, 0);
      await ctx.answerCallbackQuery({ text: `🚫 Izin ${targetId} berhasil dicabut.` });
      const session = getUserbotSession(targetId);
      if (!session) {
        return sendRich(ctx, panelAdminUsers(1), keyboardAdminUsers(1), { edit: true });
      }
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_delete_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
      }
      await deleteUserbot(targetId);
      revokeUser(targetId);
      await ctx.answerCallbackQuery({ text: `🗑️ Akun ${targetId} dihapus permanen.` });
      return sendRich(ctx, panelAdminUsers(1), keyboardAdminUsers(1), { edit: true });
    }
    if (action === 'admin_broadcast') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminBroadcast(), keyboardAdminBroadcast(), { edit: true });
    }
    if (action === 'admin_start_broadcast') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('broadcast-conv');
    }
    if (action === 'admin_fleet') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_fleet_restart') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🔄 Merestart seluruh userbot...' });
      await userbotManager.restartAllActive();
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_fleet_stop') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🛑 Menghentikan seluruh userbot...' });
      for (const id of Array.from(userbotManager.clients.keys())) {
        try {
          await userbotManager.stopUserbot(id);
          await updateUserbotStatus(id, 0);
        } catch (_) { /* ignore */ }
      }
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_fleet_start') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🚀 Menyalakan seluruh userbot...' });
      const allUsers = getAllRegisteredUsers();
      for (const u of allUsers) {
        if (u.session_string && !userbotManager.isRunning(u.telegram_id)) {
          try {
            await userbotManager.startUserbot(u.telegram_id, u.session_string);
            await updateUserbotStatus(u.telegram_id, 1);
          } catch (_) { /* ignore */ }
        }
      }
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_restart_bot') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🔄 Merestart Master Bot...' });
      await ctx.replyWithRichMessage({ html: '<h3>🔄 Master Bot sedang direstart...</h3><p>Layanan akan kembali aktif dalam beberapa detik melalui PM2.</p>' });
      setTimeout(() => { process.exit(0); }, 1000);
      return;
    }
    if (action === 'admin_subs') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      const subsHtml = await panelAdminSubs();
      return sendRich(ctx, subsHtml, keyboardAdminSubs(), { edit: true });
    }
    if (action === 'admin_expired_users') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      const allUsers = getAllRegisteredUsers();
      const now = Date.now();
      const expired = allUsers.filter(u => u.expired_at && new Date(u.expired_at).getTime() < now);
      const rows = expired.map(u => {
        const dateStr = u.expired_at ? new Date(u.expired_at).toLocaleDateString('id-ID') : '—';
        return `<tr><td><code>${u.telegram_id}</code></td><td>${escapeHtml(u.custom_name || 'User')}</td><td align="center">${dateStr}</td></tr>`;
      }).join('') || '<tr><td colspan="3" align="center">Tidak ada user expired</td></tr>';
      const expiredHtml = `<h1 align="center">🔴 Daftar User Expired (${expired.length})</h1>` +
        `<p>Pengguna yang masa aktifnya telah habis:</p>` +
        `<table bordered striped>` +
        `<tr><th>ID Pengguna</th><th>Nama Akun</th><th>Tanggal Expired</th></tr>` +
        rows +
        `</table>`;
      return sendRich(ctx, expiredHtml, keyboardAdminSubs(), { edit: true });
    }
    if (action === 'admin_backup') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminBackup(), keyboardAdminBackup(), { edit: true });
    }
    if (action === 'admin_download_backup') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '📦 Menyiapkan file backup...' });
      try {
        const users = await UserbotModel.find({}).lean();
        const backupData = JSON.stringify(users, null, 2);
        const filename = `backup_admin_${Date.now()}.json`;
        fs.writeFileSync(filename, backupData);
        await ctx.replyWithDocument(new InputFile(filename, `delta_backup_${Date.now()}.json`), {
          caption: `📦 <b>Backup Database MongoDB</b>\nTotal: ${users.length} userbot terdaftar.\nTanggal: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
          parse_mode: 'HTML'
        });
        setTimeout(() => { try { fs.unlinkSync(filename); } catch (_) {} }, 60000);
      } catch (err) {
        await ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal membuat backup:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>` });
      }
      return;
    }
    if (action === 'admin_view_audit') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      try {
        const { getAuditLogs } = await import('../../../services/SubscriptionService.js');
        const logs = await getAuditLogs({ limit: 10 });
        const logRows = logs.map(l => {
          const time = new Date(l.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
          return `<tr><td>${time}</td><td><b>${escapeHtml(l.action)}</b></td><td><code>${l.userId || '—'}</code></td><td>${escapeHtml(l.resource)}</td></tr>`;
        }).join('') || '<tr><td colspan="4" align="center">Belum ada log audit</td></tr>';
        const auditHtml = `<h1 align="center">📜 10 Riwayat Audit Terakhir</h1>` +
          `<p>Aktivitas perubahan data dan akses sistem:</p>` +
          `<table bordered striped>` +
          `<tr><th>Waktu</th><th>Aksi</th><th>User</th><th>Resource</th></tr>` +
          logRows +
          `</table>`;
        return sendRich(ctx, auditHtml, keyboardAdminBackup(), { edit: true });
      } catch (err) {
        return ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal memuat audit log:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>` });
      }
    }
    if (action === 'admin_settings') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminSettings(), keyboardAdminSettings(), { edit: true });
    }
    if (action === 'admin_toggle_auto_approve') {
      if (!isOwner(ctx)) {return;}
      const cur = getSystemVarValue('AUTO_APPROVE', '0');
      const next = cur === '1' ? '0' : '1';
      await setSystemVar('AUTO_APPROVE', next);
      await ctx.answerCallbackQuery({ text: next === '1' ? '🌐 Mode: BUKA BEBAS (Auto-Approve)' : '🔒 Mode: BUTUH APPROVAL OWNER' });
      return sendRich(ctx, panelAdminSettings(), keyboardAdminSettings(), { edit: true });
    }

    // Feature 2: Voucher actions
    if (action === 'redeem_voucher') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('user-redeem-voucher-conv');
    }
    if (action === 'admin_vouchers' || action.startsWith('admin_vouchers:')) {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      const page = Number(action.split(':')[1]) || 1;
      return sendRich(ctx, panelAdminVouchers(page), keyboardAdminVouchers(page), { edit: true });
    }
    if (action === 'admin_new_voucher') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('admin-create-voucher-conv');
    }
    if (action.startsWith('del_voucher:')) {
      if (!isOwner(ctx)) {return;}
      const hexCode = action.split(':')[1];
      const code = Buffer.from(hexCode, 'hex').toString('utf8');
      await deleteVoucher(code);
      await ctx.answerCallbackQuery({ text: `🗑️ Voucher ${code} dihapus!` });
      return sendRich(ctx, panelAdminVouchers(1), keyboardAdminVouchers(1), { edit: true });
    }
    if (action.startsWith('broadcast_voucher:')) {
      if (!isOwner(ctx)) {return;}
      const hexCode = action.split(':')[1];
      const code = Buffer.from(hexCode, 'hex').toString('utf8');
      const res = await broadcastVoucherToChannel(code);
      if (res.success) {
        await ctx.answerCallbackQuery({ text: `📢 Voucher ${code} dibagikan ke channel!` });
      } else {
        await ctx.answerCallbackQuery({ text: `❌ ${res.message}`, show_alert: true });
      }
      return;
    }

    // Feature 4: Visual Broadcast Scheduler actions
    if (action === 'user_loops' || action.startsWith('user_loops:')) {
      await ctx.answerCallbackQuery();
      const page = Number(action.split(':')[1]) || 1;
      return sendRich(ctx, panelUserLoops(ctx, page), keyboardUserLoops(ctx, page), { edit: true });
    }
    if (action === 'add_loop') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('user-add-loop-conv');
    }
    if (action.startsWith('del_loop:')) {
      const hexTarget = action.split(':')[1];
      const targetChat = Buffer.from(hexTarget, 'hex').toString('utf8');
      const stopped = stopLoop(ctx.from.id, targetChat, true);
      await ctx.answerCallbackQuery({ text: stopped ? '⏹️ Jadwal loop dihentikan dan dihapus!' : 'Jadwal dihapus.' });
      return sendRich(ctx, panelUserLoops(ctx, 1), keyboardUserLoops(ctx, 1), { edit: true });
    }

    if (action === 'otp') {
      if (!isOwner(ctx) && !isApproved(ctx.from.id)) {
        return sendAccessDeniedRich(ctx);
      }
      if (!hasAcceptedTerms(ctx.from.id)) {
        return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
      }
      return ctx.conversation.enter('otp-reg');
    }
    if (action === 'qr') {
      if (!isOwner(ctx) && !isApproved(ctx.from.id)) {
        return sendAccessDeniedRich(ctx);
      }
      if (!hasAcceptedTerms(ctx.from.id)) {
        return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
      }
      return ctx.conversation.enter('qr-reg');
    }
  });
}

export async function sendAccessDeniedRich(ctx) {
  await sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx), { edit: true });
}
