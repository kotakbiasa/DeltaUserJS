/**
 * Pembangun teks panel (panel*) untuk dashboard bot.
 *
 * Dipecah dari dashboard.ts (2.821 baris). Isi tiap fungsi dipindahkan apa
 * adanya; yang berubah hanya di file mana ia tinggal.
 */
import { getAllRegisteredUsers, getDisabledPlugins, getSchedules, getUserbotSession } from '../../../../infrastructure/database.js';
import userbotManager from '../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../userbot/engine/pluginRegistry.js';
import { formatBytesShort as formatBytesRef } from '../../../../utils/format.js';
import { escapeHtml } from '../../../../utils/richMessage.js';
import {
  getApprovedUserMeta,
  getApprovedUsers,
  getPendingApprovals,
  isApproved,
  isPendingApproval,
} from '../../../state/approvedUsers.js';
import { Api } from 'teleproto';
import {
  ADMIN_USERS_PER_PAGE,
  LOOPS_PER_PAGE,
  PLUGIN_CATEGORIES,
  PROTECTED_PLUGINS,
  badge,
  formatModuleName,
  formatTelegramPremiumBadge,
  getCombinedAdminUsers,
  getPluginCategory,
  getSystemVarValue,
  isOwner,
  isTelegramPremium,
  normalizedDisabled,
  pluginCategoryInfo,
  sortedPlugins,
  userInfo,
} from './shared.js';

