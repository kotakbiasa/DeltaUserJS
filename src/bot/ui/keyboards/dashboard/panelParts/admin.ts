/** Admin and system statistics panel builders. */
import { getAllRegisteredUsers, getDisabledPlugins, getUserbotSession } from '../../../../../infrastructure/database.js';
import userbotManager from '../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../userbot/engine/pluginRegistry.js';
import { formatBytesShort as formatBytesRef } from '../../../../../utils/format.js';
import { escapeHtml } from '../../../../../utils/richMessage.js';
import {
  getApprovedUserMeta,
  getApprovedUsers,
  getPendingApprovals,
  isApproved,
} from '../../../../state/approvedUsers.js';
import {
  ADMIN_USERS_PER_PAGE,
  formatTelegramPremiumBadge,
  getCombinedAdminUsers,
  getSystemVarValue,
} from '../shared.js';

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
  const premCount = users.filter(u => u.is_telegram_premium === 1).length;
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

