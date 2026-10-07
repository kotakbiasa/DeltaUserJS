/**
 * Panel ToS, registrasi, langganan, hapus sesi, dan akses ditolak.
 *
 * Dipecah dari panelParts/core.ts (721 baris). Isi tiap fungsi dipindahkan
 * apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import { getUserbotSession } from '../../../../../../infrastructure/database.js';
import userbotManager from '../../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../../utils/richMessage.js';
import { isPendingApproval } from '../../../../../state/approvedUsers.js';
import { canRegister, formatTelegramPremiumBadge, isOwner, isTelegramPremium } from '../../shared.js';
import type { BotContext } from '../../../../../context.js';

export function panelTermsOfService(ctx: BotContext) {
  const firstName = escapeHtml(ctx.from?.first_name || 'User');
  return `<h1 align="center">📜 Syarat &amp; Ketentuan Layanan</h1>` +
    `<blockquote>Halo, <b>${firstName}</b>!<br>` +
    `Sebelum menghubungkan akun Telegram Anda ke platform DeltaUserJS, mohon baca dan pahami ketentuan berikut:</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Poin Ketentuan</th><th align="center">Penjelasan</th></tr>` +
    `<tr><td>⏳ Umur Akun</td><td>Disarankan akun Telegram berusia minimal 6 bulan – 1 tahun (bukan akun fresh/baru) untuk menghindari limit atau ban otomatis dari Telegram.</td></tr>` +
    `<tr><td>🔐 Keamanan Sesi</td><td>Sesi login dienkripsi AES-256. Jangan pernah bagikan OTP / Session ke siapa pun.</td></tr>` +
    `<tr><td>⚖️ Tanggung Jawab</td><td>Penggunaan userbot sepenuhnya tanggung jawab pemilik akun. Hindari spamming liar.</td></tr>` +
    `<tr><td>🛡️ Batasan Server</td><td>Pengembang tidak bertanggung jawab atas limit/flood akun akibat spam pengguna.</td></tr>` +
    `<tr><td>🗑️ Hak Akses Sesi</td><td>Anda berhak menghentikan atau menghapus sesi login kapan saja via dashboard.</td></tr>` +
    `</table>` +
    `<blockquote>⚠️ <b>Pernyataan Persetujuan:</b><br>` +
    `Dengan menekan tombol <b>✅ Saya Setuju &amp; Lanjutkan</b> di bawah, Anda menyatakan telah membaca, memahami, dan mematuhi seluruh syarat dan ketentuan layanan.</blockquote>`;
}

export function panelTermsDeclined(ctx: BotContext) {
  const firstName = escapeHtml(ctx.from?.first_name || 'User');
  return `<h1 align="center">❌ Pendaftaran Dibatalkan</h1>` +
    `<blockquote>Halo, <b>${firstName}</b>.<br>` +
    `Anda telah menolak Syarat &amp; Ketentuan Layanan. Akun Telegram Anda tidak akan dihubungkan ke server.</blockquote>` +
    `<blockquote>ℹ️ <b>Informasi Penting:</b><br>` +
    `Persetujuan syarat &amp; ketentuan diperlukan demi keamanan bersama. Anda tetap dapat menjelajahi menu publik bot.</blockquote>` +
    `<blockquote>Jika Anda berubah pikiran, silakan ketuk <b>🔄 Baca Ulang Ketentuan</b> untuk melanjutkan pendaftaran.</blockquote>`;
}

export function panelDangerDelete(ctx?: BotContext) {
  const firstName = escapeHtml(ctx?.from?.first_name || 'User');
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

export function panelRegister(ctx: BotContext) {
  const firstName = escapeHtml(ctx.from.first_name || 'User');
  return `<h1 align="center">🚀 Daftar Userbot Telegram <sup>ONBOARDING</sup></h1>` +
    `<blockquote>Halo, <b>${firstName}</b>! Akses akun Anda telah disetujui.<br>` +
    `Silakan pilih metode login untuk mengaktifkan userbot Anda:</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Metode Login</th><th align="center">Keterangan</th></tr>` +
    `<tr><td>🔍 Scan QR Code</td><td align="center">⭐ <b>Rekomendasi</b> (Pindai via Settings &gt; Devices)</td></tr>` +
    `<tr><td>📱 OTP Telegram</td><td align="center">Kode verifikasi via SMS / App Telegram</td></tr>` +
    `</table>` +
    `<blockquote>🛡️ <b>Jaminan Keamanan &amp; Syarat Akun:</b><br>` +
    `• <b>Umur Akun:</b> Disarankan akun Telegram berusia minimal 6 bulan – 1 tahun demi keamanan dari auto-ban.<br>` +
    `• <b>Enkripsi Sesi:</b> Sesi dienkripsi AES-256-GCM aman di database.<br>` +
    `• <b>Batal Kapan Saja:</b> Batalkan proses pendaftaran kapan pun dengan tombol Batal atau ketik <code>/cancel</code>.<br>` +
    `• <b>Kontrol Penuh:</b> Anda dapat menghapus sesi kapan saja melalui Dashboard &gt; Pengaturan.</blockquote>`;
}

export function panelSubscription(ctx?: BotContext) {
  const userId = ctx?.from?.id;
  const owner = ctx ? isOwner(ctx) : false;
  const session = userId ? getUserbotSession(userId) : null;
  const isTgPremium = isTelegramPremium(ctx, session);
  const approved = ctx && userId ? canRegister(ctx) : false;
  const pending = userId ? isPendingApproval(userId) : false;

  const running = userId ? userbotManager.isRunning(userId) : false;
  const ubot = userId ? userbotManager.clients.get(userId) : null;
  // mtcute: status koneksi nyata, bukan `client.connected` gaya GramJS.
  const isConnected = running && Boolean(ubot?.isConnected?.());
  const connStatus = running
    ? (isConnected ? '🟢 Online' : '🟡 Menghubungkan...')
    : (session ? '🔴 Offline' : '⚪ Belum Ditautkan');
  const phoneText = session?.phone
    ? `<tg-spoiler>${escapeHtml(session.phone.startsWith('+') ? session.phone : `+${session.phone}`)}</tg-spoiler>`
    : (session ? '<i>Terhubung</i>' : '<i>Belum Ada Sesi</i>');

  const statusAkses = owner
    ? '👑 Owner (Akses Penuh)'
    : (approved ? '🟢 Disetujui (Permanen)' : (pending ? '⏳ Menunggu Approval Owner' : '🔴 Belum Disetujui'));

  return `<h1 align="center">🛡️ Status Akses Akun <sup>ACCESS</sup></h1>` +
    `<p>DeltaUserJS menggunakan sistem <b>Persetujuan Penuh (Approval-Only)</b> tanpa batas masa aktif atau biaya langganan.</p>` +
    `<table bordered striped><caption>📋 Kartu Status Akses &amp; Mesin</caption>` +
    `<tr><th>Parameter Akun</th><th>Informasi / Status</th></tr>` +
    `<tr><td>🆔 ID Telegram</td><td align="center"><code>${escapeHtml(String(userId || 'Root'))}</code></td></tr>` +
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

export function panelBuySubscription(ctx?: BotContext) {
  return panelSubscription(ctx);
}

export function panelAccessDenied(ctx: BotContext) {
  const pending = isPendingApproval(ctx.from.id);
  const statusText = pending ? '🕐 Menunggu Approval Owner' : '🔴 Belum Disetujui';
  return `<h1 align="center">🔒 Akses Belum Disetujui <sup>RESTRICTED</sup></h1>` +
    `<p>Pendaftaran userbot memerlukan persetujuan dari owner.</p>` +
    `<table bordered striped>` +
    `<tr><th>Informasi Akun</th><th>Status</th></tr>` +
    `<tr><td>ID Telegram</td><td align="center"><code>${escapeHtml(String(ctx.from.id))}</code></td></tr>` +
    `<tr><td>Status Akses</td><td align="center">${statusText}</td></tr>` +
    `<tr><td>Masa Aktif</td><td align="center">♾️ Permanen (Setelah Disetujui)</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Cara Mendapatkan Akses:</h3>` +
    `<p>Tekan tombol <b>📩 Minta Persetujuan Akses</b> di bawah untuk mengirimkan permohonan ke owner. Begitu disetujui, Anda dapat langsung login via scan QR code atau OTP.</p>` +
    `<footer>Silakan pilih menu di bawah:</footer>`;
}
