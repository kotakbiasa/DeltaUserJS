import { escapeHtml } from '../../../utils/richMessage.js';

// ============================================================
// Game 2 — tambahan permainan grup, terinspirasi getter games.py
// Perintah: .xo (tic tac toe lawan userbot), .wtp truth|dare
// State XO disimpan in-memory per chatId (Map) dan otomatis
// kedaluwarsa 5 menit. .wtp pakai api.truthordarebot.xyz,
// dengan fallback bank soal bahasa Indonesia kalau API mati.
// ============================================================

const GAME_TTL_MS = 5 * 60 * 1000; // 5 menit
const XO_WARN_THROTTLE_MS = 3000; // batas spam "kotak sudah terisi"
const TOD_API_TIMEOUT_MS = 8000;
const TOD_API_BASE = 'https://api.truthordarebot.xyz/v1';

// String(chatId) -> { board, boardMsgId, startedBy, startedAt, expiresAt }
// board: Array 9 sel, 0 = kosong, 'X' = pemain, 'O' = userbot
const xoStore = new Map();

// 8 garis kemenangan tic tac toe
const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // baris
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolom
  [0, 4, 8], [2, 4, 6] // diagonal
];

const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const PLAYER_MARK = '❌'; // pemain = X
const AI_MARK = '⭕'; // userbot = O

// ---- Fallback Truth or Dare bahasa Indonesia (dipakai kalau API mati) ----
const TRUTHS_FALLBACK = [
  'Apa kebiasaan terburukmu yang belum pernah kamu akui ke siapa pun?',
  'Siapa orang di grup ini yang paling kamu nilai jadi diri sendiri?',
  'Kapan terakhir kali kamu bohong, dan ke siapa?',
  'Apa hal paling memalukan yang pernah kamu lakukan di tempat umum?',
  'Kalau bisa tukar hidup dengan satu orang di grup ini, kamu pilih siapa dan kenapa?',
  'Apa mimpi teraneh yang pernah kamu alami?',
  'Siapa mantan atau gebetan lama yang sampai sekarang masih kamu ingat?',
  'Apa rahasia kecil yang kamu simpan dari orang tua?',
  'Hal apa yang kamu lakukan kalau yakin tidak ada yang melihat?',
  'Apa ketakutan terbesarmu?',
  'Pernah suka sama orang yang udah pacaran sama orang lain? Ceritakan.',
  'Apa kelemahan yang paling kamu sembunyikan dari orang lain?',
  'Kalau besok hari terakhirmu, hal apa yang pertama mau kamu lakukan?',
  'Pernah pura-pura sakit buat bolos? Kapan dan kenapa?',
  'Siapa idolamu dan apa alasan paling jujurnya?',
  'Apa hal yang paling kamu sesali setahun terakhir?',
  'Pernah naksir guru, dosen, atau atasan? Cerita dong.',
  'Apa hal paling kekanak-kanakan yang masih kamu lakukan sampai sekarang?',
  'Sampai sejauh mana kamu pernah nge-stalk seseorang di medsos?',
  'Kalau ditawari satu juta tapi harus diambil dari tempat sampah, kamu mau?'
];

const DARES_FALLBACK = [
  'Kirim voice note nyanyi lagu nasional dengan penuh semangat.',
  'Kirim selfie "paling jelek versi kamu" ke grup ini.',
  'Chat kontak ke-5 paling atas dan bilang "aku kangen kamu".',
  'Bikin story/status yang memuji diri sendiri berlebihan selama 1 jam.',
  'Telfon orang di kontak dan bilang "selamat, kamu menang undian".',
  'Jalan menari kecil di tempatmu sekarang selama 30 detik.',
  'Bilang "aku sayang kamu" ke orang terakhir yang chat kamu.',
  'Ubah nama grup ini jadi kata-kata aneh selama 10 menit.',
  'Kirim 5 pantun beruntun ke grup ini.',
  'Tirukan suara hewan sampai ada satu orang yang ketawa.',
  'Ganti foto profil jadi foto kamu paling ngantuk.',
  'Ketik pakai huruf kapital semua selama 30 menit.',
  'Forward chat paling memalukan dari chat pribadimu ke grup (yang aman aja).',
  'Bikin video 15 detik pake dandanan paling rapi lalu bilang "ini aku sebelum kopi".',
  'Chat mantan atau teman lama: "lama tak jumpa, kangen nggak?"',
  'Beri pujian berlebihan ke tiap anggota grup, satu per satu.',
  'Nyanyi chorus lagu favoritmu sambil berdiri.',
  'Kirim stiker atau meme paling cringe yang kamu punya.',
  'Sambut orang berikutnya yang chat kamu dengan gaya pembaru drama.',
  'Screenshot 20 foto galeri terakhirmu, pilih satu paling memalukan buat dikirim ke grup.'
];

// ---- Helpers XO ----
function getXo(chatId) {
  const key = String(chatId);
  const state = xoStore.get(key);
  if (!state) {return null;}
  if (Date.now() > state.expiresAt) {
    // Auto-expire 5 menit
    xoStore.delete(key);
    return null;
  }
  return state;
}

