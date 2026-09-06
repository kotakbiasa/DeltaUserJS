import { escapeHtml } from '../../../utils/richMessage.js';

// ============================================================
// RekapKB — Tools rekap transaksi game grup
// Perintah:
//   .rekap        reply pesan list "Nama: angka" / "Nama - angka"
//                 -> total, rata-rata, pemain terbanyak
//   .win <fee%>   reply pesan rekap -> kemenangan per orang setelah fee
//                 contoh: .win 5 = fee 5%
// Angka support suffix k/m/b (500k = 500000) dan desimal (1.5k = 1500).
// ============================================================

interface RekapPlayer {
  name: string;
  total: number;
  count: number;
}

const MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
const MEDALS = ['🥇', '🥈', '🥉'];

// Baris entry: "<nama><separator><angka>" — angka wajib di ujung baris.
// Separator: ':' | '—' | '–' | '=' | ' - ' | '→' | '->' | '=>'
// Angka boleh diikuti arrow hasil fee: "100 → 95" / "100 // 95"
// (format output .win dan PyroUbot "nama: nominal // final" tetap valid —
// nilai yang dipakai adalah angka pertama, sama seperti referensi PyroUbot).
const ENTRY_RE =
  /^(.+?)\s*(?:=>|->|→|:|—|–|=|\s+-\s+)\s*([\d.,]+\s*[kmb]?)(?:\s*(?:→|->|=>|\/\/)\s*[\d.,]+\s*[kmb]?)?\s*$/i;

// Nama ringkasan (Total, Rata-rata, dst.) dilewati supaya output .rekap/.win
// tidak ter-parse ulang sebagai pemain saat pesan hasilnya di-reply lagi.
const SKIP_NAME_RE =
  /(total|rata|terbanyak|terbesar|pemain|entri|jumlah|selisih|average|fee|win|hasil)/i;

function badge(i: number): string {
  return MEDALS[i] || `${i + 1}.`;
}

// 1.500.000 — pemisah ribuan titik, gaya Indonesia
function formatAngka(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatFee(fee: number): string {
  return String(Math.round(fee * 100) / 100);
}

// Parse "500k" -> 500000, "2,5m" -> 2500000, "1.000.000" -> 1000000
function parseAngka(raw: string): number | null {
  let s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) {return null;}
  const mult = MULTIPLIERS[s.slice(-1)];
  if (mult) {s = s.slice(0, -1);}
  if (!/^[\d.,]+$/.test(s)) {return null;}
  let n: number;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    // Kelompok ribuan: 1.000.000 / 1,000,000
    n = parseInt(s.replace(/[.,]/g, ''), 10);
  } else if (/^\d+[.,]\d+$/.test(s)) {
    // Desimal: 1.5 / 2,5
    n = parseFloat(s.replace(',', '.'));
  } else if (/^\d+$/.test(s)) {
    n = parseInt(s, 10);
  } else {
    return null;
  }
  if (!isFinite(n)) {return null;}
  return mult ? Math.round(n * mult) : Math.round(n);
}