export function panelMain(ctx) {
  const { firstName, botName } = userInfo(ctx);
  const session = getUserbotSession(ctx.from.id);
  const isRegistered = !!session;
  const isTgPremium = isTelegramPremium(ctx, session);
  const running = isRegistered && userbotManager.isRunning(ctx.from.id);

  if (!isRegistered) {
    const approved = isOwner(ctx) || isApproved(ctx.from.id);
    const pending = isPendingApproval(ctx.from.id);

    if (pending) {
      return `<h1 align="center">⚡ DeltaUserJS Manager</h1>` +
        `<p>Halo, <b>${escapeHtml(firstName)}</b>!<br>` +
        `Permohonan pendaftaran akun Anda sedang menunggu persetujuan owner.</p>` +
        `<table bordered striped>` +
        `<tr><th>Tahap Pendaftaran</th><th>Status</th><th>Keterangan</th></tr>` +
        `<tr><td>1. Request Approval</td><td align="center">✅ Selesai</td><td>Terkirim ke Owner</td></tr>` +
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
        `<tr><td>1. Request Approval</td><td align="center">✅ Selesai</td><td>Disetujui</td></tr>` +
        `<tr><td>2. Review Owner</td><td align="center">✅ Disetujui</td><td>Izin Diberikan</td></tr>` +
        `<tr><td>3. Tautkan Akun</td><td align="center">🔓 Siap Login</td><td>Scan QR / OTP</td></tr>` +
        `<tr><td>4. Userbot Aktif</td><td align="center">🚀 Siap</td><td>Langkah Terakhir</td></tr>` +
        `</table>` +
        `<footer>Ketuk tombol 🚀 Mulai Daftar Userbot di bawah untuk menghubungkan akun Telegram Anda.</footer>`;
    }

    return `<h1 align="center">⚡ DeltaUserJS <sup>v2.4</sup></h1>` +
      `<p>Halo, <b>${escapeHtml(firstName)}</b> ! Selamat datang di <b>${escapeHtml(botName)}</b>.<br>` +
      `Platform modular untuk mengelola userbot Telegram Anda dengan mudah, cepat, dan aman.</p>` +
      `<table bordered striped>` +
      `<tr><th>Layanan Platform</th><th>Status</th><th>Keterangan</th></tr>` +
      `<tr><td>🤖 Userbot Engine</td><td align="center">🟢 Online</td><td>Teleproto Layer 229</td></tr>` +
      `<tr><td>⭐ Akun Telegram</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td><td>${isTgPremium ? 'Telegram Premium' : 'Telegram Reguler'}</td></tr>` +
      `<tr><td>🛡️ Izin Akses</td><td align="center">🔒 Perlu Approval</td><td>Request ke Owner</td></tr>` +
      `<tr><td>📦 Modul Tersedia</td><td align="center">${loadedPlugins.length} Plugin</td><td>Siap Digunakan</td></tr>` +
      `</table>` +
      `<hr/>` +
      `<h3>🚀 Alur Pendaftaran (3 Langkah):</h3>` +
      `<ol>` +
      `<li>Ajukan akses dengan menekan tombol <b>📩 Minta Persetujuan (Request Approval)</b> di bawah.</li>` +
      `<li>Tunggu persetujuan singkat dari owner bot.</li>` +
      `<li>Pindai Scan QR Code atau masukkan kode OTP Telegram, dan userbot Anda aktif!</li>` +
      `</ol>` +
      `<footer>Silakan pilih menu di bawah untuk memulai.</footer>`;
  }

  // Tampilan Menu Utama untuk Pengguna Terdaftar (Portal Ringkas)
  return `<h1 align="center">⚡ DeltaUserJS <sup>v2.4</sup></h1>` +
    `<p>Halo, <b>${escapeHtml(firstName)}</b>! Selamat datang di <b>${escapeHtml(botName)}</b>.<br>` +
    `Pusat kendali &amp; portal utama userbot Telegram Anda.</p>` +
    `<table bordered striped>` +
    `<tr><th>Informasi Akun</th><th>Status</th><th>Keterangan</th></tr>` +
    `<tr><td>🤖 Status Userbot</td><td align="center">${running ? '🟢 Online' : '🔴 Offline'}</td><td>${running ? 'Teleproto 229' : 'Siap Dijalankan'}</td></tr>` +
    `<tr><td>⭐ Akun Telegram</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td><td>Telegram Resmi</td></tr>` +
    `<tr><td>🛡️ Status Akses</td><td align="center">🟢 Disetujui</td><td>Akses Penuh</td></tr>` +
    `<tr><td>⚡ Core Engine</td><td align="center">Teleproto Layer 229</td><td>Layer MTProto</td></tr>` +
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
    : (running ? '🟢 Online &amp; Berjalan' : '🟡 Terdaftar (Offline)');

  return `<h1 align="center">🎛️ Panel Menu Kontrol <sup>PORTAL</sup></h1>` +
    `<p>Status Akun: <b>${statusLine}</b></p>` +
    `<table bordered striped>` +
    `<tr><th>Menu Kontrol</th><th>Deskripsi Layanan</th><th>Akses</th></tr>` +
    (hasBot
      ? `<tr><td>🤖 Panel Userbot</td><td>Kendali daya, restart, &amp; info sesi</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>🧩 Plugin Studio</td><td>Manajemen ${loadedPlugins.length} modul perintah aktif</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>⚙️ Pengaturan</td><td>Anti-PM, Mode AFK, &amp; custom prefix</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>🩺 Diagnostik</td><td>Uji latensi MTProto &amp; data center</td><td align="center">🟢 Siap</td></tr>`
      : `<tr><td>🚀 Registrasi Akun</td><td>Daftar userbot baru via OTP atau QR Code</td><td align="center">🟡 Perlu Setup</td></tr>`) +
    (isOwner(ctx) ? `<tr><td>👑 Panel Admin</td><td>Operasi owner &amp; maintenance sistem</td><td align="center">🔴 Owner <sup>ROOT</sup></td></tr>` : '') +
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
  const isTgPremium = isTelegramPremium(ctx, session);
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

  const phoneText = session?.phone
    ? `<tg-spoiler>${session.phone.startsWith('+') ? session.phone : `+${session.phone}`}</tg-spoiler>`
    : '<i>Disembunyikan</i>';

  const floodBanner = flood.inCooldown
    ? `<h3>⚠️ Mode Hibernasi FloodGuard Aktif</h3>` +
      `<p>Akun dalam jeda aman Telegram (<b>${flood.secondsLeft} detik tersisa</b>) untuk mencegah pembatasan akun. Aksi keluar ditahan otomatis hingga hitungan mundur selesai.</p><hr/>`
    : '';

  return `<h1 align="center">🤖 Dashboard ${escapeHtml(botName)} <sup>PRO</sup></h1>` +
    floodBanner +
    `<h3>${running ? '🟢 Status: Online' : '🔴 Status: Offline'}</h3>` +
    `<p>Teleproto Layer 229 · Telegram Datacenter DC ${dcId} · Latensi Real-time</p>` +
    `<table bordered striped><caption>🎛️ Panel Kendali &amp; Aksi Interaktif</caption>` +
    `<tr><th>Fitur / Layanan</th><th>Status Saat Ini</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>⚡ Daya Userbot</td><td>${connStatus}</td><td align="center">${powerBtn}${restartBtn}</td></tr>` +
    `<tr><td>💬 Prefix Perintah</td><td><code>${escapeHtml(currentPrefix)}</code></td><td align="center">${prefixBtn}</td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM</td><td>${badge(isAntiPm, '🟢 ON', '🔴 OFF')}</td><td align="center">${antiPmBtn}</td></tr>` +
    `<tr><td>💤 Mode AFK Auto</td><td>${badge(isAfk, '🟢 ON', '🔴 OFF')}</td><td align="center">${afkBtn}</td></tr>` +
    `<tr><td>🏷️ Nama Kustom</td><td><b>${escapeHtml(botName)}</b></td><td align="center">${nameBtn}</td></tr>` +
    `<tr><td>🧩 Modul Plugin</td><td>🟢 ${activePlugins}/${loadedPlugins.length} Aktif</td><td align="center">${pluginBtn}</td></tr>` +
    `<tr><td>⏰ Auto-Loop</td><td><b>${loopCount}</b> Jadwal Aktif</td><td align="center">${loopBtn}</td></tr>` +
    `<tr><td>🛡️ FloodGuard</td><td>${flood.inCooldown ? `⏳ Cooldown (${flood.secondsLeft}s)` : '🟢 Normal'}</td><td align="center">${diagBtn}</td></tr>` +
    `<tr><td>🛡️ Status Akses</td><td>🟢 Disetujui (Approved)</td><td align="center">Akses Penuh</td></tr>` +
    `</table>` +
    `<table bordered striped><caption>👤 Profil Akun Terhubung</caption>` +
    `<tr><th>Informasi Akun</th><th>Nilai</th></tr>` +
    `<tr><td>📱 Nomor Telegram</td><td align="center">${phoneText}</td></tr>` +
    `<tr><td>🆔 ID Telegram</td><td align="center"><code>${ctx.from.id}</code></td></tr>` +
    `<tr><td>⭐ Telegram Premium</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td></tr>` +
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
      `<table bordered striped><caption>📊 Filter Kategori: ${catIcon} ${escapeHtml(catLabel)} (${total} plugin)</caption>` +
      `<tr><th>Total Kategori</th><th>Total Aktif</th><th>Total Off</th><th>Halaman</th></tr>` +
      `<tr><td align="center">${total}</td><td align="center">🟢 ${activeCount}</td><td align="center">🔴 ${Math.max(0, loadedPlugins.length - activeCount)}</td><td align="center">${currentPage}/${totalPages}</td></tr>` +
      `</table>` +
      `<table bordered striped><caption>📋 Modul ${escapeHtml(catLabel)} (Hal ${currentPage}/${totalPages})</caption>` +
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
    `<tr><td>💬 Prefix Perintah</td><td><code>${escapeHtml(currentPrefix)}</code></td><td align="center">${prefixBtn}</td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM</td><td>${badge(isAntiPm, '🟢 ON', '🔴 OFF')}</td><td align="center">${antiPmBtn}</td></tr>` +
    `<tr><td>💤 Mode AFK Auto</td><td>${badge(isAfk, '🟢 ON', '🔴 OFF')}</td><td align="center">${afkBtn}</td></tr>` +
    `<tr><td>🏷️ Nama Kustom Bot</td><td><b>${escapeHtml(botName)}</b></td><td align="center">${nameBtn}</td></tr>` +
    `<tr><td>📝 Pesan Balasan AFK</td><td><tg-spoiler><code>${escapeHtml(afkReason)}</code></tg-spoiler></td><td align="center">${afkReasonBtn}</td></tr>` +
    `<tr><td>🤖 Inline Helper</td><td>${helperUser}</td><td align="center">${helperBtn}</td></tr>` +
    `<tr><td>📦 Database Sesi</td><td>${session ? '🟢 Tersimpan' : '🔴 Kosong'}</td><td align="center">MongoDB</td></tr>` +
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
    `<tr><td><code>.</code> (Titik)</td><td><code>.ping</code>, <code>.alive</code></td><td>Standar (Default)</td></tr>` +
    `<tr><td><code>!</code> (Seru)</td><td><code>!ping</code>, <code>!alive</code></td><td>Populer</td></tr>` +
    `<tr><td><code>,</code> (Koma)</td><td><code>,ping</code>, <code>,alive</code></td><td>Mudah (Mudah)</td></tr>` +
    `<tr><td><code>#</code> (Pagar)</td><td><code>#ping</code>, <code>#alive</code></td><td>Alternatif</td></tr>` +
    `<tr><td><code>?</code> (Tanya)</td><td><code>?ping</code>, <code>?alive</code></td><td>Alternatif</td></tr>` +
    `<tr><td><code>~</code> (Tilde)</td><td><code>~ping</code>, <code>~alive</code></td><td>Alternatif</td></tr>` +
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
    `<tr><td>Status Helper</td><td align="center">${botUser ? `🟢 Terpasang (@${escapeHtml(botUser)})` : '🔴 Belum Terpasang'}</td></tr>` +
    `<tr><td>Metode Pemasangan</td><td align="center">Via @BotFather (HTTP API)</td></tr>` +
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
    `<tr><td>⚡ Status Client</td><td>${isRunning ? (connected ? '🟢 Online &amp; Terhubung' : '🟡 Menghubungkan...') : '🔴 Offline / Mati'}</td><td align="center">${retryBtn}</td></tr>` +
    `<tr><td>📡 Latensi Telegram DC</td><td>${pingMs > 0 ? `<b>${pingMs} ms</b>` : (isRunning ? '🟡 Mengukur...' : '🔴 N/A')}</td><td align="center">Layer 229</td></tr>` +
    `<tr><td>🌐 Server Datacenter</td><td>Telegram DC ${dcId}</td><td align="center">Teleproto</td></tr>` +
    `<tr><td>🛡️ FloodWait Guard</td><td>${flood.inCooldown ? `⏳ Hibernasi (${flood.secondsLeft}s)` : '🟢 Normal'}</td><td align="center">Proteksi</td></tr>` +
    `<tr><td>🧩 Modul Aktif</td><td>🟢 ${activeCount} / ${loadedPlugins.length} Plugin</td><td align="center">${backUbotBtn}</td></tr>` +
    `<tr><td>🛡️ Filter Anti-PM</td><td>${session?.anti_pm === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td><td align="center">Spam Shield</td></tr>` +
    `<tr><td>🤖 Auto-Reply AFK</td><td>${session?.auto_reply === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td><td align="center">Auto-Reply</td></tr>` +
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
  return `<h1 align="center">🚀 Daftar Userbot Telegram <sup>ONBOARDING</sup></h1>` +
    `<p>Halo, <b>${escapeHtml(ctx.from.first_name || 'User')}</b>! Akses akun Anda telah disetujui. Pilih metode login untuk mengaktifkan userbot Anda.</p>` +
    `<table bordered striped>` +
    `<tr><th>Metode Login</th><th>Keterangan</th><th>Akses</th></tr>` +
    `<tr><td>📱 OTP Telegram</td><td>Kode verifikasi via SMS / App</td><td align="center">🟢 Permanen</td></tr>` +
    `<tr><td>🔍 Scan QR Code</td><td>Pindai via Settings &gt; Devices</td><td align="center">🟢 Permanen</td></tr>` +
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

export function panelSubscription(ctx?: any) {
  const userId = ctx?.from?.id;
  const owner = isOwner(ctx);
  const session = userId ? getUserbotSession(userId) : null;
  const isTgPremium = isTelegramPremium(ctx, session);
  const approved = userId ? (owner || isApproved(userId)) : false;
  const pending = userId ? isPendingApproval(userId) : false;

  const running = userId ? userbotManager.isRunning(userId) : false;
  const ubot = userId ? userbotManager.clients.get(userId) : null;
  const isConnected = running && Boolean(ubot?.client?.connected);
  const connStatus = running
    ? (isConnected ? '🟢 Online' : '🟡 Menghubungkan...')
    : (session ? '🔴 Offline' : '⚪ Belum Ditautkan');
  const phoneText = session?.phone
    ? `<tg-spoiler>${session.phone.startsWith('+') ? session.phone : `+${session.phone}`}</tg-spoiler>`
    : (session ? '<i>Terhubung</i>' : '<i>Belum Ada Sesi</i>');

  const statusAkses = owner
    ? '👑 Owner (Akses Penuh)'
    : (approved ? '🟢 Disetujui (Permanen)' : (pending ? '⏳ Menunggu Approval Owner' : '🔴 Belum Disetujui'));

  return `<h1 align="center">🛡️ Status Akses Akun <sup>ACCESS</sup></h1>` +
    `<p>DeltaUserJS menggunakan sistem <b>Persetujuan Penuh (Approval-Only)</b> tanpa batas masa aktif atau biaya langganan.</p>` +
    `<table bordered striped><caption>📋 Kartu Status Akses &amp; Mesin</caption>` +
    `<tr><th>Parameter Akun</th><th>Informasi / Status</th></tr>` +
    `<tr><td>🆔 ID Telegram</td><td align="center"><code>${userId || 'Root'}</code></td></tr>` +
    `<tr><td>🛡️ Status Akses</td><td align="center">${statusAkses}</td></tr>` +
    `<tr><td>⭐ Akun Telegram</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td></tr>` +
    `<tr><td>⏱️ Masa Aktif</td><td align="center">♾️ Permanen (Tanpa Expired)</td></tr>` +
    `<tr><td>⚡ Status Mesin</td><td align="center">${connStatus}</td></tr>` +
    `<tr><td>📱 Akun Userbot</td><td align="center">${phoneText}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<details>` +
    `<summary>✨ Fitur &amp; Fasilitas Platform</summary>` +
    `<ul>` +
    `<li><b>Akses Permanen:</b> Tidak ada batasan masa aktif selama akun disetujui owner.</li>` +
    `<li><b>Semua Modul Aktif:</b> Akses ke ${loadedPlugins.length} pustaka modul perintah userbot.</li>` +
    `<li><b>Anti-PM &amp; Auto-AFK:</b> Perlindungan spam dan balasan otomatis 24/7.</li>` +
    `<li><b>Auto-Loop Broadcast:</b> Penjadwalan pesan otomatis ke grup/channel.</li>` +
    `<li><b>FloodGuard Hybrid:</b> Proteksi pintar terhadap pembatasan akun Telegram.</li>` +
    `<li><b>Server Cloud 24/7:</b> Userbot terus online walau aplikasi Telegram ditutup.</li>` +
    `</ul>` +
    `</details>` +
    `<footer>Gunakan menu navigasi di bawah untuk mengelola userbot Anda.</footer>`;
}

export function panelBuySubscription(ctx?: any) {
  return panelSubscription(ctx);
}

export function panelAccessDenied(ctx) {
  const pending = isPendingApproval(ctx.from.id);
  const statusText = pending ? '🕐 Menunggu Approval Owner' : '🔴 Belum Disetujui';
  return `<h1 align="center">🔒 Akses Belum Disetujui <sup>RESTRICTED</sup></h1>` +
    `<p>Pendaftaran userbot memerlukan persetujuan dari owner.</p>` +
    `<table bordered striped>` +
    `<tr><th>Informasi Akun</th><th>Status</th></tr>` +
    `<tr><td>ID Telegram</td><td align="center"><code>${ctx.from.id}</code></td></tr>` +
    `<tr><td>Status Akses</td><td align="center">${statusText}</td></tr>` +
    `<tr><td>Masa Aktif</td><td align="center">♾️ Permanen (Setelah Disetujui)</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Cara Mendapatkan Akses:</h3>` +
    `<p>Tekan tombol <b>📩 Minta Persetujuan Akses</b> di bawah untuk mengirimkan permohonan ke owner. Begitu disetujui, Anda dapat langsung login via scan QR code atau OTP.</p>` +
    `<footer>Silakan pilih menu di bawah:</footer>`;
}

export function panelAdmin(_ctx) {
  const registeredUsers = getAllRegisteredUsers();
  const registeredIds = new Set(registeredUsers.map(u => Number(u.telegram_id)));
  const awaitingCount = getApprovedUsers().filter(id => !registeredIds.has(Number(id))).length;
  const totalUsers = registeredUsers.length + awaitingCount;
  const running = userbotManager.clients.size;
  const pending = getPendingApprovals();
  const mem = process.memoryUsage();
  const uptimeMin = Math.round(process.uptime() / 60);

  const pendingBtn = `<tg-button type="callback_data" data="rich:admin_pending">${pending.length > 0 ? `⏳ Review (${pending.length})` : '🔍 Cek'}</tg-button>`;
  const usersBtn = `<tg-button type="callback_data" data="rich:admin_users:1">👥 Kelola</tg-button>`;
  const fleetBtn = `<tg-button type="callback_data" data="rich:admin_fleet">⚡ Kontrol</tg-button>`;
  const healthBtn = `<tg-button type="callback_data" data="rich:health">🩺 Health</tg-button>`;
  const backupBtn = `<tg-button type="callback_data" data="rich:admin_backup">💾 Backup</tg-button>`;

  const userMetricsStr = awaitingCount > 0
    ? `<b>${totalUsers}</b> Akun (${registeredUsers.length} Sesi, ${awaitingCount} Siap Login)`
    : `<b>${registeredUsers.length}</b> Sesi`;

  return `<h1 align="center">👑 Admin Command Center <sup>ROOT</sup></h1>` +
    `<p>Pusat kendali operasional, manajemen armada userbot, dan pemeliharaan platform.</p>` +
    `<table bordered striped><caption>📊 Metrik Real-Time &amp; Aksi Cepat</caption>` +
    `<tr><th>Komponen Sistem</th><th>Metrik / Nilai</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>👥 Total Pengguna</td><td align="center">${userMetricsStr}</td><td align="center">${usersBtn}</td></tr>` +
    `<tr><td>⚡ Userbot Aktif</td><td align="center"><b>${running}</b> Client Running</td><td align="center">${fleetBtn}</td></tr>` +
    `<tr><td>⏳ Antrean Approval</td><td align="center"><b>${pending.length}</b> Menunggu</td><td align="center">${pendingBtn}</td></tr>` +
    `<tr><td>💾 Backup &amp; Data</td><td align="center">Storage Server</td><td align="center">${backupBtn}</td></tr>` +
    `<tr><td>🩺 Kesehatan Server</td><td align="center">${uptimeMin}m · ${formatBytesRef(mem.rss)}</td><td align="center">${healthBtn}</td></tr>` +
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
      const status = '🔵 Siap';
      const name = escapeHtml(u.custom_name || 'Calon User');
      const akses = '⏳ Belum Login';
      const detailBtn = `<tg-button type="callback_data" data="rich:admin_user:${u.telegram_id}">🔍 Buka</tg-button>`;
      return `<tr><td align="center">${status}</td><td><code>${u.telegram_id}</code></td><td>${name}</td><td align="center">${akses}</td><td align="center">${detailBtn}</td></tr>`;
    }

    const running = userbotManager.isRunning(u.telegram_id);
    const status = running ? '🟢 On' : (u.is_active === 1 ? '🟡 Off' : '🔴 Revoked');
    const isTgPrem = u.is_telegram_premium === 1;
    const name = (u.custom_name ? escapeHtml(u.custom_name) : 'User') + (isTgPrem ? ' ⭐' : '');
    const akses = isApproved(u.telegram_id) ? '🟢 Permanen' : '🔴 Revoked';
    const detailBtn = `<tg-button type="callback_data" data="rich:admin_user:${u.telegram_id}">🔍 Buka</tg-button>`;
    return `<tr><td align="center">${status}</td><td><code>${u.telegram_id}</code></td><td>${name}</td><td align="center">${akses}</td><td align="center">${detailBtn}</td></tr>`;
  }).join('') || '<tr><td colspan="5" align="center">Belum ada user</td></tr>';

  const summaryBadge = awaitingCount > 0
    ? ` (${registeredCount} sesi aktif, ${awaitingCount} siap login)`
    : '';

  return `<h1 align="center">👥 Manajemen Pengguna <sup>DIRECTORY</sup></h1>` +
    `<p>Total terdaftar: <b>${allUsers.length}</b> akun${summaryBadge} &bull; Halaman <sup>${currentPage}/${totalPages}</sup></p>` +
    `<table bordered striped><caption>📋 Direktori Akun Userbot</caption>` +
    `<tr><th>Status</th><th>ID Telegram</th><th>Nama Akun</th><th>Akses</th><th align="center">Aksi</th></tr>` +
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
        `<tr><td>ID Telegram</td><td><code>${targetId}</code></td><td align="center">Whitelist</td></tr>` +
        `<tr><td>Username</td><td>${uname}</td><td align="center">Telegram</td></tr>` +
        `<tr><td>Status Akses</td><td>🔵 Disetujui</td><td align="center">Approved</td></tr>` +
        `<tr><td>Sesi Userbot</td><td>⚪ Belum Ditautkan</td><td align="center">Scan QR / OTP</td></tr>` +
        `<tr><td>Waktu Disetujui</td><td>${approvedAtStr}</td><td align="center">Timestamp</td></tr>` +
        `<tr><td>Tindakan Keamanan</td><td>Batalkan hak registrasi akun</td><td align="center">${revokeBtn}</td></tr>` +
        `</table>` +
        `<footer>Jika izin dicabut, status akun dikembalikan ke tamu dan pengguna tidak dapat mendaftar tanpa permohonan baru.</footer>`;
    }

    return `<h1 align="center">❌ User Tidak Ditemukan</h1><p>Sesi akun untuk ID <code>${targetId}</code> tidak ditemukan di database.</p><footer>Gunakan tombol di bawah untuk kembali.</footer>`;
  }
  const isRunning = userbotManager.isRunning(targetId);
  const disabledCount = getDisabledPlugins(targetId).length;

  const powerBtn = `<tg-button type="callback_data" data="rich:admin_power_user:${targetId}">${isRunning ? '⏹️ Matikan' : '▶️ Nyalakan'}</tg-button>`;
  const revokeBtn = `<tg-button type="callback_data" data="rich:admin_revoke_user:${targetId}">🚫 Revoke</tg-button>`;
  const deleteBtn = `<tg-button type="callback_data" data="rich:admin_delete_user:${targetId}">🗑️ Hapus</tg-button>`;

  return `<h1 align="center">👤 Detail Akun: ${escapeHtml(session.custom_name || String(targetId))} <sup>USER</sup></h1>` +
    `<p>Inspeksi konfigurasi dan kontrol langsung untuk akun userbot ini.</p>` +
    `<table bordered striped><caption>🛠️ Pengaturan &amp; Status Sesi</caption>` +
    `<tr><th>Parameter Akun</th><th>Nilai / Status</th><th align="center">Aksi Langsung</th></tr>` +
    `<tr><td>ID Telegram</td><td><code>${targetId}</code></td><td align="center">${powerBtn}</td></tr>` +
    `<tr><td>Nomor Telepon</td><td>${session.phone ? `<tg-spoiler>${session.phone}</tg-spoiler>` : '<i>Tidak diset</i>'}</td><td align="center">MTProto</td></tr>` +
    `<tr><td>Status Userbot</td><td>${isRunning ? '🟢 Online' : '🔴 Offline'}</td><td align="center">${powerBtn}</td></tr>` +
    `<tr><td>⭐ Telegram Premium</td><td>${formatTelegramPremiumBadge(session.is_telegram_premium === 1)}</td><td align="center">Telegram</td></tr>` +
    `<tr><td>Status Akses</td><td>🟢 Disetujui (Approved)</td><td align="center">Permanen</td></tr>` +
    `<tr><td>Proteksi Anti-PM</td><td>${session.anti_pm === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td><td align="center">Shield</td></tr>` +
    `<tr><td>Auto-Reply AFK</td><td>${session.auto_reply === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td><td align="center">Auto</td></tr>` +
    `<tr><td>Plugin Dinonaktifkan</td><td>${disabledCount} Modul</td><td align="center">Studio</td></tr>` +
    `<tr><td>Tindakan Keamanan</td><td>Izin &amp; Basis Data</td><td align="center">${revokeBtn} ${deleteBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Panduan Aksi Administrator:</h3>` +
    `<ul>` +
    `<li><b>▶️ / ⏹️</b>: Kontrol daya hidup atau matikan userbot pengguna.</li>` +
    `<li><b>🚫 Revoke</b>: Cabut izin approval dan nonaktifkan userbot.</li>` +
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
    `<tr><td>⚡ Userbot Berjalan</td><td align="center"><b>${running}</b> / ${users.length} Client</td><td align="center">${startAllBtn}</td></tr>` +
    `<tr><td>🔄 Restart Massal</td><td align="center">Seluruh Userbot Aktif</td><td align="center">${restartAllBtn}</td></tr>` +
    `<tr><td>🛑 Emergency Stop</td><td align="center">Matikan Semua Sesi</td><td align="center">${stopAllBtn}</td></tr>` +
    `<tr><td>🤖 Master Bot PM2</td><td align="center">PID ${process.pid}</td><td align="center">${restartBotBtn}</td></tr>` +
    `<tr><td>🧠 Memori RAM</td><td align="center">${formatBytesRef(mem.rss)}</td><td align="center">Server RAM</td></tr>` +
    `<tr><td>⏱️ Uptime Node.js</td><td align="center">${Math.round(process.uptime() / 60)} Menit</td><td align="center">Uptime</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>⚠️ Peringatan Emergency Stop:</h3>` +
    `<p>Menghentikan armada akan memutuskan koneksi seluruh userbot yang sedang berjalan. Anda dapat menyalakannya kembali menggunakan tombol <b>🚀 Start Fleet</b>.</p>` +
    `<footer>Ketuk tombol aksi langsung di tabel atau gunakan tombol di bawah:</footer>`;
}

