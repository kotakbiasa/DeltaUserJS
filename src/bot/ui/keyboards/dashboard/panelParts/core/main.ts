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
        `<blockquote>⏳ <b>Menunggu Persetujuan</b><br>` +
        `Halo, <b>${escapeHtml(firstName)}</b>! Permohonan pendaftaran akun Anda sedang dalam proses peninjauan oleh Owner.</blockquote>` +
        `<table bordered striped>` +
        `<tr><th>Tahap Pendaftaran</th><th align="center">Status</th></tr>` +
        `<tr><td>1. Request Akses</td><td align="center">✅ Terkirim</td></tr>` +
        `<tr><td>2. Review Owner</td><td align="center">⏳ Menunggu</td></tr>` +
        `<tr><td>3. Tautkan Akun</td><td align="center">🔒 Terkunci</td></tr>` +
        `<tr><td>4. Userbot Aktif</td><td align="center">🔒 Terkunci</td></tr>` +
        `</table>` +
        `<blockquote>ℹ️ <i>Bot akan otomatis mengirim notifikasi saat akun Anda disetujui. Ketuk tombol di bawah untuk memperbarui status.</i></blockquote>`;
    }

    if (approved) {
      return `<h1 align="center">⚡ DeltaUserJS Manager</h1>` +
        `<blockquote>🎉 <b>Akses Disetujui!</b><br>` +
        `Halo, <b>${escapeHtml(firstName)}</b>! Akun Anda siap untuk ditautkan ke userbot.</blockquote>` +
        `<table bordered striped>` +
        `<tr><th>Tahap Pendaftaran</th><th align="center">Status</th></tr>` +
        `<tr><td>1. Izin &amp; Approval Owner</td><td align="center">✅ Disetujui</td></tr>` +
        `<tr><td>2. Tautkan Akun Telegram</td><td align="center">🔑 Siap Login (QR / OTP)</td></tr>` +
        `<tr><td>3. Aktivasi Engine Userbot</td><td align="center">⚡ Siap Aktif</td></tr>` +
        `</table>` +
        `<blockquote>👉 <i>Ketuk tombol <b>🚀 Mulai Daftar Userbot</b> di bawah untuk menghubungkan via QR Code atau OTP.</i></blockquote>`;
    }

    return `<h1 align="center">⚡ DeltaUserJS <sup>v2.4</sup></h1>` +
      `<blockquote>Halo, <b>${escapeHtml(firstName)}</b>! Selamat datang di <b>${escapeHtml(botName)}</b>.<br>` +
      `Platform modular untuk mengelola userbot Telegram Anda dengan mudah, cepat, dan aman.</blockquote>` +
      `<table bordered striped>` +
      `<tr><th>Layanan Platform</th><th align="center">Status</th></tr>` +
      `<tr><td>🤖 Userbot Engine</td><td align="center">🟢 mtcute Layer 229</td></tr>` +
      `<tr><td>⭐ Akun Telegram</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td></tr>` +
      `<tr><td>🛡️ Izin Akses</td><td align="center">🔒 Perlu Persetujuan</td></tr>` +
      `<tr><td>🧰 Modul Tersedia</td><td align="center">${loadedPlugins.length} Plugin Aktif</td></tr>` +
      `</table>` +
      `<blockquote>🚀 <b>Alur Pendaftaran:</b> Ajukan akses &rarr; Tunggu persetujuan owner &rarr; Login Scan QR / OTP &rarr; Userbot aktif!</blockquote>`;
  }

  // Tampilan Menu Utama untuk Pengguna Terdaftar (Portal Ringkas & Segar)
  return `<h1>⚡ DeltaUserJS Portal</h1>` +
    `<blockquote>Halo, <b>${escapeHtml(firstName)}</b>! Selamat datang di <b>${escapeHtml(botName)}</b>.<br/>` +
    `Pusat kendali &amp; portal manajemen akun userbot Anda.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Layanan Utama</th><th align="center">Status</th></tr>` +
    `<tr><td>🤖 Status Engine</td><td align="center">${running ? '🟢 Online (mtcute)' : '🔴 Offline'}</td></tr>` +
    `<tr><td>⭐ Akun Telegram</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td></tr>` +
    `<tr><td>🔑 Status Akses</td><td align="center">🟢 Akses Penuh</td></tr>` +
    `<tr><td>🧰 Modul Plugin</td><td align="center"><b>${loadedPlugins.length}</b> Tersedia</td></tr>` +
    `</table>` +
    `<footer>Gunakan menu navigasi di bawah untuk mengelola userbot Anda:</footer>`;
}

