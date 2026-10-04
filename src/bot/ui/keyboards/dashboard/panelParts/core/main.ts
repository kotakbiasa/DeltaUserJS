/**
 * Panel utama, daftar menu, dan status userbot.
 *
 * Dipecah dari panelParts/core.ts (721 baris). Isi tiap fungsi dipindahkan
 * apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import { getSchedules, getUserbotSession } from '../../../../../../infrastructure/database.js';
import userbotManager from '../../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../../utils/richMessage.js';
import { isPendingApproval } from '../../../../../state/approvedUsers.js';
import { badge, canRegister, formatTelegramPremiumBadge, isOwner, isTelegramPremium, normalizedDisabled, userInfo } from '../../shared.js';
import type { BotContext } from '../../../../../context.js';

export function panelMain(ctx: BotContext) {
  const { firstName, botName } = userInfo(ctx);
  const session = getUserbotSession(ctx.from.id);
  const isRegistered = !!session;
  const isTgPremium = isTelegramPremium(ctx, session);
  const running = isRegistered && userbotManager.isRunning(ctx.from.id);

  if (!isRegistered) {
    const approved = canRegister(ctx);
    const pending = isPendingApproval(ctx.from.id);

    if (pending && !approved) {
      return `<h1 align="center">⚡ DeltaUserJS Manager</h1>` +
        `<p>Halo, <b>${escapeHtml(firstName)}</b>!<br>` +
        `Permohonan pendaftaran akun Anda sedang menunggu persetujuan owner.</p>` +
        `<table bordered striped>` +
        `<tr><th>Tahap Pendaftaran</th><th>Status</th><th>Keterangan</th></tr>` +
        `<tr><td>1. Request Approval</td><td align="center">✅ Selesai</td><td>Terkirim ke Owner</td></tr>` +
        `<tr><td>2. Review Owner</td><td align="center">⏳ Menunggu</td><td>Sedang Ditinjau</td></tr>` +
        `<tr><td>3. Tautkan Akun</td><td align="center">🔒 Terkunci</td><td>Scan QR / OTP</td></tr>` +
        `<tr><td>4. Userbot Aktif</td><td align="center">🔒 Terkunci</td><td>mtcute 229</td></tr>` +
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
      `<tr><td>🤖 Userbot Engine</td><td align="center">🟢 Online</td><td>mtcute Layer 229</td></tr>` +
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
    `<tr><td>🤖 Status Userbot</td><td align="center">${running ? '🟢 Online' : '🔴 Offline'}</td><td>${running ? 'mtcute 229' : 'Siap Dijalankan'}</td></tr>` +
    `<tr><td>⭐ Akun Telegram</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td><td>Telegram Resmi</td></tr>` +
    `<tr><td>🛡️ Status Akses</td><td align="center">🟢 Disetujui</td><td>Akses Penuh</td></tr>` +
    `<tr><td>⚡ Core Engine</td><td align="center">mtcute Layer 229</td><td>Layer MTProto</td></tr>` +
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

export function panelMenuList(ctx: BotContext) {
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

export function panelUserbot(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {
    const approved = canRegister(ctx);
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
  const dcId = String((ubot?.client?.session as unknown as { dcId?: string | number })?.dcId || '4');
  const botName = session?.custom_name || ctx.me?.first_name || 'Bot';
  const currentPrefix = session?.vars?.PREFIX || '.';
  const disabled = normalizedDisabled(ctx.from.id);
  const activePlugins = Math.max(0, loadedPlugins.length - disabled.length);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;
  const flood = userbotManager.getFloodStatus(ctx.from.id);
  const mySchedules = getSchedules(ctx.from.id);
  const loopCount = mySchedules.filter((s: { type?: string }) => s.type === 'loop').length;

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
    ? `<tg-spoiler>${escapeHtml(session.phone.startsWith('+') ? session.phone : `+${session.phone}`)}</tg-spoiler>`
    : '<i>Disembunyikan</i>';

  const floodBanner = flood.inCooldown
    ? `<h3>⚠️ Mode Hibernasi FloodGuard Aktif</h3>` +
      `<p>Akun dalam jeda aman Telegram (<b>${flood.secondsLeft} detik tersisa</b>) untuk mencegah pembatasan akun. Aksi keluar ditahan otomatis hingga hitungan mundur selesai.</p><hr/>`
    : '';

  return `<h1 align="center">🤖 Dashboard ${escapeHtml(botName)} <sup>PRO</sup></h1>` +
    floodBanner +
    `<h3>${running ? '🟢 Status: Online' : '🔴 Status: Offline'}</h3>` +
    `<p>mtcute Layer 229 · Telegram Datacenter DC ${dcId} · Latensi Real-time</p>` +
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