// Bersihkan nama: buang penanda list "1.", bullet "- ", emoji depan, dll.
function cleanName(raw: string): string {
  return String(raw || '')
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(/^[-–—•*+=]+\s*/, '')
    .replace(/^[^\p{L}\p{N}_]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Kumpulkan semua entry "Nama: angka" dari sebuah teks.
// Nama sama (case-insensitive) dijumlahkan. Urutan hasil: terbesar dulu.
function parseRekap(text: string): RekapPlayer[] {
  const map = new Map<string, RekapPlayer>();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {continue;}
    const m = line.match(ENTRY_RE);
    if (!m) {continue;}
    const name = cleanName(m[1]);
    // Nama kosong / murni angka (jam "14:30") / baris ringkasan -> lewati
    if (!name || /^\d+$/.test(name) || SKIP_NAME_RE.test(name)) {continue;}
    const nominal = parseAngka(m[2]);
    if (nominal === null) {continue;}
    const key = name.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      prev.total += nominal;
      prev.count += 1;
    } else {
      map.set(key, { name, total: nominal, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

async function getRepliedText(message: any): Promise<string> {
  try {
    const replied = await message.getReplyMessage();
    return String((replied && replied.message) || '').trim();
  } catch (_e) {
    return '';
  }
}

export default {
  name: 'rekapkb',
  version: '1.0.0',
  description: 'Rekap transaksi game grup & hitung kemenangan per orang setelah fee.',
  help: {
    title: '📊 Rekap & Win (.rekap / .win)',
    description:
      'Tools rekap transaksi untuk game grup: jumlahkan list nilai per pemain dari pesan yang di-reply, lalu hitung kemenangan tiap orang setelah dipotong fee.',
    usage:
      '• Reply pesan berisi list, lalu ketik `.rekap` — format list: "Nama: angka" atau "Nama - angka"\n' +
      '• Angka support suffix: 500k = 500.000, 2m = 2.000.000, 1b = 1.000.000.000\n' +
      '• Desimal juga bisa: 1.5k = 1.500 atau 2,5m = 2.500.000\n' +
      '• Reply pesan rekap lalu ketik `.win <fee%>` — contoh `.win 5` = fee 5%\n' +
      '• `.win` juga bisa langsung ke list mentah, dan fee boleh desimal (`.win 2.5`)',
    detail:
      '.rekap membaca pesan yang di-reply, mengambil semua baris berformat "Nama: angka" / "Nama - angka" (juga " — ", "=" dan "→"), menjumlahkan nama yang sama, lalu menampilkan total, rata-rata, dan pemain dengan nilai terbanyak. Baris ringkasan seperti Total/Rata-rata otomatis dilewati, jadi output .rekap/.win bisa langsung di-reply dengan perintah lagi. .win <fee%> memotong fee persen dari nilai tiap pemain (contoh .win 5 = nilai × 0,95) dan menampilkan kemenangan akhir per orang. Fee wajib lebih dari 0 dan kurang dari 100.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}
    const text = String(message.message);

    // ============ 1. .rekap — reply list "Nama: angka" ============
    if (/^\.rekap\s*$/i.test(text)) {
      const raw = await getRepliedText(message);
      if (!raw) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Reply dulu pesannya!</b>\n` +
            `Balas pesan yang berisi list transaksi, contoh:\n` +
            `<code>Budi: 500k</code>\n<code>Andi - 250000</code>\n<code>Cici: 1.5m</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const players = parseRekap(raw);
      if (players.length === 0) {
        await message.edit({
          text: `<blockquote>❌ Tidak ada baris <code>Nama: angka</code> yang valid di pesan yang di-reply.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const total = players.reduce((s, p) => s + p.total, 0);
      const entri = players.reduce((s, p) => s + p.count, 0);
      const rata = Math.round(total / players.length);
      const top = players[0];
      let list = '';
      for (let i = 0; i < players.length; i++) {
        list += `${badge(i)} <b>${escapeHtml(players[i].name)}</b> — ${formatAngka(players[i].total)}\n`;
      }
      await message.edit({
        text:
          `📊 <b>REKAP TRANSAKSI</b>\n\n` +
          `<blockquote>👥 Pemain: <b>${players.length}</b>\n` +
          `🧾 Entri: <b>${entri}</b>\n` +
          `💰 Total: <b>${formatAngka(total)}</b>\n` +
          `📈 Rata-rata: <b>${formatAngka(rata)}</b>\n` +
          `🏆 Terbanyak: <b>${escapeHtml(top.name)}</b> — ${formatAngka(top.total)}\n\n` +
          `${list.replace(/\n$/, '')}</blockquote>\n\n` +
          `💡 Reply pesan ini dengan <code>.win &lt;fee%&gt;</code> untuk hitung kemenangan.`,
        parseMode: 'html'
      });
      return;
    }

    // ============ 2. .win <fee%> — hitung kemenangan setelah fee ============
    const winMatch = text.match(/^\.win(?:\s+([\s\S]+))?$/i);
    if (winMatch) {
      const feeRaw = (winMatch[1] || '').trim().split(/\s+/)[0].replace(/%+$/, '');
      if (!feeRaw) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Format salah:</b> <code>.win &lt;fee%&gt;</code>\n` +
            `Contoh: <code>.win 5</code> = fee 5%</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const fee = parseFloat(feeRaw.replace(',', '.'));
      if (!isFinite(fee) || fee <= 0 || fee >= 100) {
        await message.edit({
          text:
            `<blockquote>❌ Fee harus angka antara 0-100 (boleh desimal).\n` +
            `Contoh: <code>.win 5</code> atau <code>.win 2.5</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const raw = await getRepliedText(message);
      if (!raw) {
        await message.edit({
          text:
            `<blockquote>❌ Reply pesan rekap (output <code>.rekap</code>) atau list <code>Nama: angka</code> untuk dihitung.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const players = parseRekap(raw);
      if (players.length === 0) {
        await message.edit({
          text: `<blockquote>❌ Tidak ada baris <code>Nama: angka</code> yang valid di pesan yang di-reply.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const factor = 1 - fee / 100;
      let totalAwal = 0;
      let totalAkhir = 0;
      let list = '';
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const finalN = Math.round(p.total * factor);
        totalAwal += p.total;
        totalAkhir += finalN;
        list += `${badge(i)} <b>${escapeHtml(p.name)}</b>: ${formatAngka(p.total)} → ${formatAngka(finalN)}\n`;
      }
      const totalFee = totalAwal - totalAkhir;
      await message.edit({
        text:
          `🏆 <b>KEMENANGAN — FEE ${formatFee(fee)}%</b>\n\n` +
          `<blockquote>${list.replace(/\n$/, '')}\n\n` +
          `👥 Pemain: <b>${players.length}</b>\n` +
          `💰 Total awal: <b>${formatAngka(totalAwal)}</b>\n` +
          `✂️ Potongan fee: <b>${formatAngka(totalFee)}</b>\n` +
          `💵 Total akhir: <b>${formatAngka(totalAkhir)}</b></blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
