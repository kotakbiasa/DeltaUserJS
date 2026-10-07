/** Help, loops, donation, and health panel builders. */
import type { Context } from 'grammy';
import { getAllRegisteredUsers, getSchedules, getUserbotSession } from '../../../../../infrastructure/database.js';
import userbotManager from '../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../utils/richMessage.js';
import { LOOPS_PER_PAGE, getSystemVarValue } from '../shared.js';
import type { BotContext } from '../../../../context.js';

export function panelUserLoops(ctx: BotContext, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter((s: { type?: string }) => s.type === 'loop');
  const running = userbotManager.isRunning(telegramId);

  const totalPages = Math.max(1, Math.ceil(loops.length / LOOPS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * LOOPS_PER_PAGE;
  const pageItems = loops.slice(start, start + LOOPS_PER_PAGE);

  let rows: string;
  if (pageItems.length === 0) {
    rows = `<tr><td colspan="4" align="center"><i>Belum ada jadwal loop/broadcast yang tersimpan.</i></td></tr>`;
  } else {
    rows = pageItems.map((item: { chatKey?: string; message?: string; value?: string | number }, idx: number) => {
      const num = start + idx + 1;
      const targetStr = escapeHtml(String(item.chatKey));
      const itemMessage = String(item.message ?? '');
      const shortMsg = itemMessage.length > 20
        ? escapeHtml(itemMessage.substring(0, 20)) + '...'
        : escapeHtml(itemMessage);
      const encodedTarget = Buffer.from(String(item.chatKey ?? ''), 'utf8').toString('base64url');
      const delBtn = `<tg-button type="callback_data" data="rich:del_loop:${encodedTarget}">⏹️ Hapus</tg-button>`;
      return `<tr><td><b>${num}.</b> <code>${targetStr}</code></td><td align="center">${item.value}m</td><td><i>"${shortMsg}"</i></td><td align="center">${delBtn}</td></tr>`;
    }).join('');
  }

  return `<h1 align="center">⏰ Visual Broadcast Scheduler</h1>` +
    `<blockquote><b>Penjadwal Pesan Otomatis</b><br/>Kirim pesan berkala ke grup atau kontak secara otomatis tanpa mengetik manual.</blockquote>` +
    `<table bordered striped><caption>🔁 Jadwal Loop Tersimpan (${loops.length})</caption>` +
    `<tr><th>Target Chat</th><th align="center">Interval</th><th>Cuplikan</th><th align="center">Aksi</th></tr>` +
    rows +
    `</table>` +
    `<details><summary><b>💡 Panduan &amp; Tips Auto-Loop</b></summary>` +
    `<table bordered striped>` +
    `<tr><th>Fitur</th><th>Keterangan</th></tr>` +
    `<tr><td>Interval</td><td>Pesan dikirim berulang sesuai menit yang diatur</td></tr>` +
    `<tr><td>Persistensi</td><td>Tersimpan di database &amp; otomatis aktif saat restart</td></tr>` +
    `<tr><td>Perintah Chat</td><td>Dapat diatur via <code>.loop &lt;menit&gt; &lt;pesan&gt;</code> &amp; <code>.rmloop</code></td></tr>` +
    `</table>` +
    `</details>` +
    (running
      ? `<footer>🟢 Userbot online: Seluruh jadwal broadcast berjalan otomatis.</footer>`
      : `<footer>🟡 Userbot offline: Jadwal akan aktif begitu userbot dinyalakan.</footer>`);
}

export function panelQuickHelp(_ctx: BotContext) {
  return `<h1 align="center">📚 Pusat Bantuan &amp; Panduan</h1>` +
    `<blockquote>Selamat datang di Pusat Bantuan <b>DeltaUserJS</b>.<br/>` +
    `Temukan panduan cepat, cheatsheet perintah, dan solusi kendala di bawah ini.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Topik Bantuan</th><th>Deskripsi</th></tr>` +
    `<tr><td>🚀 Panduan Mulai</td><td>Langkah pertama konfigurasi userbot baru</td></tr>` +
    `<tr><td>📜 Cheatsheet</td><td>Daftar 16 perintah wajib tahu &amp; terpopuler</td></tr>` +
    `<tr><td>❓ FAQ &amp; Kendala</td><td>Pertanyaan umum dan solusi masalah</td></tr>` +
    `<tr><td>💬 Hubungi Owner</td><td>Konsultasi langsung untuk bantuan teknis</td></tr>` +
    `</table>` +
    `<details><summary><b>💡 Perintah Bantuan Cepat di Obrolan</b></summary>` +
    `<p>Kirim perintah <code>.help</code> di chat mana pun untuk membuka pustaka interaktif ${loadedPlugins.length} modul bawaan.</p>` +
    `</details>` +
    `<footer>Pilih topik panduan pada tombol di bawah:</footer>`;
}

export function panelHelpQuickstart() {
  return `<h1 align="center">🚀 Panduan Mulai Cepat</h1>` +
    `<blockquote>4 langkah mudah memaksimalkan userbot Anda setelah berhasil login:</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Langkah</th><th>Tindakan</th><th>Keterangan</th></tr>` +
    `<tr><td>1. Tes Koneksi</td><td>Kirim <code>.alive</code></td><td>Menampilkan kartu status bot</td></tr>` +
    `<tr><td>2. Cek Kecepatan</td><td>Kirim <code>.ping</code></td><td>Mengukur responsivitas koneksi</td></tr>` +
    `<tr><td>3. Amankan Akun</td><td>Aktifkan Anti-PM</td><td>Mencegah spam pesan pribadi</td></tr>` +
    `<tr><td>4. Buka Modul</td><td>Kirim <code>.help</code></td><td>Membuka katalog ${loadedPlugins.length} modul aktif</td></tr>` +
    `</table>` +
    `<details><summary><b>💡 Tips Keamanan &amp; Fleksibilitas</b></summary>` +
    `<ul>` +
    `<li>Ubah prefix default (<code>.</code>) menjadi simbol lain di menu <b>Pengaturan &gt; Ganti Prefix</b>.</li>` +
    `<li>Jangan pernah membagikan session string akun Anda kepada siapapun demi keamanan.</li>` +
    `<li>Gunakan tombol <b>Matikan Userbot</b> di Dashboard jika ingin berhenti sementara.</li>` +
    `</ul>` +
    `</details>` +
    `<footer>Panduan resmi onboarding DeltaUserJS.</footer>`;
}

export function panelHelpCommands(ctx?: Context) {
  const session = ctx?.from?.id ? getUserbotSession(ctx.from.id) : null;
  const p = session?.vars?.PREFIX || '.';
  const safeP = escapeHtml(String(p));

  return `<h1 align="center">📜 Cheatsheet 16 Perintah Terpopuler</h1>` +
    `<blockquote>Daftar perintah yang paling sering digunakan (Prefix aktif: <code>${safeP}</code>):</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Perintah</th><th>Kategori</th><th>Fungsi Utama</th></tr>` +
    `<tr><td><code>${safeP}alive</code></td><td>Informasi</td><td>Kartu status userbot &amp; engine</td></tr>` +
    `<tr><td><code>${safeP}ping</code></td><td>Informasi</td><td>Cek latensi koneksi &amp; respon</td></tr>` +
    `<tr><td><code>${safeP}afk [alasan]</code></td><td>Status</td><td>Pasang pesan sibuk otomatis</td></tr>` +
    `<tr><td><code>${safeP}antipm on/off</code></td><td>Keamanan</td><td>Proteksi spam pesan pribadi</td></tr>` +
    `<tr><td><code>${safeP}tagall [pesan]</code></td><td>Grup</td><td>Mention seluruh member grup</td></tr>` +
    `<tr><td><code>${safeP}purge</code></td><td>Moderasi</td><td>Hapus pesan massal sekaligus</td></tr>` +
    `<tr><td><code>${safeP}gcast [pesan]</code></td><td>Broadcast</td><td>Siaran pesan ke semua grup userbot</td></tr>` +
    `<tr><td><code>${safeP}tr [lang] [teks]</code></td><td>Utilitas</td><td>Terjemah bahasa internasional</td></tr>` +
    `<tr><td><code>${safeP}tts [teks]</code></td><td>Media</td><td>Ubah teks ke pesan suara (VN)</td></tr>` +
    `<tr><td><code>${safeP}brat [teks]</code></td><td>Stiker</td><td>Buat stiker animasi gaya brat</td></tr>` +
    `<tr><td><code>${safeP}quote</code></td><td>Kreatif</td><td>Ubah pesan chat menjadi stiker quote</td></tr>` +
    `<tr><td><code>${safeP}sangmata</code></td><td>Investigasi</td><td>Cek riwayat pergantian nama user</td></tr>` +
    `<tr><td><code>${safeP}id</code></td><td>Tools</td><td>Cek ID chat, user, atau channel</td></tr>` +
    `<tr><td><code>${safeP}calc [rumus]</code></td><td>Tools</td><td>Kalkulator matematika cepat</td></tr>` +
    `<tr><td><code>${safeP}weather [kota]</code></td><td>Utilitas</td><td>Prakiraan cuaca terkini</td></tr>` +
    `<tr><td><code>${safeP}help</code></td><td>Bantuan</td><td>Buka katalog inline ${loadedPlugins.length} modul</td></tr>` +
    `</table>` +
    `<details><summary><b>💡 Tips Penggunaan Perintah</b></summary>` +
    `<ul>` +
    `<li>Seluruh perintah di atas dapat langsung dijalankan di grup atau chat pribadi.</li>` +
    `<li>Balas (reply) pesan target saat memakai perintah moderasi seperti <code>${safeP}purge</code> atau <code>${safeP}kang</code>.</li>` +
    `<li>Eksekusi perintah diproses langsung via protokol MTProto Layer 229 tanpa perantara.</li>` +
    `</ul>` +
    `</details>` +
    `<footer>Kirim <code>${safeP}help [nama_modul]</code> di obrolan mana pun untuk panduan modul tertentu.</footer>`;
}

export function panelHelpFaq() {
  return `<h1 align="center">❓ FAQ &amp; Solusi Kendala</h1>` +
    `<blockquote>Jawaban atas pertanyaan yang paling sering diajukan seputar DeltaUserJS:</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Pertanyaan</th><th>Solusi / Penjelasan</th></tr>` +
    `<tr><td>Kenapa userbot offline?</td><td>Server melakukan restart atau sesi terputus. Buka <b>Dashboard Userbot</b> lalu klik <b>⚡ Hidupkan Userbot</b>.</td></tr>` +
    `<tr><td>Apakah sesi saya aman?</td><td>Sangat aman. String sesi dienkripsi dengan standar AES-256 dan hanya digunakan untuk akun Anda sendiri.</td></tr>` +
    `<tr><td>Bagaimana cara ubah nama bot?</td><td>Buka menu <b>Pengaturan</b> &gt; <b>🏷️ Ganti Nama Bot</b>, lalu kirim nama yang Anda inginkan.</td></tr>` +
    `<tr><td>Berapa umur akun minimal?</td><td>Disarankan akun Telegram berusia minimal 6 bulan – 1 tahun untuk meminimalkan risiko pembatasan oleh Telegram.</td></tr>` +
    `<tr><td>Bagaimana jika kena limit Telegram?</td><td>Hindari broadcast masal ke terlalu banyak grup dalam waktu berdekatan. Gunakan jeda wajar.</td></tr>` +
    `</table>` +
    `<details><summary><b>🆘 Masih Butuh Bantuan Lanjutan?</b></summary>` +
    `<p>Jika kendala Anda belum terselesaikan, silakan hubungi owner langsung melalui tombol <b>💬 Hubungi Owner</b> di bawah.</p>` +
    `</details>` +
    `<footer>Pusat Layanan Bantuan DeltaUserJS.</footer>`;
}

export function panelDonate(_ctx: BotContext) {
  const ewallet = getSystemVarValue('DONATE_EWALLET', '');
  const bank = getSystemVarValue('DONATE_BANK', '');
  const ewalletName = getSystemVarValue('DONATE_EWALLET_NAME', 'e-Wallet');
  const bankName = getSystemVarValue('DONATE_BANK_NAME', 'Transfer Bank');

  const ewalletCell = ewallet ? `<tg-spoiler><code>${escapeHtml(ewallet)}</code></tg-spoiler>` : '<i>Belum diset</i>';
  const bankCell = bank ? `<tg-spoiler><code>${escapeHtml(bank)}</code></tg-spoiler>` : '<i>Belum diset</i>';

  return `<h1>💰 Dukungan &amp; Donasi</h1>` +
    `<blockquote>Dukungan Anda membantu operasional server dan maintenance berkelanjutan. Nomor tersembunyi — tap untuk melihat.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Metode Donasi</th><th align="center">Nomor / Rekening</th></tr>` +
    `<tr><td>${escapeHtml(ewalletName)}</td><td align="center">${ewalletCell}</td></tr>` +
    `<tr><td>${escapeHtml(bankName)}</td><td align="center">${bankCell}</td></tr>` +
    `</table>` +
    `<details><summary><b>💖 Konfirmasi &amp; Reward Donasi</b></summary>` +
    `<p>Setelah melakukan transfer atau donasi, silakan kirimkan bukti transfer ke kontak Owner untuk mendapatkan status VIP atau perpanjangan masa aktif userbot.</p>` +
    `</details>` +
    `<footer>Terima kasih atas dukungan Anda terhadap pengembangan platform ini.</footer>`;
}

export function panelHealth(mongoStatus = 'Unknown') {
  const users = getAllRegisteredUsers();
  const rows = users.slice(0, 5).map(user => {
    const running = userbotManager.isRunning(user.telegram_id) ? '🟢' : '🔴';
    return `<tr><td><code>${escapeHtml(user.telegram_id)}</code></td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? '✅ Aktif' : '❌ Nonaktif'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot</td></tr>';

  return `<h1>🩺 Server Health</h1>` +
    `<blockquote>Status runtime, database cluster, dan kesehatan userbot aktif.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Komponen</th><th align="center">Status / Nilai</th></tr>` +
    `<tr><td>🍃 MongoDB Cluster</td><td align="center">${mongoStatus} (Primary)</td></tr>` +
    `<tr><td>⚡ Userbot Engine</td><td align="center">${userbotManager.clients.size} Client Active</td></tr>` +
    `<tr><td>⏱️ Waktu Aktif</td><td align="center">${Math.round(process.uptime() / 60)} Menit</td></tr>` +
    `<tr><td>📦 Runtime Versi</td><td align="center">Node ${process.version}</td></tr>` +
    `<tr><td>🧩 Modul Plugin</td><td align="center">${loadedPlugins.length} Modul Siap</td></tr>` +
    `</table>` +
    `<table bordered striped><caption>👥 Snapshot Sesi Pengguna</caption>` +
    `<tr><th>ID Pengguna</th><th align="center">Engine</th><th align="center">Langganan</th></tr>` +
    `rows` +
    `</table>` +
    `<footer>Monitoring kesehatan sistem &amp; kluster basis data.</footer>`.replace('`rows`', rows);
}
