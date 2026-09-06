import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT = 45_000;
const withTimeout = (ms) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(timer) };
};
/**
 * Screenshot provider terverifikasi (2026-09-06):
 *  1. image.thum.io/get/width/1280/<url>  → PNG
 *  2. s0.wp.com/mshots/v1/<url-encoded>   → JPEG (butuh UA browser)
 *  3. api.microlink.io/?url=...&screenshot=true&embed=screenshot.url → PNG
 * Urutan: thum.io → mshots → microlink.
 */
const URL_RE = /^https?:\/\/[^\s<>"']+$/i;
function normalizeUrl(raw) {
    let u = raw.trim().replace(/^</, '').replace(/>$/, '');
    if (!/^https?:\/\//i.test(u)) {
        u = `https://${u}`;
    }
    return u;
}
function isValidUrl(u) {
    if (!URL_RE.test(u)) {
        return false;
    }
    try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }
    catch (_e) {
        return false;
    }
}
const isImageBuffer = (buf) => {
    if (!buf || buf.length < 12) {
        return false;
    }
    // JPEG (FFD8FF), PNG (89504E47), GIF (GIF8), WEBP (RIFF....WEBP)
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return true;
    }
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return true;
    }
    if (buf.slice(0, 4).toString('ascii') === 'GIF8') {
        return true;
    }
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
        return true;
    }
    return false;
};
async function shotThumio(url) {
    const t = withTimeout(FETCH_TIMEOUT);
    try {
        const res = await fetch(`https://image.thum.io/get/width/1280/${url}`, {
            headers: { 'User-Agent': UA, accept: 'image/*' },
            redirect: 'follow',
            signal: t.signal,
        });
        if (!res.ok) {
            throw new Error(`thum.io HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (!isImageBuffer(buf)) {
            throw new Error('thum.io respons bukan gambar');
        }
        return buf;
    }
    finally {
        t.done();
    }
}
async function shotMshots(url) {
    const t = withTimeout(FETCH_TIMEOUT);
    try {
        const res = await fetch(`https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': UA, accept: 'image/*' },
            redirect: 'follow',
            signal: t.signal,
        });
        if (!res.ok) {
            throw new Error(`mshots HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (!isImageBuffer(buf)) {
            throw new Error('mshots respons bukan gambar');
        }
        return buf;
    }
    finally {
        t.done();
    }
}
async function shotMicrolink(url) {
    const t = withTimeout(FETCH_TIMEOUT);
    try {
        const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`, {
            headers: { 'User-Agent': UA, accept: 'image/*' },
            redirect: 'follow',
            signal: t.signal,
        });
        if (!res.ok) {
            throw new Error(`microlink HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (!isImageBuffer(buf)) {
            throw new Error('microlink respons bukan gambar');
        }
        return buf;
    }
    finally {
        t.done();
    }
}
const PROVIDERS = [
    ['thum.io', shotThumio],
    ['mshots', shotMshots],
    ['microlink', shotMicrolink],
];
async function getShot(url) {
    const errors = [];
    for (const [name, fn] of PROVIDERS) {
        try {
            const buffer = await fn(url);
            return { buffer, provider: name };
        }
        catch (err) {
            errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    throw new Error(`Semua provider screenshot gagal — ${errors.join(' | ')}`);
}
function procText(text) {
    return `<blockquote>⏳ ${text}</blockquote>`;
}
async function editError(message, text) {
    await message.edit({
        text: `<blockquote>❌ <b>Gagal:</b> ${escapeHtml(text)}</blockquote>`,
        parseMode: 'html',
        linkPreview: false,
    });
}
async function editSuccess(message, text) {
    await message.edit({
        text: `<blockquote>✅ <b>Berhasil!</b> ${text}</blockquote>`,
        parseMode: 'html',
        linkPreview: false,
    });
}
async function getReplied(message) {
    try {
        return await message.getReplyMessage();
    }
    catch (_e) {
        return null;
    }
}
/** Cari URL dari argumen command atau teks pesan yang dibalas. */
async function resolveUrl(message, arg) {
    if (arg) {
        const candidate = normalizeUrl(arg.split(/\s+/)[0]);
        if (isValidUrl(candidate)) {
            return candidate;
        }
    }
    const replied = await getReplied(message);
    const replyText = typeof replied?.message === 'string' ? replied.message : '';
    if (replyText) {
        // Ambil token pertama yang menyerupai URL http(s) dari teks reply.
        const tokens = replyText.split(/\s+/);
        for (const tok of tokens) {
            const cleaned = tok.replace(/[<>"']+$/, '');
            const candidate = /^https?:\/\//i.test(cleaned) ? cleaned : null;
            if (candidate && isValidUrl(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}
// ============================================================
// Plugin utama — .webshot <url | reply pesan ber-url>
// ============================================================
export default {
    name: 'webshot',
    version: '1.0.0',
    description: 'Screenshot halaman web dari URL, dikirim sebagai foto.',
    help: {
        title: 'Webshot (.webshot)',
        description: 'Ambil screenshot halaman web dan kirim sebagai foto.',
        usage: '• `.webshot <url>` — screenshot URL yang diberikan.\n• `.webshot` (balas pesan berisi URL) — screenshot URL dari pesan yang dibalas.',
        detail: 'Screenshot diambil via thum.io; fallback otomatis ke WordPress mshots lalu microlink bila provider utama gagal. URL harus http(s).'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.trim().match(/^\.webshot(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const arg = (match[1] || '').trim();
        const url = await resolveUrl(message, arg);
        if (!url) {
            await message.edit({
                text: '<blockquote>❌ <b>Format salah:</b> sertakan URL http(s) atau balas pesan yang berisi URL. Contoh: <code>.webshot example.com</code></blockquote>',
                parseMode: 'html',
                linkPreview: false,
            });
            return;
        }
        await message.edit({ text: procText(`Mengambil screenshot <code>${escapeHtml(url)}</code>...`), parseMode: 'html' });
        try {
            const { buffer, provider } = await getShot(url);
            await client.sendFile(message.chatId, {
                file: buffer,
                forceDocument: false,
                caption: `📸 <code>${escapeHtml(url)}</code> <i>(${provider})</i>`,
                parseMode: 'html',
                linkPreview: false,
                replyTo: message.replyToMsgId || message.id,
            });
            try {
                await message.delete();
            }
            catch (_e) { /* ignore */ }
            await editSuccess(message, 'Screenshot dikirim sebagai foto.');
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in webshot: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await editError(message, err instanceof Error ? err.message : String(err));
        }
    }
};