function parseCell(text) {
  const m = String(text || '').trim().match(/^([1-9])$/);
  return m ? parseInt(m[1], 10) : null;
}

function markCell(board, i) {
  if (board[i] === 'X') {return PLAYER_MARK;}
  if (board[i] === 'O') {return AI_MARK;}
  return KEYCAPS[i];
}

function renderBoard(board) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    rows.push([markCell(board, r * 3), markCell(board, r * 3 + 1), markCell(board, r * 3 + 2)].join(' '));
  }
  return rows.join('\n');
}

function xoHtml(state, statusLine) {
  return (
    `❌⭕ <b>TIC TAC TOE</b>\n\n` +
    `<blockquote>${renderBoard(state.board)}</blockquote>\n\n` +
    `${statusLine}\n⏰ Game hangus otomatis 5 menit setelah dibuat.`
  );
}

function winnerOf(board, mark) {
  return WINS.some((line) => board[line[0]] === mark && board[line[1]] === mark && board[line[2]] === mark);
}

function isFull(board) {
  return board.every((v) => v === 'X' || v === 'O');
}

async function endGame(client, chatId, state, outcome) {
  xoStore.delete(String(chatId));
  const titles = {
    user: `🎉 <b>KAMU MENANG!</b> 🏆`,
    ai: `🤖 <b>AKU MENANG!</b> 😎`,
    draw: `🤝 <b>SERI!</b>`
  };
  const footers = {
    user: '💬 Ketik <code>.xo</code> kalau berani balas dendam.',
    ai: '💬 Ketik <code>.xo</code> untuk coba lagi.',
    draw: '💬 Ketik <code>.xo</code> untuk rematch.'
  };
  try {
    await client.editMessage(chatId, {
      message: state.boardMsgId,
      text: `${titles[outcome]}\n\n<blockquote>${renderBoard(state.board)}</blockquote>\n\n${footers[outcome]}`,
      parseMode: 'html'
    });
  } catch (_err) {
    // pesan papan sudah terhapus — game tetap dibuang biar tidak zombie
  }
}

// Satu giliran pemain (X) diikuti balikan random userbot (O)
async function playTurn(client, chatId, state, cellIdx) {
  state.board[cellIdx] = 'X';

  if (winnerOf(state.board, 'X')) {return endGame(client, chatId, state, 'user');}
  if (isFull(state.board)) {return endGame(client, chatId, state, 'draw');}

  const empties = [];
  state.board.forEach((v, i) => {
    if (!v) {empties.push(i);}
  });
  const aiIdx = empties[Math.floor(Math.random() * empties.length)];
  state.board[aiIdx] = 'O';

  if (winnerOf(state.board, 'O')) {return endGame(client, chatId, state, 'ai');}
  if (isFull(state.board)) {return endGame(client, chatId, state, 'draw');}

  const statusLine =
    `🎯 Kamu = ${PLAYER_MARK} • Aku = ${AI_MARK}\n` +
    `🤖 Aku isi kotak <b>${aiIdx + 1}</b>\n` +
    `⏳ Giliran kamu! Balas pesan ini dengan nomor kotak, atau ketik <code>.xo &lt;1-9&gt;</code>`;
  try {
    await client.editMessage(chatId, {
      message: state.boardMsgId,
      text: xoHtml(state, statusLine),
      parseMode: 'html'
    });
  } catch (_err) {
    // pesan papan tidak bisa diedit (dihapus?) — akhiri game
    xoStore.delete(String(chatId));
  }
}

// ---- Sweep berkala: buang state XO kedaluwarsa (guard anti double-interval) ----
const SWEEP_KEY = '__deltauserjs_game2_sweep__';
if (!(globalThis)[SWEEP_KEY]) {
  (globalThis)[SWEEP_KEY] = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of xoStore) {
      if (now > state.expiresAt) {xoStore.delete(key);}
    }
  }, 60 * 1000);
  if (typeof timer.unref === 'function') {timer.unref();}
}