export function panelAdminBackup() {
  const users = getAllRegisteredUsers();

  const downloadBtn = `<tg-button type="callback_data" data="rich:admin_download_backup">📥 Unduh JSON</tg-button>`;

  return `<h1 align="center">💾 Backup Database <sup>BACKUP</sup></h1>` +
    `<p>Pencadangan database MongoDB platform DeltaUserJS.</p>` +
    `<table bordered striped><caption>📦 Manajemen Data</caption>` +
    `<tr><th>Layanan Database</th><th>Status / Nilai</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>📦 Backup MongoDB</td><td align="center">${users.length} Akun Terdaftar</td><td align="center">${downloadBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>ℹ️ Format Backup:</h3>` +
    `<p>File backup dikirimkan dalam format JSON terstruktur lengkap dengan session string dan custom variables masing-masing userbot. Simpan file ini di tempat aman.</p>` +
    `<footer>Ketuk tombol aksi di tabel atau gunakan tombol di bawah:</footer>`;
}

export function panelAdminSettings() {
  const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';

  const toggleApproveBtn = `<tg-button type="callback_data" data="rich:admin_toggle_auto_approve">${autoApprove ? '🔒 Ubah ke Manual' : '🌐 Ubah ke Bebas'}</tg-button>`;

  return `<h1 align="center">⚙️ Pengaturan Cepat Sistem <sup>CONFIG</sup></h1>` +
    `<p>Konfigurasi parameter global platform tanpa restart server atau edit file .env.</p>` +
    `<table bordered striped><caption>🛠️ Parameter Global Platform</caption>` +
    `<tr><th>Parameter Sistem</th><th>Setelan Saat Ini</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>🛡️ Mode Registrasi</td><td align="center"><b>${autoApprove ? '🌐 Buka Bebas (Auto-Approve)' : '🔒 Butuh Approval Manual'}</b></td><td align="center">${toggleApproveBtn}</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Penjelasan Mode Registrasi:</h3>` +
    `<ul>` +
    `<li><b>🔒 Butuh Approval Manual</b>: Setiap pendaftar baru wajib disetujui owner secara manual sebelum bisa scan QR / OTP.</li>` +
    `<li><b>🌐 Buka Bebas (Auto-Approve)</b>: Pengguna baru langsung dapat mendaftar tanpa menunggu konfirmasi owner.</li>` +
    `</ul>` +
    `<footer>Ketuk tombol aksi di tabel atau gunakan tombol di bawah:</footer>`;
}

