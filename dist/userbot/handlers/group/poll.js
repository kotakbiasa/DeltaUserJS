import { Api } from 'teleproto';
import bigInt from 'big-integer';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// ============================================================
// POLL — buat poll/quiz di grup via raw API messages.SendMedia
// dengan InputMediaPoll (Telethon-style, bukan helper sendPoll).
//
//   .poll <pertanyaan> ; <opsi1> ; <opsi2> ; ...
//   .poll quiz <nojawaban> <pertanyaan> ; <opsi1> ; <opsi2> ; ...
//
// Aturan: 2-10 opsi, opsi & pertanyaan dipotong 100 karakter
// (batas Telegram), jawaban quiz di-verifikasi sebelum kirim.
// Konsep diadaptasi dari Ultroid polls.py + catuserbot poll.py
// (riset lintas-repo), ditulis ulang ke pola plugin DeltaUserJS.
// ============================================================
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_TEXT_LEN = 100; // batas panjang teks pertanyaan/opsi Telegram
function errText(err) {
    return err instanceof Error ? err.message : String(err);
}
// Parse ".poll ..." — quiz mode: token pertama 'quiz' + nomor jawaban.
function parsePollArgs(args) {
    let quiz = false;
    let correctIndex;
    let body = args;
    const quizMatch = body.match(/^quiz\s+(\d+)(?:\s+([\s\S]*))?$/i);
    if (quizMatch) {
        quiz = true;
        correctIndex = Number(quizMatch[1]) - 1; // 1-based -> 0-based
        body = (quizMatch[2] || '').trim();
        if (!body) {
            return { error: 'Setelah <code>quiz &lt;no&gt;</code> tulis pertanyaan dan opsi' };
        }
    }
    const parts = body.split(';').map((part) => part.trim()).filter((part) => part !== '');
    if (parts.length < 1 + MIN_OPTIONS) {
        return { error: `Butuh 1 pertanyaan + minimal ${MIN_OPTIONS} opsi, dipisah titik-koma (;)` };
    }
    if (parts.length > 1 + MAX_OPTIONS) {
        return { error: `Maksimal ${MAX_OPTIONS} opsi (dapat ${parts.length - 1})` };
    }
    const question = parts[0];
    const options = parts.slice(1);
    if (quiz && (correctIndex === undefined || correctIndex < 0 || correctIndex >= options.length)) {
        return { error: `Nomor jawaban quiz harus 1-${options.length}` };
    }
    return {
        question: question.slice(0, MAX_TEXT_LEN),
        options: options.map((option) => option.slice(0, MAX_TEXT_LEN)),
        quiz,
        correctIndex,
    };
}
// Bangun InputMediaPoll — pattern sama dengan teleproto client/messages.js sendPoll:
// Poll.answers = InputPollAnswer (tanpa option bytes; server generate), hash 0.
// id/hash bertipe long (BigInteger) -> bigInt(0); correctAnswers typed number[]
// di d.ts tapi runtime menerima bytes per TL schema -> diberi komentar cast.
function buildInputMediaPoll(parsed) {
    const poll = new Api.Poll({
        id: bigInt(0),
        question: new Api.TextWithEntities({ text: parsed.question, entities: [] }),
        answers: parsed.options.map((option) => new Api.InputPollAnswer({
            text: new Api.TextWithEntities({ text: option, entities: [] }),
        })),
        quiz: parsed.quiz,
        hash: bigInt(0),
    });
    // d.ts men-type correctAnswers sebagai int[], skema TL-nya bytes (Buffer).
    const correctAnswers = parsed.quiz && parsed.correctIndex !== undefined
        ? [Buffer.from(String(parsed.correctIndex))]
        : [];
    return new Api.InputMediaPoll({
        poll,
        ...(correctAnswers.length > 0 ? { correctAnswers } : {}),
    });
}
export default {
    name: 'poll',
    version: '1.0.0',
    description: 'Buat poll atau quiz di grup via raw API InputMediaPoll.',
    help: {
        title: 'Poll & Quiz (.poll)',
        description: 'Membuat polling di grup. Pertanyaan dan opsi dipisah titik-koma (;). Mode quiz: tambahkan kata quiz + nomor jawaban benar di depan.',
        usage: '• `.poll <pertanyaan> ; <opsi1> ; <opsi2>` — poll biasa (2-10 opsi)\n• `.poll quiz <no> <pertanyaan> ; <opsi1> ; <opsi2>` — quiz, <no> = nomor opsi jawaban benar (1-based)',
        detail: 'Contoh: .poll Makan siang apa? ; Nasi goreng ; Bakso ; Soto\nContoh quiz: .poll quiz 2 Ibukota Indonesia? ; Bandung ; Jakarta ; Surabaya\nOpsi/pertanyaan lebih dari 100 karakter otomatis dipotong.'
    },
    onLoad: () => {
        Logger.logSystem('📊 Plugin Poll loaded (.poll q ; a ; b | .poll quiz N q ; a ; b)', 'INFO');
    },
    async execute(client, message, _settings, _telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.trim().match(/^\.poll(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const args = (match[1] || '').trim();
        if (!args) {
            await message.edit({
                text: `📊 <b>POLL</b>\n<blockquote>Penggunaan:\n<code>.poll pertanyaan ; opsi1 ; opsi2</code>\n<code>.poll quiz &lt;no&gt; pertanyaan ; opsi1 ; opsi2</code></blockquote>`,
                parseMode: 'html',
            });
            return;
        }
        let chat;
        try {
            chat = await message.getChat();
        }
        catch (_e) {
            chat = undefined;
        }
        if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
            await message.edit({
                text: '<blockquote>❌ <b>Poll hanya bisa dibuat di grup.</b></blockquote>',
                parseMode: 'html',
            });
            return;
        }
        const parsed = parsePollArgs(args);
        if ('error' in parsed) {
            await message.edit({
                text: `📊 <b>POLL</b>\n<blockquote>❌ ${escapeHtml(parsed.error)}</blockquote>`,
                parseMode: 'html',
            });
            return;
        }
        try {
            await message.edit({
                text: '📊 <b>Mengirim poll...</b>',
                parseMode: 'html',
            });
            await client.invoke(new Api.messages.SendMedia({
                peer: chat,
                media: buildInputMediaPoll(parsed),
                message: '',
            }));
            // Hapus pesan perintah agar poll tampil bersih.
            try {
                await message.delete();
            }
            catch (_e) { /* tidak jadi masalah bila gagal hapus */ }
            Logger.logSystem(`📊 Poll dibuat: "${parsed.question}" (${parsed.options.length} opsi${parsed.quiz ? ', quiz' : ''})`, 'INFO');
        }
        catch (err) {
            const msg = errText(err);
            const hint = /CHAT_SEND_POLL/i.test(msg)
                ? '\nℹ️ Pengiriman poll dimatikan oleh admin grup.'
                : /PRE_?QUIZ/i.test(msg)
                    ? '\nℹ️ Poll quiz tidak didukung di grup ini.'
                    : '';
            await message.edit({
                text: `📊 <b>POLL</b>\n<blockquote>❌ Gagal: <i>${escapeHtml(msg)}</i>${hint}</blockquote>`,
                parseMode: 'html',
            });
            Logger.logUser(0, `Error in poll plugin: ${msg}`, 'ERROR');
        }
    }
};