export default {
  name: 'game2',
  version: '1.0.0',
  description: 'Permainan grup tambahan: tic tac toe (.xo) dan truth or dare (.wtp).',
  help: {
    title: '🎮 Game 2 (.xo / .wtp truth / .wtp dare)',
    description:
      'Tic tac toe lawan userbot dengan papan emoji yang diedit langsung, plus truth or dare dari API (fallback soal bahasa Indonesia).',
    usage:
      '• `.xo` — mulai tic tac toe lawan userbot\n' +
      '• Balas pesan papan dengan nomor kotak (1-9) untuk jalan\n' +
      '• `.xo <1-9>` — isi kotak lewat perintah\n' +
      '• `.wtp truth` — dapat pertanyaan truth random\n' +
      '• `.wtp dare` — dapat tantangan dare random',
    detail:
      'XO: kamu main ❌, userbot balikin langkah random ⭕ di papan 3x3 yang diedit di satu pesan. Menang/seri terdeteksi otomatis. ' +
      '.wtp: soal diambil dari api.truthordarebot.xyz; kalau API mati/timeout otomatis pakai bank soal bahasa Indonesia lokal. ' +
      'Semua state per chat dan hangus 5 menit setelah dibuat.'
  },
  async execute(client, message, _settings, _telegramId) {
    const text = message.message;
    if (!text) {return;}
    const chatId = message.chatId;
    if (chatId === null || chatId === undefined) {return;}

    // ============ 1. Balasan angka ke papan XO dari pesan masuk ============
    if (!message.out) {
      const state = getXo(chatId);
      if (state && message.replyToMsgId === state.boardMsgId) {
        const cell = parseCell(text);
        if (cell !== null) {
          const idx = cell - 1;
          if (state.board[idx]) {
            // Kotak sudah terisi — peringati (throttle biar tidak spam)
            if (Date.now() - (state.lastWarnAt || 0) > XO_WARN_THROTTLE_MS) {
              state.lastWarnAt = Date.now();
              try {
                await client.sendMessage(chatId, {
                  message: `<blockquote>❌ Kotak <b>${cell}</b> sudah terisi. Pilih nomor lain ya!</blockquote>`,
                  parseMode: 'html',
                  replyTo: message.id
                });
              } catch (_err) {
                // abaikan gagal kirim peringatan
              }
            }
          } else {
            await playTurn(client, chatId, state, idx);
          }
        }
      }
      return; // pesan masuk tidak lanjut ke perintah
    }

    // ============ 2. Balasan angka ke papan XO dari pesan keluar (owner) ============
    const active = getXo(chatId);
    if (active && message.replyToMsgId === active.boardMsgId) {
      const cell = parseCell(text);
      if (cell !== null) {
        const idx = cell - 1;
        if (!active.board[idx]) {
          await playTurn(client, chatId, active, idx);
        }
        return;
      }
    }

    // ============ 3. .xo — mulai / isi kotak ============
    const xoMatch = text.match(/^\.xo(?:\s+(\S+))?$/i);
    if (xoMatch) {
      const arg = (xoMatch[1] || '').trim();
      const existing = getXo(chatId);

      if (/^\d+$/.test(arg)) {
        if (!existing) {
          await message.edit({
            text: `<blockquote>ℹ️ Belum ada permainan XO di chat ini. Mulai dulu dengan <code>.xo</code>.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        const cell = parseInt(arg, 10);
        if (cell < 1 || cell > 9) {
          await message.edit({
            text: `<blockquote>❌ Nomor kotak harus <b>1-9</b>.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        if (existing.board[cell - 1]) {
          await message.edit({
            text: `<blockquote>❌ Kotak <b>${cell}</b> sudah terisi.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        await playTurn(client, chatId, existing, cell - 1);
        return;
      }

      if (arg) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Format salah:</b> <code>.xo</code> untuk mulai, atau <code>.xo &lt;1-9&gt;</code> untuk isi kotak.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      // Mulai game baru (reset kalau masih ada yang jalan)
      const now = Date.now();
      const state = {
        board: new Array(9).fill(0),
        boardMsgId: message.id,
        startedBy: Number(message.senderId) || 0,
        startedAt: now,
        expiresAt: now + GAME_TTL_MS
      };
      xoStore.set(String(chatId), state);
      const statusLine =
        `🎯 Kamu = ${PLAYER_MARK} • Aku = ${AI_MARK}\n` +
        `💬 Balas pesan ini dengan nomor kotak, atau ketik <code>.xo 5</code>`;
      await message.edit({
        text: xoHtml(state, statusLine),
        parseMode: 'html'
      });
      return;
    }

    // ============ 4. .wtp truth|dare ============
    const wtpMatch = text.match(/^\.wtp(?:\s+(\S+))?$/i);
    if (wtpMatch) {
      const kind = (wtpMatch[1] || '').toLowerCase();
      if (kind !== 'truth' && kind !== 'dare') {
        await message.edit({
          text:
            `<blockquote>❌ <b>Format salah:</b> <code>.wtp truth</code> atau <code>.wtp dare</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const isTruth = kind === 'truth';
      let question = '';
      let fromApi = false;
      try {
        const res = await fetch(`${TOD_API_BASE}/${isTruth ? 'truth' : 'dare'}`, {
          signal: AbortSignal.timeout(TOD_API_TIMEOUT_MS)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.question === 'string' && data.question) {
            question = data.question;
            fromApi = true;
          }
        }
      } catch (_err) {
        // API mati/timeout → pakai fallback lokal
      }
      if (!question) {
        const pool = isTruth ? TRUTHS_FALLBACK : DARES_FALLBACK;
        question = pool[Math.floor(Math.random() * pool.length)];
      }
      const head = isTruth ? '🔍 <b><u>TRUTH</u></b> 🫣' : '🔥 <b><u>DARE</u></b> 💀';
      const source = fromApi ? '🌐 api.truthordarebot.xyz' : '🇮🇩 bank soal lokal (API lagi down)';
      await message.edit({
        text: `${head}\n\n<blockquote>${escapeHtml(question)}</blockquote>\n\n${source}`,
        parseMode: 'html'
      });
    }
  }
};
