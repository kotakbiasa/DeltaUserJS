import { escapeHtml } from '../../../utils/richMessage.js';
// ============================================================
// Unicode maps (diekstrak 1:1 dari getter kastaid: FLIP_MAP &
// small_caps - flip ala plugins/text.py, small caps ala text.py)
// ============================================================
const FLIP_MAP = new Map([
    ['a', '\u0250'],
    ['b', 'q'],
    ['c', '\u0254'],
    ['d', 'p'],
    ['e', '\u01DD'],
    ['f', '\u025F'],
    ['g', '\u0183'],
    ['h', '\u0265'],
    ['i', '\u1D09'],
    ['j', '\u027E'],
    ['k', '\u029E'],
    ['l', 'l'],
    ['m', '\u026F'],
    ['n', 'u'],
    ['o', 'o'],
    ['p', 'd'],
    ['q', 'b'],
    ['r', '\u0279'],
    ['s', 's'],
    ['t', '\u0287'],
    ['u', 'n'],
    ['v', '\u028C'],
    ['w', '\u028D'],
    ['x', 'x'],
    ['y', '\u028E'],
    ['z', 'z'],
    ['A', '\u2200'],
    ['B', 'B'],
    ['C', '\u0186'],
    ['D', 'D'],
    ['E', '\u018E'],
    ['F', '\u2132'],
    ['G', '\u05E4'],
    ['H', 'H'],
    ['I', 'I'],
    ['J', '\u017F'],
    ['K', 'K'],
    ['L', '\u02E5'],
    ['M', 'W'],
    ['N', 'N'],
    ['O', 'O'],
    ['P', '\u0500'],
    ['Q', 'Q'],
    ['R', 'R'],
    ['S', 'S'],
    ['T', '\u2534'],
    ['U', '\u2229'],
    ['V', '\u039B'],
    ['W', 'M'],
    ['X', 'X'],
    ['Y', '\u2144'],
    ['Z', 'Z'],
    ['0', '0'],
    ['1', '\u0196'],
    ['2', '\u1105'],
    ['3', '\u0190'],
    ['4', '\u152D'],
    ['5', '\u03DB'],
    ['6', '9'],
    ['7', '\u2C62'],
    ['8', '8'],
    ['9', '6'],
    [',', '\u0027'],
    ['.', '\u02D9'],
    ['?', '\u00BF'],
    ['!', '\u00A1'],
    ['\u0022', ',,'],
    ['\u0027', ','],
    ['(', ')'],
    [')', '('],
    ['[', ']'],
    [']', '['],
    ['{', '}'],
    ['}', '{'],
    ['\u003C', '\u003E'],
    ['\u003E', '\u003C'],
    ['&', '\u214B'],
    ['_', '\u203E'],
]);
const SMALL_CAPS = '\u1D00\u0299\u1D04\u1D05\u1D07\u0493\u0262\u029C\u026A\u1D0A\u1D0B\u029F\u1D0D\u0274\u1D0F\u1D18\u03D9\u0280s\u1D1B\u1D1C\u1D20\u1D21x\u028F\u1D22';
const MAX_REPEAT = 20;
// Range emoji Unicode (ala strip_emoji getter): surrogates 1F000-1FAFF,
// dingbats/simbol 2600-27BF, panah/teknis misc, selector & ZWJ.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;
function toSmallCaps(text) {
    return [...text.toLowerCase()].map((ch) => {
        const code = ch.charCodeAt(0);
        if (code >= 97 && code <= 122) {
            return SMALL_CAPS[code - 97];
        }
        return ch;
    }).join('');
}
function flipText(text) {
    return [...text].map((ch) => FLIP_MAP.get(ch) ?? ch).join('');
}
function stripEmoji(text) {
    return text.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ').trim();
}
async function editResult(message, html) {
    await message.edit({ text: html, parseMode: 'html', linkPreview: false });
}
// ============================================================
// Plugin utama - satu file, multi command teks:
// .small / .flip / .repeat / .count / .noemoji
// (.all sengaja TIDAK di sini - ditangani tagall.ts)
// ============================================================
export default {
    name: 'textfun',
    version: '1.0.0',
    description: 'Alat teks: small caps, flip upside-down, repeat, count, dan strip emoji.',
    help: {
        title: 'Text Fun (.small / .flip / .repeat / .count / .noemoji)',
        description: 'Olah teks langsung dari pesan perintah: ubah ke small caps unicode, balik upside-down, ulang teks, hitung isi pesan, atau hapus emoji.',
        usage: '• `.small <teks>` - teks jadi small caps unicode.\n• `.flip <teks>` - teks dibalik upside-down unicode.\n• `.repeat <angka> <teks>` - ulangi teks maksimal 20x.\n• `.count <teks>` - hitung karakter/kata/baris.\n• `.noemoji <teks>` - hapus semua emoji dari teks.',
        detail: 'Semua perintah mengedit pesan perintahmu menjadi hasil olahan. .repeat membatasi pengulangan pada 20 baris. .count melaporkan jumlah karakter, kata, dan baris. .noemoji membersihkan emoji & simbol unicode.'
    },
    async execute(client, message, _settings, _telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const raw = message.message.trim();
        const m = raw.match(/^\.(small|flip|repeat|count|noemoji)(?:\s+([\s\S]+))?$/i);
        if (!m) {
            return;
        }
        const cmd = m[1].toLowerCase();
        const arg = (m[2] || '').trim();
        if (!arg) {
            await editResult(message, `<blockquote>❌ <b>Format salah:</b> <code>.${escapeHtml(cmd)} &lt;teks&gt;</code></blockquote>`);
            return;
        }
        if (cmd === 'small') {
            await editResult(message, `<blockquote>${escapeHtml(toSmallCaps(arg))}</blockquote>`);
            return;
        }
        if (cmd === 'flip') {
            await editResult(message, `<blockquote>${escapeHtml(flipText(arg))}</blockquote>`);
            return;
        }
        if (cmd === 'repeat') {
            const rm = arg.match(/^(\d+)(?:\s+([\s\S]+))?$/);
            if (!rm) {
                await editResult(message, '<blockquote>❌ <b>Format salah:</b> <code>.repeat &lt;angka&gt; &lt;teks&gt;</code></blockquote>');
                return;
            }
            const text = (rm[2] || '').trim();
            if (!text) {
                await editResult(message, '<blockquote>❌ <b>Teks tidak boleh kosong.</b></blockquote>');
                return;
            }
            let n = parseInt(rm[1], 10);
            if (!Number.isFinite(n) || n < 1) {
                n = 1;
            }
            if (n > MAX_REPEAT) {
                n = MAX_REPEAT;
            }
            const out = Array.from({ length: n }, () => text).join('\n');
            await editResult(message, `<blockquote>${escapeHtml(out)}</blockquote>`);
            return;
        }
        if (cmd === 'count') {
            const chars = [...arg].length;
            const words = arg.split(/\s+/).filter(Boolean).length;
            const lines = arg.split('\n').length;
            await editResult(message, `<blockquote>📊 <b>Count</b>\nKarakter: <code>${chars}</code>\nKata: <code>${words}</code>\nBaris: <code>${lines}</code></blockquote>`);
            return;
        }
        if (cmd === 'noemoji') {
            const cleaned = stripEmoji(arg);
            await editResult(message, `<blockquote>${escapeHtml(cleaned) || '<i>(kosong)</i>'}</blockquote>`);
        }
    }
};
