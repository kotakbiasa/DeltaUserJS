/**
 * Panel ToS, registrasi, langganan, hapus sesi, dan akses ditolak.
 *
 * Dipecah dari panelParts/core.ts (721 baris). Isi tiap fungsi dipindahkan
 * apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import type { Context } from 'grammy';
import { getUserbotSession } from '../../../../../../infrastructure/database.js';
import userbotManager from '../../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../../utils/richMessage.js';
import { isPendingApproval } from '../../../../../state/approvedUsers.js';
import { canRegister, formatTelegramPremiumBadge, isOwner, isTelegramPremium } from '../../shared.js';

export function panelTermsOfService(ctx) {
  const firstName = escapeHtml(ctx.from?.first_name || 'User');
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
  const firstName = escapeHtml(ctx.from?.first_name || 'User');
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

export function panelDangerDelete(ctx?: Context) {
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

export function panelSubscription(ctx?: Context) {
  const userId = ctx?.from?.id;
  const owner = isOwner(ctx);
  const session = userId ? getUserbotSession(userId) : null;
  const isTgPremium = isTelegramPremium(ctx, session);
  const approved = ctx && userId ? canRegister(ctx) : false;
  const pending = userId ? isPendingApproval(userId) : false;

  const running = userId ? userbotManager.isRunning(userId) : false;
  const ubot = userId ? userbotManager.clients.get(userId) : null;
  const isConnected = running && Boolean(ubot?.client?.connected);
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

export function panelBuySubscription(ctx?: Context) {
  return panelSubscription(ctx);
}

export function panelAccessDenied(ctx) {
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
