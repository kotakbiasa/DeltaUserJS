/** Help, loops, donation, and health panel builders. */
import { getAllRegisteredUsers, getSchedules, getUserbotSession } from '../../../../../infrastructure/database.js';
import userbotManager from '../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../utils/richMessage.js';
import { LOOPS_PER_PAGE, getSystemVarValue } from '../shared.js';

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

