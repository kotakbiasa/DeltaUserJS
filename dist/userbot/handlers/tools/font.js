import { escapeHtml } from '../../../utils/richMessage.js';
const FONT_STYLES = {
    'bold': {
        upper: '\u{1D400}\u{1D401}\u{1D402}\u{1D403}\u{1D404}\u{1D405}\u{1D406}\u{1D407}\u{1D408}\u{1D409}\u{1D40A}\u{1D40B}\u{1D40C}\u{1D40D}\u{1D40E}\u{1D40F}\u{1D410}\u{1D411}\u{1D412}\u{1D413}\u{1D414}\u{1D415}\u{1D416}\u{1D417}\u{1D418}\u{1D419}',
        lower: '\u{1D41A}\u{1D41B}\u{1D41C}\u{1D41D}\u{1D41E}\u{1D41F}\u{1D420}\u{1D421}\u{1D422}\u{1D423}\u{1D424}\u{1D425}\u{1D426}\u{1D427}\u{1D428}\u{1D429}\u{1D42A}\u{1D42B}\u{1D42C}\u{1D42D}\u{1D42E}\u{1D42F}\u{1D430}\u{1D431}\u{1D432}\u{1D433}',
        digits: '\u{1D7CE}\u{1D7CF}\u{1D7D0}\u{1D7D1}\u{1D7D2}\u{1D7D3}\u{1D7D4}\u{1D7D5}\u{1D7D6}\u{1D7D7}'
    },
    'italic': {
        upper: '\u{1D434}\u{1D435}\u{1D436}\u{1D437}\u{1D438}\u{1D439}\u{1D43A}\u{1D43B}\u{1D43C}\u{1D43D}\u{1D43E}\u{1D43F}\u{1D440}\u{1D441}\u{1D442}\u{1D443}\u{1D444}\u{1D445}\u{1D446}\u{1D447}\u{1D448}\u{1D449}\u{1D44A}\u{1D44B}\u{1D44C}\u{1D44D}',
        lower: '\u{1D44E}\u{1D44F}\u{1D450}\u{1D451}\u{1D452}\u{1D453}\u{1D454}\u{210E}\u{1D456}\u{1D457}\u{1D458}\u{1D459}\u{1D45A}\u{1D45B}\u{1D45C}\u{1D45D}\u{1D45E}\u{1D45F}\u{1D460}\u{1D461}\u{1D462}\u{1D463}\u{1D464}\u{1D465}\u{1D466}\u{1D467}',
        digits: '0123456789'
    },
    'bolditalic': {
        upper: '\u{1D468}\u{1D469}\u{1D46A}\u{1D46B}\u{1D46C}\u{1D46D}\u{1D46E}\u{1D46F}\u{1D470}\u{1D471}\u{1D472}\u{1D473}\u{1D474}\u{1D475}\u{1D476}\u{1D477}\u{1D478}\u{1D479}\u{1D47A}\u{1D47B}\u{1D47C}\u{1D47D}\u{1D47E}\u{1D47F}\u{1D480}\u{1D481}',
        lower: '\u{1D482}\u{1D483}\u{1D484}\u{1D485}\u{1D486}\u{1D487}\u{1D488}\u{1D489}\u{1D48A}\u{1D48B}\u{1D48C}\u{1D48D}\u{1D48E}\u{1D48F}\u{1D490}\u{1D491}\u{1D492}\u{1D493}\u{1D494}\u{1D495}\u{1D496}\u{1D497}\u{1D498}\u{1D499}\u{1D49A}\u{1D49B}',
        digits: '0123456789'
    },
    'script': {
        upper: '\u{1D49C}\u{212C}\u{1D49E}\u{1D49F}\u{2130}\u{2131}\u{1D4A2}\u{210B}\u{2110}\u{1D4A5}\u{1D4A6}\u{2112}\u{2133}\u{1D4A9}\u{1D4AA}\u{1D4AB}\u{1D4AC}\u{211B}\u{1D4AE}\u{1D4AF}\u{1D4B0}\u{1D4B1}\u{1D4B2}\u{1D4B3}\u{1D4B4}\u{1D4B5}',
        lower: '\u{1D4B6}\u{1D4B7}\u{1D4B8}\u{1D4B9}\u{212F}\u{1D4BB}\u{210A}\u{1D4BD}\u{1D4BE}\u{1D4BF}\u{1D4C0}\u{1D4C1}\u{1D4C2}\u{1D4C3}\u{2134}\u{1D4C5}\u{1D4C6}\u{1D4C7}\u{1D4C8}\u{1D4C9}\u{1D4CA}\u{1D4CB}\u{1D4CC}\u{1D4CD}\u{1D4CE}\u{1D4CF}',
        digits: '0123456789'
    },
    'fraktur': {
        upper: '\u{1D504}\u{1D505}\u{212D}\u{1D507}\u{1D508}\u{1D509}\u{1D50A}\u{210C}\u{2111}\u{1D50D}\u{1D50E}\u{1D50F}\u{1D510}\u{1D511}\u{1D512}\u{1D513}\u{1D514}\u{211C}\u{1D516}\u{1D517}\u{1D518}\u{1D519}\u{1D51A}\u{1D51B}\u{1D51C}\u{2128}',
        lower: '\u{1D51E}\u{1D51F}\u{1D520}\u{1D521}\u{1D522}\u{1D523}\u{1D524}\u{1D525}\u{1D526}\u{1D527}\u{1D528}\u{1D529}\u{1D52A}\u{1D52B}\u{1D52C}\u{1D52D}\u{1D52E}\u{1D52F}\u{1D530}\u{1D531}\u{1D532}\u{1D533}\u{1D534}\u{1D535}\u{1D536}\u{1D537}',
        digits: '0123456789'
    },
    'doublestruck': {
        upper: '\u{1D538}\u{1D539}\u{2102}\u{1D53B}\u{1D53C}\u{1D53D}\u{1D53E}\u{210D}\u{1D540}\u{1D541}\u{1D542}\u{1D543}\u{1D544}\u{2115}\u{1D546}\u{2119}\u{211A}\u{211D}\u{1D54A}\u{1D54B}\u{1D54C}\u{1D54D}\u{1D54E}\u{1D54F}\u{1D550}\u{2124}',
        lower: '\u{1D552}\u{1D553}\u{1D554}\u{1D555}\u{1D556}\u{1D557}\u{1D558}\u{1D559}\u{1D55A}\u{1D55B}\u{1D55C}\u{1D55D}\u{1D55E}\u{1D55F}\u{1D560}\u{1D561}\u{1D562}\u{1D563}\u{1D564}\u{1D565}\u{1D566}\u{1D567}\u{1D568}\u{1D569}\u{1D56A}\u{1D56B}',
        digits: '\u{1D7D8}\u{1D7D9}\u{1D7DA}\u{1D7DB}\u{1D7DC}\u{1D7DD}\u{1D7DE}\u{1D7DF}\u{1D7E0}\u{1D7E1}'
    },
    'monospace': {
        upper: '\u{1D670}\u{1D671}\u{1D672}\u{1D673}\u{1D674}\u{1D675}\u{1D676}\u{1D677}\u{1D678}\u{1D679}\u{1D67A}\u{1D67B}\u{1D67C}\u{1D67D}\u{1D67E}\u{1D67F}\u{1D680}\u{1D681}\u{1D682}\u{1D683}\u{1D684}\u{1D685}\u{1D686}\u{1D687}\u{1D688}\u{1D689}',
        lower: '\u{1D68A}\u{1D68B}\u{1D68C}\u{1D68D}\u{1D68E}\u{1D68F}\u{1D690}\u{1D691}\u{1D692}\u{1D693}\u{1D694}\u{1D695}\u{1D696}\u{1D697}\u{1D698}\u{1D699}\u{1D69A}\u{1D69B}\u{1D69C}\u{1D69D}\u{1D69E}\u{1D69F}\u{1D6A0}\u{1D6A1}\u{1D6A2}\u{1D6A3}',
        digits: '\u{1D7F6}\u{1D7F7}\u{1D7F8}\u{1D7F9}\u{1D7FA}\u{1D7FB}\u{1D7FC}\u{1D7FD}\u{1D7FE}\u{1D7FF}'
    },
    'smallcaps': {
        // Small caps: hanya ada lowercase — uppercase dipetakan ke set yang sama.
        upper: '\u{1D00}\u{299}\u{1D04}\u{1D05}\u{1D07}\u{A730}\u{262}\u{29C}\u{26A}\u{1D0A}\u{1D0B}\u{29F}\u{1D0D}\u{274}\u{1D0F}\u{1D18}\u{A7AF}\u{280}\u{A731}\u{1D1B}\u{1D1C}\u{1D20}\u{1D21}x\u{28F}\u{1D22}',
        lower: '\u{1D00}\u{299}\u{1D04}\u{1D05}\u{1D07}\u{A730}\u{262}\u{29C}\u{26A}\u{1D0A}\u{1D0B}\u{29F}\u{1D0D}\u{274}\u{1D0F}\u{1D18}\u{A7AF}\u{280}\u{A731}\u{1D1B}\u{1D1C}\u{1D20}\u{1D21}x\u{28F}\u{1D22}',
        digits: '0123456789'
    },
    'fullwidth': {
        upper: '\u{FF21}\u{FF22}\u{FF23}\u{FF24}\u{FF25}\u{FF26}\u{FF27}\u{FF28}\u{FF29}\u{FF2A}\u{FF2B}\u{FF2C}\u{FF2D}\u{FF2E}\u{FF2F}\u{FF30}\u{FF31}\u{FF32}\u{FF33}\u{FF34}\u{FF35}\u{FF36}\u{FF37}\u{FF38}\u{FF39}\u{FF3A}',
        lower: '\u{FF41}\u{FF42}\u{FF43}\u{FF44}\u{FF45}\u{FF46}\u{FF47}\u{FF48}\u{FF49}\u{FF4A}\u{FF4B}\u{FF4C}\u{FF4D}\u{FF4E}\u{FF4F}\u{FF50}\u{FF51}\u{FF52}\u{FF53}\u{FF54}\u{FF55}\u{FF56}\u{FF57}\u{FF58}\u{FF59}\u{FF5A}',
        digits: '\u{FF10}\u{FF11}\u{FF12}\u{FF13}\u{FF14}\u{FF15}\u{FF16}\u{FF17}\u{FF18}\u{FF19}'
    },
    'superscript': {
        // Superscript: hanya ada lowercase — uppercase dipetakan ke set yang sama.
        upper: '\u{1D43}\u{1D47}\u{1D9C}\u{1D48}\u{1D49}\u{1DA0}\u{1D4D}\u{2B0}\u{2071}\u{2B2}\u{1D4F}\u{2E1}\u{1D50}\u{207F}\u{1D52}\u{1D56}\u{1D60}\u{2B3}\u{2E2}\u{1D57}\u{1D58}\u{1D5B}\u{2B7}\u{2E3}\u{2B8}\u{1DBB}',
        lower: '\u{1D43}\u{1D47}\u{1D9C}\u{1D48}\u{1D49}\u{1DA0}\u{1D4D}\u{2B0}\u{2071}\u{2B2}\u{1D4F}\u{2E1}\u{1D50}\u{207F}\u{1D52}\u{1D56}\u{1D60}\u{2B3}\u{2E2}\u{1D57}\u{1D58}\u{1D5B}\u{2B7}\u{2E3}\u{2B8}\u{1DBB}',
        digits: '\u{2070}\u{B9}\u{B2}\u{B3}\u{2074}\u{2075}\u{2076}\u{2077}\u{2078}\u{2079}'
    },
    'bubble': {
        upper: '\u{24B6}\u{24B7}\u{24B8}\u{24B9}\u{24BA}\u{24BB}\u{24BC}\u{24BD}\u{24BE}\u{24BF}\u{24C0}\u{24C1}\u{24C2}\u{24C3}\u{24C4}\u{24C5}\u{24C6}\u{24C7}\u{24C8}\u{24C9}\u{24CA}\u{24CB}\u{24CC}\u{24CD}\u{24CE}\u{24CF}',
        lower: '\u{24D0}\u{24D1}\u{24D2}\u{24D3}\u{24D4}\u{24D5}\u{24D6}\u{24D7}\u{24D8}\u{24D9}\u{24DA}\u{24DB}\u{24DC}\u{24DD}\u{24DE}\u{24DF}\u{24E0}\u{24E1}\u{24E2}\u{24E3}\u{24E4}\u{24E5}\u{24E6}\u{24E7}\u{24E8}\u{24E9}',
        digits: '\u{24EA}\u{2460}\u{2461}\u{2462}\u{2463}\u{2464}\u{2465}\u{2466}\u{2467}\u{2468}'
    },
    'square': {
        // Squared latin: hanya ada bentuk uppercase — lowercase & upper dipetakan sama.
        upper: '\u{1F130}\u{1F131}\u{1F132}\u{1F133}\u{1F134}\u{1F135}\u{1F136}\u{1F137}\u{1F138}\u{1F139}\u{1F13A}\u{1F13B}\u{1F13C}\u{1F13D}\u{1F13E}\u{1F13F}\u{1F140}\u{1F141}\u{1F142}\u{1F143}\u{1F144}\u{1F145}\u{1F146}\u{1F147}\u{1F148}\u{1F149}',
        lower: '\u{1F130}\u{1F131}\u{1F132}\u{1F133}\u{1F134}\u{1F135}\u{1F136}\u{1F137}\u{1F138}\u{1F139}\u{1F13A}\u{1F13B}\u{1F13C}\u{1F13D}\u{1F13E}\u{1F13F}\u{1F140}\u{1F141}\u{1F142}\u{1F143}\u{1F144}\u{1F145}\u{1F146}\u{1F147}\u{1F148}\u{1F149}',
        digits: '0123456789'
    }
};
const STYLE_NAMES = Object.keys(FONT_STYLES);
// ---- Helpers ----
/** Terapkan map unicode pada satu gaya. Karakter tanpa padanan dibiarkan. */
function applyFont(text, style) {
    const map = new Map();
    for (let i = 0; i < 26; i++) {
        map.set(String.fromCharCode(65 + i), style.upper[i]);
        map.set(String.fromCharCode(97 + i), style.lower[i]);
    }
    for (let d = 0; d < 10; d++) {
        map.set(String.fromCharCode(48 + d), style.digits[d]);
    }
    return [...text].map((ch) => map.get(ch) ?? ch).join('');
}
/** Cari nama gaya secara case-insensitive. */
function resolveStyleName(raw) {
    const needle = raw.trim().toLowerCase();
    for (const name of STYLE_NAMES) {
        if (name.toLowerCase() === needle) {
            return name;
        }
    }
    return null;
}
export default {
    name: 'font',
    version: '1.0.0',
    description: 'Ubah teks ke 12 gaya unicode font: bold, italic, script, fraktur, dan lainnya.',
    help: {
        title: '🔤 Font Generator (.font)',
        description: 'Mengubah teks menjadi berbagai gaya unicode font (bold, italic, script, fraktur, doublestruck, monospace, smallcaps, fullwidth, superscript, bubble, square).',
        usage: '• `.font <teks>` — lihat daftar 12 gaya + preview tiap gaya\n' +
            '• `.font <teks> | <gaya>` — langsung kirim versi gaya itu, contoh: `.font Halo | bold`',
        detail: 'Gaya tersedia: ' + STYLE_NAMES.join(', ') + '. ' +
            'Nama gaya boleh ditulis tanpa peduli huruf besar/kecil. Karakter selain A-Z, a-z, 0-9 dibiarkan apa adanya. ' +
            'Hasil dikirim sebagai teks biasa sehingga bisa langsung di-copy.'
    },
    async execute(client, message, _settings, _telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.font(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const arg = (match[1] || '').trim();
        if (!arg) {
            await message.edit({
                text: `<blockquote>❌ <b>Format salah:</b> <code>.font &lt;teks&gt;</code>\n` +
                    `Contoh: <code>.font Halo Dunia</code>\n` +
                    `Atau pilih gaya: <code>.font Halo | bold</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        // ---- Mode 2: .font <teks> <gaya> (atau .font <teks> | <gaya>) →
        // langsung kirim versi gaya itu. Nama gaya boleh jadi kata
        // terakhir, atau dipisah dengan karakter |.
        let inputText = '';
        let styleInput = '';
        if (arg.includes('|')) {
            const parts = arg.split('|');
            inputText = parts[0].trim();
            styleInput = parts.slice(1).join('|').trim();
        }
        else {
            const tokens = arg.split(/\s+/);
            const last = tokens[tokens.length - 1] || '';
            if (resolveStyleName(last)) {
                styleInput = last;
                inputText = tokens.slice(0, -1).join(' ').trim();
            }
        }
        const styleName = resolveStyleName(styleInput);
        if (!styleName || !inputText) {
            // Gaya disebut tapi teks kosong (mis. ".font bold") →
            // perlakukan seluruh argumen sebagai teks untuk daftar preview.
            if (styleName && !inputText) {
                await showFontList(message, styleInput);
                return;
            }
            await showFontList(message, arg);
            return;
        }
        const converted = applyFont(inputText, FONT_STYLES[styleName]);
        // Hasil dikirim verbatim (parseMode false) agar unicode font tidak
        // terkena parsing HTML dan bisa langsung di-copy.
        await client.sendMessage(message.chatId, {
            message: converted,
            parseMode: false,
            linkPreview: false,
            replyTo: message.replyToMsgId
        });
        try {
            await message.delete();
        }
        catch (_e) { /* ignore */ }
    }
};
/** Tampilkan daftar 12 gaya + preview untuk teks tertentu. */
async function showFontList(message, text) {
    let listText = `🔤 <b>Font Styles untuk:</b> <i>"${escapeHtml(text)}"</i>\n\n<blockquote>`;
    for (const name of STYLE_NAMES) {
        const preview = applyFont(text, FONT_STYLES[name]);
        listText += `<b>${escapeHtml(name)}</b>\n<code>${escapeHtml(preview)}</code>\n\n`;
    }
    listText += `</blockquote>Kirim versi tertentu: <code>.font ${escapeHtml(text)} | bold</code>`;
    await message.edit({
        text: listText,
        parseMode: 'html',
        linkPreview: false
    });
}
