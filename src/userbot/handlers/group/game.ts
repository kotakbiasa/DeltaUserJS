import { escapeHtml } from '../../../utils/richMessage.js';

// ============================================================
// Game — permainan grup simpel untuk userbot
// Perintah: .suit, .dadu, .koin, .slot, .tebakkata
// State kuis (.tebakkata) disimpan in-memory per chatId
// dan otomatis kedaluwarsa setelah 2 menit.
// ============================================================

const QUIZ_TTL_MS = 2 * 60 * 1000; // 2 menit
const QUIZ_WRONG_THROTTLE_MS = 3000; // batas spam jawaban salah

// String(chatId) -> { word, definition, quizMsgId, startedBy, startedAt, expiresAt, lastWrongAt }
const quizStore = new Map();

// ---- Database kosakata hardcoded (word tidak boleh muncul di definition) ----
const VOCAB = [
  { word: 'komputer', definition: 'Mesin elektronik untuk mengolah data dan menjalankan program.' },
  { word: 'hujan', definition: 'Turunnya air dari langit ke bumi melalui awan.' },
  { word: 'sepeda', definition: 'Kendaraan dua roda yang digerakkan dengan pedal.' },
  { word: 'pulpen', definition: 'Alat tulis berisi tinta dengan ujung bola kecil.' },
  { word: 'gempa', definition: 'Getaran bumi akibat pergeseran lempeng di dalamnya.' },
  { word: 'pelangi', definition: 'Lengkung warna-warni di langit sesudah hujan.' },
  { word: 'kunci', definition: 'Benda kecil untuk membuka atau menutup pintu dan gembok.' },
  { word: 'jendela', definition: 'Celah berbingkai di dinding untuk masuknya cahaya dan udara.' },
  { word: 'kamera', definition: 'Alat untuk mengambil atau merekam gambar dan video.' },
  { word: 'gurita', definition: 'Hewan laut bertentakel delapan dengan kepala besar.' },
  { word: 'majalah', definition: 'Bacaan berkala berisi artikel dan gambar, terbit secara rutin.' },
  { word: 'kompas', definition: 'Alat penunjuk arah dengan jarum magnetik.' },
  { word: 'selimut', definition: 'Kain tebal untuk menghangatkan tubuh saat tidur.' },
  { word: 'gunung', definition: 'Daratan yang menjulang tinggi melebihi daerah di sekitarnya.' },
  { word: 'lampu', definition: 'Sumber cahaya buatan yang dinyalakan dengan listrik.' },
  { word: 'cermin', definition: 'Permukaan berkaca untuk memantulkan bayangan.' },
  { word: 'kapal', definition: 'Kendaraan air besar untuk mengangkut penumpang atau muatan.' },
  { word: 'balon', definition: 'Bola karet yang bisa ditiup dan mengambang di udara.' },
  { word: 'roti', definition: 'Makanan panggang dari tepung yang diolah dengan ragi.' },
  { word: 'terompet', definition: 'Alat musik tiup logam berbentuk tabung yang melebar di ujung.' }
];

// ---- Konstanta permainan ----
const SUIT_EMOJI = { batu: '✊', gunting: '✌️', kertas: '✋' };
const SUIT_BEATS = { batu: 'gunting', gunting: 'kertas', kertas: 'batu' }; // key menang atas value
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎'];

// ---- Helpers ----
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeAnswer(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function maskWord(word) {
  return word
    .split('')
    .map((ch, i) => (i === 0 ? ch.toUpperCase() : '_'))
    .join(' ');
}

function getQuiz(chatId) {
  const key = String(chatId);
  const quiz = quizStore.get(key);
  if (!quiz) {return null;}
  if (Date.now() > quiz.expiresAt) {
    // Auto-expire 2 menit
    quizStore.delete(key);
    return null;
  }
  return quiz;
}

// ---- Sweep berkala: buang state kuis kedaluwarsa (guard anti double-interval) ----
const SWEEP_KEY = '__deltauserjs_game_quiz_sweep__';
if (!(globalThis)[SWEEP_KEY]) {
  (globalThis)[SWEEP_KEY] = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, quiz] of quizStore) {
      if (now > quiz.expiresAt) {quizStore.delete(key);}
    }
  }, 60 * 1000);
  if (typeof timer.unref === 'function') {timer.unref();}
}

