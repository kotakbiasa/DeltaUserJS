import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// ============================================================
// Kamus Inggris — .define <kata>
// Sumber: api.dictionaryapi.dev/api/v2/entries/en/<kata>
// (Free Dictionary API, terverifikasi hidup). Menampilkan
// fonetik, link audio pelafalan, arti teratas per part-of-speech,
// dan contoh kalimat. Respons 404 / tanpa entri = kata tidak
// ditemukan. Konsep dari modul meaning.py catuserbot.
// ============================================================
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const MAX_DEF_LEN = 300;
const MAX_EX_LEN = 160;
function truncate(text, max) {
    const s = String(text || '').trim();
    if (s.length <= max) {
        return s;
    }
    return `${s.slice(0, max - 1)}…`;
}
export default {
    name: 'define',
    version: '1.0.0',
    description: 'Kamus Inggris via dictionaryapi.dev: fonetik, audio, arti per part-of-speech, contoh.',
    help: {
        title: '📖 Kamus Inggris (.define)',
        description: 'Mencari arti kata bahasa Inggris: fonetik, audio pelafalan, arti teratas per part-of-speech, dan contoh kalimat.',
        usage: '`.define <kata>`',
        detail: 'Contoh: `.define hello`. Sumber: dictionaryapi.dev (Free Dictionary API). Kata yang tidak ada di kamus ditolak dengan pesan "tidak ditemukan".'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.define(?![A-Za-z0-9])(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const word = (match[1] || '').trim();
        if (!word) {
            await message.edit({
                text: `<blockquote>❌ <b>Format salah:</b> <code>.define &lt;kata&gt;</code>\n` +
                    `Contoh: <code>.define hello</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Mencari "${escapeHtml(word)}" di kamus...</b></blockquote>`,
            parseMode: 'html'
        });
        try {
            const res = await fetch(API_BASE + encodeURIComponent(word), {
                headers: { 'User-Agent': BROWSER_UA }
            });
            if (res.status === 404) {
                await message.edit({
                    text: `<blockquote>❌ <b>Kata tidak ditemukan:</b> <i>${escapeHtml(word)}</i> tidak ada di kamus Inggris.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            if (!res.ok) {
                throw new Error(`dictionaryapi.dev responded ${res.status}`);
            }
            const data = await res.json();
            // Respons error API berbentuk objek {title: "No Definitions Found", ...}
            if (!Array.isArray(data) || data.length === 0) {
                await message.edit({
                    text: `<blockquote>❌ <b>Kata tidak ditemukan:</b> <i>${escapeHtml(word)}</i> tidak ada di kamus Inggris.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const entry = data[0];
            let phonetic = typeof entry.phonetic === 'string' && entry.phonetic ? entry.phonetic : '';
            let audio = '';
            if (Array.isArray(entry.phonetics)) {
                for (const p of entry.phonetics) {
                    if (!phonetic && p && typeof p.text === 'string' && p.text) {
                        phonetic = p.text;
                    }
                    if (!audio && p && typeof p.audio === 'string' && p.audio) {
                        audio = p.audio;
                    }
                }
            }
            let body = '';
            const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
            for (const m of meanings) {
                const defs = m && Array.isArray(m.definitions) ? m.definitions : [];
                const top = defs[0];
                if (!top || !top.definition) {
                    continue;
                }
                const pos = m && m.partOfSpeech ? m.partOfSpeech : 'lainnya';
                body += `\n<b>${escapeHtml(pos)}</b>\n• ${escapeHtml(truncate(top.definition, MAX_DEF_LEN))}\n`;
                if (top.example) {
                    body += `&nbsp;&nbsp;<i>Contoh: "${escapeHtml(truncate(top.example, MAX_EX_LEN))}"</i>\n`;
                }
            }
            const head = `📖 <b>${escapeHtml(entry.word || word)}</b>` +
                (phonetic ? `\nFonetik: <code>${escapeHtml(phonetic)}</code>` : '') +
                (audio ? `\n🔊 <a href="${escapeHtml(audio)}">Dengarkan pelafalan</a>` : '');
            const result = body
                ? `${head}\n${body}`
                : `${head}\n\n<i>Arti tidak tersedia untuk kata ini.</i>`;
            await message.edit({ text: result, parseMode: 'html', linkPreview: false });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in define plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal mengambil definisi:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