export function panelStats(_ctx) {
  const users = getAllRegisteredUsers();
  const running = userbotManager.clients.size;
  const premCount = users.filter((u: any) => u.is_telegram_premium === 1).length;
  const mem = process.memoryUsage();
  return `<h1 align="center">📊 System Analytics <sup>METRICS</sup></h1>` +
    `<p>Ringkasan performa server dan konsumsi memori runtime.</p>` +
    `<table bordered striped>` +
    `<tr><th>Metrik Performa</th><th>Statistik</th><th>Keterangan</th></tr>` +
    `<tr><td>👥 Total Pengguna</td><td align="center">${users.length} Akun</td><td>Terdaftar di DB</td></tr>` +
    `<tr><td>⭐ Telegram Premium</td><td align="center">${premCount} Akun</td><td>Member Premium</td></tr>` +
    `<tr><td>⚡ Userbot Aktif</td><td align="center">${running} Running</td><td>Teleproto 229</td></tr>` +
    `<tr><td>⏱️ Server Uptime</td><td align="center">${Math.round(process.uptime() / 60)} Menit</td><td>Node.js Runtime</td></tr>` +
    `<tr><td>💾 RAM Resident</td><td align="center">${formatBytesRef(mem.rss)}</td><td>Total Memori Fisik</td></tr>` +
    `<tr><td>🧠 Heap Memory</td><td align="center">${formatBytesRef(mem.heapUsed)} / ${formatBytesRef(mem.heapTotal)}</td><td>Alokasi V8 Engine</td></tr>` +
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

export function panelUserLoops(ctx: any, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter(s => s.type === 'loop');
  const running = userbotManager.isRunning(telegramId);

  const totalPages = Math.max(1, Math.ceil(loops.length / LOOPS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * LOOPS_PER_PAGE;
  const pageItems = loops.slice(start, start + LOOPS_PER_PAGE);

  let rows: string;
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

export function panelQuickHelp(_ctx) {
  return `<h1 align="center">📚 Pusat Bantuan &amp; Panduan <sup>GUIDE</sup></h1>` +
    `<p>Selamat datang di Pusat Bantuan <b>DeltaUserJS</b>.<br>` +
    `Temukan panduan lengkap, cheatsheet perintah, dan solusi kendala di bawah ini.</p>` +
    `<table bordered striped>` +
    `<tr><th>Topik Bantuan</th><th>Deskripsi</th></tr>` +
    `<tr><td>🚀 Panduan Mulai</td><td>Langkah pertama konfigurasi userbot baru</td></tr>` +
    `<tr><td>📜 Cheatsheet Perintah</td><td>Daftar perintah wajib tahu &amp; terpopuler</td></tr>` +
    `<tr><td>❓ FAQ &amp; Kendala</td><td>Pertanyaan umum dan solusi troubleshooting</td></tr>` +
    `<tr><td>💬 Hubungi Owner</td><td>Konsultasi langsung untuk bantuan teknis</td></tr>` +
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
    `<tr><td>1. Tes Koneksi</td><td>Kirim <code>.alive</code></td><td>Menampilkan kartu status bot di chat</td></tr>` +
    `<tr><td>2. Cek Kecepatan</td><td>Kirim <code>.ping</code></td><td>Mengukur responsivitas koneksi</td></tr>` +
    `<tr><td>3. Amankan Akun</td><td>Aktifkan Anti-PM</td><td>Mencegah spam pesan pribadi</td></tr>` +
    `<tr><td>4. Buka Modul</td><td>Kirim <code>.help</code></td><td>Membuka pustaka ${loadedPlugins.length} plugin aktif</td></tr>` +
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
    `<tr><td><code>${p}alive</code></td><td>Informasi</td><td>Kartu status userbot &amp; engine</td></tr>` +
    `<tr><td><code>${p}ping</code></td><td>Informasi</td><td>Cek latensi koneksi &amp; respon</td></tr>` +
    `<tr><td><code>${p}afk [alasan]</code></td><td>Status</td><td>Pasang pesan sibuk otomatis</td></tr>` +
    `<tr><td><code>${p}antipm on/off</code></td><td>Keamanan</td><td>Proteksi spam pesan pribadi</td></tr>` +
    `<tr><td><code>${p}tagall [pesan]</code></td><td>Grup &amp; Admin</td><td>Mention seluruh member grup</td></tr>` +
    `<tr><td><code>${p}purge</code></td><td>Moderasi</td><td>Hapus pesan massal sekaligus</td></tr>` +
    `<tr><td><code>${p}gcast [pesan]</code></td><td>Broadcast</td><td>Siaran pesan ke semua grup userbot</td></tr>` +
    `<tr><td><code>${p}tr [lang] [teks]</code></td><td>Utilitas</td><td>Terjemah bahasa internasional</td></tr>` +
    `<tr><td><code>${p}tts [teks]</code></td><td>Media</td><td>Ubah teks ke pesan suara (VN)</td></tr>` +
    `<tr><td><code>${p}brat [teks]</code></td><td>Stiker</td><td>Buat stiker animasi gaya brat</td></tr>` +
    `<tr><td><code>${p}quote</code></td><td>Kreatif</td><td>Ubah pesan chat menjadi stiker quote</td></tr>` +
    `<tr><td><code>${p}sangmata</code></td><td>Investigasi</td><td>Cek riwayat pergantian nama user</td></tr>` +
    `<tr><td><code>${p}id</code></td><td>Tools</td><td>Cek ID chat, user, atau channel</td></tr>` +
    `<tr><td><code>${p}calc [rumus]</code></td><td>Tools</td><td>Kalkulator matematika cepat</td></tr>` +
    `<tr><td><code>${p}weather [kota]</code></td><td>Utilitas</td><td>Prakiraan cuaca terkini</td></tr>` +
    `<tr><td><code>${p}help</code></td><td>Bantuan</td><td>Buka katalog inline ${loadedPlugins.length} modul</td></tr>` +
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
    `<tr><td>${escapeHtml(ewalletName)}</td><td align="center">${ewalletCell}</td><td>Tap untuk salin</td></tr>` +
    `<tr><td>${escapeHtml(bankName)}</td><td align="center">${bankCell}</td><td>Tap untuk salin</td></tr>` +
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
    return `<tr><td><code>${escapeHtml(user.telegram_id)}</code></td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? '✅ Aktif' : '❌ Nonaktif'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot</td></tr>';

  return `<h1 align="center">🩺 Server Health <sup>STATUS</sup></h1>` +
    `<p>Status runtime, database cluster, dan kesehatan userbot aktif.</p>` +
    `<table bordered striped>` +
    `<tr><th>Komponen</th><th>Status</th><th>Keterangan</th></tr>` +
    `<tr><td>🍃 MongoDB Cluster</td><td align="center">${mongoStatus}</td><td>Primary Replica</td></tr>` +
    `<tr><td>⚡ Userbot Engine</td><td align="center">${userbotManager.clients.size} Running</td><td>Teleproto Layer 229</td></tr>` +
    `<tr><td>⏱️ Waktu Aktif</td><td align="center">${Math.round(process.uptime() / 60)} Menit</td><td>Server Uptime</td></tr>` +
    `<tr><td>📦 Runtime Versi</td><td align="center">Node ${process.version}</td><td>${process.platform} ${process.arch}</td></tr>` +
    `<tr><td>🧩 Modul Plugin</td><td align="center">${loadedPlugins.length} Modul</td><td>Hot-Reload Siap</td></tr>` +
    `</table>` +
    `<table bordered striped><caption>👥 Snapshot Sesi Pengguna</caption>` +
    `<tr><th>ID Pengguna</th><th>Status</th><th>Langganan</th></tr>` +
    rows +
    `</table>` +
    `<footer>Monitoring kesehatan sistem &amp; kluster basis data.</footer>`;
}

// ==========================================================================
// SECTION 2 — KEYBOARDS
// ==========================================================================
