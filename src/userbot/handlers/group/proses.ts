import { escapeHtml } from '../../../utils/richMessage.js';

// ============================================================
// PROSES — kartu status transaksi (teks estetik HTML blockquote)
//   .proses <item>  -> kartu ⏳ PROCESSING + timestamp WIB
//   .done <item>    -> kartu ✅ DONE
//   .batal <item>   -> kartu ❌ CANCELED
// ============================================================

function nowWib() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

const CARDS = {
  proses: { emoji: '⏳', label: 'PROCESSING', statusId: 'Sedang Diproses' },
  done: { emoji: '✅', label: 'DONE', statusId: 'Selesai' },
  batal: { emoji: '❌', label: 'CANCELED', statusId: 'Dibatalkan' }
};

function buildCard(kind, rawItem) {
  const card = CARDS[kind];
  const item = rawItem.trim();
  const time = nowWib();

  return (
    `${card.emoji} <b>${card.label}</b>\n\n` +
    `<blockquote>📦 <b>Item:</b> ${escapeHtml(item)}\n` +
    `🔖 <b>Status:</b> ${card.statusId}\n` +
    `🕒 <b>Waktu (WIB):</b> <code>${escapeHtml(time)}</code></blockquote>\n\n` +
    `<blockquote><i>Diproses otomatis oleh DeltaUbotJS</i></blockquote>`
  );
}

async function sendCard(message, kind, rawItem) {
  if (!rawItem || !rawItem.trim()) {
    await message.edit({
      text: `<blockquote>📚 <b>Penggunaan:</b> <code>.${kind} &lt;nama item&gt;</code>\nContoh: <code>.${kind} Panel Premium 1 Bulan</code></blockquote>`,
      parseMode: 'html'
    });
    return;
  }

  await message.edit({
    text: buildCard(kind, rawItem),
    parseMode: 'html'
  });
}

export default {
  name: 'proses',
  version: '1.0.0',
  description: 'Kartu status transaksi: proses, selesai, dan batal dengan gaya teks estetik.',
  help: {
    title: 'Status Transaksi (.proses / .done / .batal)',
    description: 'Kirim kartu teks status transaksi bergaya estetik: processing, done, atau canceled — lengkap dengan timestamp WIB.',
    usage: '• `.proses <item>` — kartu ⏳ PROCESSING + timestamp WIB\n' +
      '• `.done <item>` — kartu ✅ DONE\n' +
      '• `.batal <item>` — kartu ❌ CANCELED',
    detail: 'Semua kartu dirender sebagai HTML blockquote: judul status, nama item, status dalam Bahasa Indonesia, dan waktu WIB (Asia/Jakarta). ' +
      'Cocok untuk update cepat pembeli di chat transaksi.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.(\w+)(?:\s+([\s\S]+))?$/);
    if (!match) {return;}

    const cmd = match[1].toLowerCase();
    if (cmd !== 'proses' && cmd !== 'done' && cmd !== 'batal') {return;}

    await sendCard(message, cmd, match[2] || '');
  }
};