export function panelMenuList(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const hasBot = !!session;
  const running = hasBot && userbotManager.isRunning(ctx.from.id);

  const statusLine = !hasBot
    ? '🔴 Belum Terdaftar'
    : (running ? '🟢 Online' : '🟡 Offline');

  return `<h1>🎛️ Panel Menu Navigasi</h1>` +
    `<blockquote>Status Akun: <b>${statusLine}</b> · Pustaka: <b>${loadedPlugins.length} Plugin</b></blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Menu Layanan</th><th align="center">Akses</th></tr>` +
    (hasBot
      ? `<tr><td>🤖 Dashboard Userbot</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>🧩 Plugin Studio</td><td align="center">🟢 ${loadedPlugins.length} Modul</td></tr>` +
        `<tr><td>⚙️ Pengaturan Fitur</td><td align="center">🟢 Siap</td></tr>` +
        `<tr><td>🩺 Uji Diagnostik</td><td align="center">🟢 MTProto</td></tr>`
      : `<tr><td>🚀 Registrasi Akun</td><td align="center">🟡 Mulai</td></tr>`) +
    (isOwner(ctx) ? `<tr><td>👑 Panel Owner</td><td align="center">🔴 Admin</td></tr>` : '') +
    `</table>` +
    `<footer>Ketuk salah satu tombol menu di bawah untuk melanjutkan:</footer>`;
}