export default {
  name: 'game',
  version: '1.0.0',
  description: 'Permainan grup simpel: suit, dadu, koin, slot, dan kuis tebak kata.',
  help: {
    title: '🎮 Game Grup (.suit / .dadu / .koin / .slot / .tebakkata)',
    description: 'Kumpulan permainan grup simpel untuk menghibur member: suit lawan userbot, lempar dadu, tos koin, mesin slot, dan kuis tebak kata.',
    usage:
      '• `.suit <batu/gunting/kertas>` — suit lawan userbot (random)\n' +
      '• `.dadu` — lempar dadu, hasil 1-6\n' +
      '• `.koin` — tos koin: gambar atau angka\n' +
      '• `.slot` — putar 3 simbol random, jackpot kalau sama semua\n' +
      '• `.tebakkata` — mulai kuis tebak kata (bot kasih definisi)\n' +
      '• Balas pesan kuis dengan jawabanmu untuk menjawab\n' +
      '• `.tebakkata <jawaban>` — jawab lewat perintah\n' +
      '• `.tebakkata lewat` — menyerah & lihat jawabannya',
    detail:
      'Kuis tebakkata: bot menampilkan definisi dari kosakata hardcoded, anggota menjawab dengan me-reply pesan kuis atau mengetik `.tebakkata <jawaban>`. Jawaban benar mendapat pesan selamat (hanya fun message, tanpa poin). State kuis disimpan per chat dan otomatis kedaluwarsa 2 menit setelah dibuat.'
  },
  async execute(client, message, _settings, _telegramId) {
    const text = message.message;
    if (!text) {return;}
    const chatId = message.chatId;

    // ============ 1. Jawaban kuis dari pesan masuk (reply ke pesan kuis) ============
    if (!message.out && chatId !== null && chatId !== undefined) {
      const quiz = getQuiz(chatId);
      if (quiz && message.replyToMsgId === quiz.quizMsgId) {
        const guess = normalizeAnswer(text);
        if (guess && guess === normalizeAnswer(quiz.word)) {
          quizStore.delete(String(chatId));
          await client.sendMessage(chatId, {
            message:
              `🎉 <b>BENAR!</b> 🏆\n\n` +
              `<blockquote>Jawabannya: <b>${escapeHtml(quiz.word)}</b>\n` +
              `Selamat, kamu hebat! 🥳✨</blockquote>`,
            parseMode: 'html',
            linkPreview: false,
            replyTo: message.id
          });
        } else if (Date.now() - (quiz.lastWrongAt || 0) > QUIZ_WRONG_THROTTLE_MS) {
          quiz.lastWrongAt = Date.now();
          await client.sendMessage(chatId, {
            message:
              `❌ <b>Belum tepat!</b> 😜\n\n` +
              `<blockquote>Coba lagi... sisa waktu kuis 2 menit dari awal mulai. ⏳</blockquote>`,
            parseMode: 'html',
            linkPreview: false,
            replyTo: message.id
          });
        }
      }
      return; // pesan masuk tidak lanjut ke perintah
    }

    if (!message.out || chatId === null || chatId === undefined) {return;}

    // ============ 2. .suit <batu/gunting/kertas> ============
    const suitMatch = text.match(/^\.suit(?:\s+([^\s]+))?$/i);
    if (suitMatch) {
      const userChoice = (suitMatch[1] || '').toLowerCase();
      if (!SUIT_EMOJI[userChoice]) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Format salah:</b> <code>.suit &lt;batu/gunting/kertas&gt;</code>\n` +
            `Contoh: <code>.suit batu</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const botChoice = pickRandom(Object.keys(SUIT_EMOJI));
      let resultText;
      if (userChoice === botChoice) {
        resultText = '🤝 <b>SERI!</b>';
      } else if (SUIT_BEATS[userChoice] === botChoice) {
        resultText = '🎉 <b>Kamu MENANG!</b>';
      } else {
        resultText = '😈 <b>Kamu KALAH!</b>';
      }
      await message.edit({
        text:
          `✊✌️✋ <b>SUIT!</b>\n\n` +
          `<blockquote>Kamu: ${SUIT_EMOJI[userChoice]} <b>${escapeHtml(userChoice)}</b>\n` +
          `Aku: ${SUIT_EMOJI[botChoice]} <b>${escapeHtml(botChoice)}</b></blockquote>\n\n` +
          `${resultText}`,
        parseMode: 'html'
      });
      return;
    }

    // ============ 3. .dadu ============
    if (/^\.dadu$/i.test(text)) {
      const num = 1 + Math.floor(Math.random() * 6);
      await message.edit({
        text:
          `🎲 <b>Lemparan dadu...</b>\n\n` +
          `<blockquote>${DICE_FACES[num - 1]} Hasil: <b>${num}</b></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    // ============ 4. .koin ============
    if (/^\.koin$/i.test(text)) {
      const isGambar = Math.random() < 0.5;
      await message.edit({
        text: isGambar
          ? `🪙 <b>Koin melayang...</b>\n\n<blockquote>👤 Hasil: <b>Gambar</b></blockquote>`
          : `🪙 <b>Koin melayang...</b>\n\n<blockquote>🔢 Hasil: <b>Angka</b></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    // ============ 5. .slot ============
    if (/^\.slot$/i.test(text)) {
      const s1 = pickRandom(SLOT_SYMBOLS);
      const s2 = pickRandom(SLOT_SYMBOLS);
      const s3 = pickRandom(SLOT_SYMBOLS);
      const jackpot = s1 === s2 && s2 === s3;
      const resultText = jackpot
        ? `🎉🎊 <b>JACKPOT!</b> 🎊🎉\nKetiga simbol sama — luar biasa!`
        : s1 === s2 || s2 === s3 || s1 === s3
          ? `😅 <b>Hampir!</b> Dua simbol sama. Coba lagi!`
          : `🙃 <b>Belum hoki.</b> Coba lagi!`;
      await message.edit({
        text:
          `🎰 <b>Mesin Slot</b>\n\n` +
          `<blockquote>┃ ${s1} ┃ ${s2} ┃ ${s3} ┃</blockquote>\n\n${resultText}`,
        parseMode: 'html'
      });
      return;
    }

    // ============ 6. .tebakkata ============
    const quizMatch = text.match(/^\.tebakkata(?:\s+([\s\S]+))?$/i);
    if (quizMatch) {
      const arg = (quizMatch[1] || '').trim();
      const existing = getQuiz(chatId);

      if (!arg && existing) {
        // Kuis masih jalan — tampilkan ulang soalnya
        await message.edit({
          text:
            `🧠 <b>Kuis masih berjalan!</b>\n\n` +
            `<blockquote><b>Definisi:</b> ${escapeHtml(existing.definition)}\n` +
            `Petunjuk: <code>${maskWord(existing.word)}</code></blockquote>\n\n` +
            `💬 Balas pesan kuis dengan jawabanmu, atau ketik <code>.tebakkata &lt;jawaban&gt;</code>.`,
          parseMode: 'html'
        });
        return;
      }

      if (!arg) {
        // Mulai kuis baru
        const item = pickRandom(VOCAB);
        const now = Date.now();
        quizStore.set(String(chatId), {
          word: item.word,
          definition: item.definition,
          quizMsgId: message.id,
          startedBy: Number(message.senderId) || 0,
          startedAt: now,
          expiresAt: now + QUIZ_TTL_MS,
          lastWrongAt: 0
        });
        await message.edit({
          text:
            `🧠 <b>TEBAK KATA!</b>\n\n` +
            `<blockquote><b>Definisi:</b> ${escapeHtml(item.definition)}\n` +
            `Petunjuk: <code>${maskWord(item.word)}</code></blockquote>\n\n` +
            `💬 Balas pesan ini dengan jawabanmu!\n⏰ Waktu: <b>2 menit</b>`,
          parseMode: 'html'
        });
        return;
      }

      // Ada argumen: jawaban / menyerah
      if (['lewat', 'skip', 'menyerah'].includes(arg.toLowerCase())) {
        if (!existing) {
          await message.edit({
            text: `<blockquote>ℹ️ Tidak ada kuis yang berjalan. Mulai dengan <code>.tebakkata</code>.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        quizStore.delete(String(chatId));
        await message.edit({
          text:
            `🏳️ <b>Kuis dinyatakan lewat.</b>\n\n` +
            `<blockquote>Jawabannya: <b>${escapeHtml(existing.word)}</b>\n${escapeHtml(existing.definition)}</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (!existing) {
        await message.edit({
          text:
            `<blockquote>❌ Tidak ada kuis yang berjalan.\nMulai dulu dengan <code>.tebakkata</code>.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (normalizeAnswer(arg) === normalizeAnswer(existing.word)) {
        quizStore.delete(String(chatId));
        await message.edit({
          text:
            `🎉 <b>BENAR!</b> 🏆\n\n` +
            `<blockquote>Jawabannya: <b>${escapeHtml(existing.word)}</b>\n` +
            `Selamat, kamu hebat! 🥳✨</blockquote>`,
          parseMode: 'html'
        });
      } else {
        await message.edit({
          text:
            `❌ <b>Belum tepat!</b> 😜\n\n` +
            `<blockquote>Coba jawab lain, atau ketik <code>.tebakkata lewat</code> untuk menyerah.</blockquote>`,
          parseMode: 'html'
        });
      }
    }
  }
};