export function panelUserbot(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {
    const approved = canRegister(ctx);
    if (approved) {
      return `<h1>🚀 Status Pendaftaran</h1>` +
        `<p>Akun Anda <b>sudah disetujui</b> oleh owner, tetapi Anda belum menghubungkan sesi Telegram.</p>` +
        `<table bordered striped>` +
        `<tr><th>Tahapan</th><th align="center">Status</th></tr>` +
        `<tr><td>Status Izin</td><td align="center">✅ Disetujui (Approved)</td></tr>` +
        `<tr><td>Sesi Userbot</td><td align="center">⚪ Belum Ditautkan</td></tr>` +
        `</table>` +
        `<footer>Silakan ketuk tombol 🚀 Mulai Daftar Userbot di bawah untuk menghubungkan via QR Code atau OTP.</footer>`;
    }
    return `<h1>❌ Sesi Tidak Ditemukan</h1>` +
      `<p>Akun Anda belum terdaftar di DeltaUserJS. Silakan hubungkan akun terlebih dahulu via <code>/daftar</code>.</p>` +
      `<footer>Ketik /menu untuk membuka menu utama.</footer>`;
  }
  const running = userbotManager.isRunning(ctx.from.id);
  const isTgPremium = isTelegramPremium(ctx, session);
  const ubot = userbotManager.clients.get(ctx.from.id);
  const isConnected = running && Boolean(ubot?.isConnected?.());
  const dcId = ubot?.dcId ? String(ubot.dcId) : '—';
  const botName = session?.custom_name || ctx.me?.first_name || 'Bot';
  const currentPrefix = session?.vars?.PREFIX || '.';
  const disabled = normalizedDisabled(ctx.from.id);
  const activePlugins = Math.max(0, loadedPlugins.length - disabled.length);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;
  const flood = userbotManager.getFloodStatus(ctx.from.id);
  const mySchedules = getSchedules(ctx.from.id);
  const loopCount = mySchedules.filter((s: { type?: string }) => s.type === 'loop').length;

  const connBadge = running
    ? (isConnected ? '🟢 Online &amp; Terhubung' : '🟡 Menghubungkan...')
    : '🔴 Offline / Mati';

  const connStatus = running
    ? (isConnected ? '🟢 Online' : '🟡 Menghubungkan...')
    : '🔴 Offline';

  const phoneText = session?.phone
    ? `<tg-spoiler>${escapeHtml(session.phone.startsWith('+') ? session.phone : `+${session.phone}`)}</tg-spoiler>`
    : '<i>Disembunyikan</i>';

  const floodBanner = flood.inCooldown
    ? `<blockquote>⚠️ <b>Mode Hibernasi FloodGuard Aktif</b><br/>` +
      `Akun dalam jeda aman Telegram (<b>${flood.secondsLeft} detik tersisa</b>) untuk mencegah pembatasan akun. Aksi keluar ditahan otomatis.</blockquote>`
    : '';

  return `<h1>🤖 Dashboard Userbot</h1>` +
    floodBanner +
    `<blockquote>` +
    `<b>Status:</b> ${connBadge}<br/>` +
    `<b>Engine:</b> mtcute Layer 229 · Telegram DC ${dcId}<br/>` +
    `<b>Prefix:</b> <code>${escapeHtml(currentPrefix)}</code> &nbsp;|&nbsp; <b>Modul:</b> 🟢 ${activePlugins}/${loadedPlugins.length} Aktif` +
    `</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Fitur &amp; Proteksi</th><th align="center">Status</th></tr>` +
    `<tr><td>⚡ Daya Userbot</td><td align="center">${connStatus}</td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM</td><td align="center">${badge(isAntiPm, '🟢 ON', '⚪ OFF')}</td></tr>` +
    `<tr><td>💤 Mode AFK Auto</td><td align="center">${badge(isAfk, '🟢 ON', '⚪ OFF')}</td></tr>` +
    `<tr><td>⏰ Auto-Loop Broadcast</td><td align="center"><b>${loopCount}</b> Jadwal</td></tr>` +
    `<tr><td>⏱️ FloodGuard Telegram</td><td align="center">${flood.inCooldown ? `⏳ Cooldown (${flood.secondsLeft}s)` : '🟢 Normal'}</td></tr>` +
    `</table>` +
    `<details>` +
    `<summary>👤 Profil Akun &amp; Sesi</summary>` +
    `<table bordered>` +
    `<tr><td>📱 Nomor Telegram</td><td align="center">${phoneText}</td></tr>` +
    `<tr><td>🆔 ID Pengguna</td><td align="center"><code>${ctx.from.id}</code></td></tr>` +
    `<tr><td>⭐ Telegram Premium</td><td align="center">${formatTelegramPremiumBadge(isTgPremium)}</td></tr>` +
    `<tr><td>🏷️ Nama Kustom Bot</td><td align="center"><b>${escapeHtml(botName)}</b></td></tr>` +
    `</table>` +
    `</details>` +
    `<details>` +
    `<summary>💡 Cheatsheet Perintah Cepat (${escapeHtml(currentPrefix)})</summary>` +
    `<code>${escapeHtml(currentPrefix)}ping</code> — Uji latensi koneksi MTProto<br/>` +
    `<code>${escapeHtml(currentPrefix)}alive</code> — Cek status engine userbot<br/>` +
    `<code>${escapeHtml(currentPrefix)}help</code> — Buka pustaka perintah interaktif<br/>` +
    `<code>${escapeHtml(currentPrefix)}afk [alasan]</code> — Set status sibuk &amp; auto-reply<br/>` +
    `<code>${escapeHtml(currentPrefix)}purge</code> — Hapus pesan massal via reply<br/>` +
    `<code>${escapeHtml(currentPrefix)}tagall [teks]</code> — Mention semua member grup` +
    `</details>` +
    `<footer>Pilih menu kendali pada tombol di bawah:</footer>`;
}
