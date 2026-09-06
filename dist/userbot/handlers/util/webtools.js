import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const asObj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const asArr = (v) => (Array.isArray(v) ? v : []);
const asStr = (v) => (typeof v === 'string' ? v : '');
const asNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
// Catatan 2026-09-06: api.xposedornot.com/v1/breachedaccount/<email> dicek via curl dan SELALU
// menjawab 404 {"detail":"Not Found"} (pola identik dengan route palsu, termasuk untuk email
// yang jelas terkena breach) -> endpoint mati. Fallback terverifikasi hidup:
//   1. api.xposedornot.com/v1/breach-analytics?email=  (provider sama, JSON lengkap)
//   2. leakcheck.io/api/public?check=                  (fallback kedua)
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const normalizeHost = (input) => {
    let h = input.trim().toLowerCase();
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    h = (h.split(/[/?#]/)[0] || '').trim();
    h = (h.split('@').pop() || h).trim();
    h = h.replace(/:\d+$/, '');
    h = h.replace(/\.+$/, '');
    return h;
};
// Urban Dictionary membungkus istilah dalam [bracket] markdown — bersihkan.
const stripUdMarkdown = (s) => s.replace(/\[(.+?)\]/g, '$1').replace(/\s+/g, ' ').trim();
const withTimeout = (ms) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(timer) };
};
const buildDns = async (host) => {
    const t = withTimeout(15000);
    try {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
            headers: { 'User-Agent': UA, accept: 'application/dns-json' },
            signal: t.signal
        });
        if (!res.ok) {
            throw new Error(`dns.google menjawab HTTP ${res.status}`);
        }
        const data = asObj(await res.json());
        const status = asNum(data.Status);
        if (status === 3) {
            throw new Error('Domain tidak ditemukan (NXDOMAIN)');
        }
        if (status !== 0) {
            throw new Error(`DNS error status ${status}`);
        }
        const answers = asArr(data.Answer);
        const aRecords = answers.filter((r) => asNum(asObj(r).type) === 1).map((r) => asStr(asObj(r).data));
        const chain = answers.filter((r) => asNum(asObj(r).type) !== 1).map((r) => asStr(asObj(r).data));
        if (aRecords.length === 0 && chain.length === 0) {
            throw new Error('Tidak ada record A untuk domain ini');
        }
        const ttl = answers.length > 0 ? asNum(asObj(answers[0]).TTL) : 0;
        let body = `• <b>Domain</b>: <code>${escapeHtml(host)}</code>\n`;
        if (aRecords.length > 0) {
            body += '• <b>A Record</b>:\n';
            for (const ip of aRecords.slice(0, 8)) {
                body += `  - <code>${escapeHtml(ip)}</code>\n`;
            }
            if (aRecords.length > 8) {
                body += `  - <i>+${aRecords.length - 8} lainnya</i>\n`;
            }
        }
        else {
            body += '• <b>Tidak ada A record</b>, alias/chain:\n';
            for (const c of chain.slice(0, 4)) {
                body += `  - <code>${escapeHtml(c)}</code>\n`;
            }
        }
        if (ttl > 0) {
            body += `• <b>TTL</b>: <code>${ttl}s</code>\n`;
        }
        return `🌐 <b>DNS Lookup</b>\n\n<blockquote>${body.trimEnd()}</blockquote>`;
    }
    finally {
        t.done();
    }
};
const buildPing = async (host) => {
    const t = withTimeout(20000);
    try {
        const started = Date.now();
        const res = await fetch(`https://${host}/`, {
            headers: { 'User-Agent': UA },
            redirect: 'follow',
            signal: t.signal
        });
        const latency = Date.now() - started;
        let icon = '❔';
        if (res.status >= 200 && res.status < 300) {
            icon = '✅';
        }
        else if (res.status >= 300 && res.status < 400) {
            icon = '↪️';
        }
        else if (res.status >= 400 && res.status < 500) {
            icon = '⚠️';
        }
        else if (res.status >= 500) {
            icon = '⛔';
        }
        const statusText = res.statusText ? ` ${res.statusText}` : (res.ok ? ' OK' : '');
        let body = `• <b>Target</b>: <code>https://${escapeHtml(host)}/</code>\n`;
        body += `• <b>Status</b>: <code>${res.status}${escapeHtml(statusText)}</code> ${icon}\n`;
        body += `• <b>Latency</b>: <code>${latency} ms</code>\n`;
        if (res.redirected && res.url) {
            body += `• <b>Redirect</b>: <code>${escapeHtml(res.url)}</code>\n`;
        }
        return `🏓 <b>Ping Web</b>\n\n<blockquote>${body.trimEnd()}</blockquote>`;
    }
    finally {
        t.done();
    }
};
const buildWhois = async (host) => {
    const t = withTimeout(25000);
    try {
        const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`, {
            headers: { 'User-Agent': UA, accept: 'application/rdap+json' },
            redirect: 'follow',
            signal: t.signal
        });
        if (res.status === 404) {
            throw new Error('Domain tidak ditemukan di registry (404)');
        }
        if (!res.ok) {
            throw new Error(`rdap.org menjawab HTTP ${res.status}`);
        }
        const data = asObj(await res.json());
        let registrar = '';
        for (const e of asArr(data.entities)) {
            const ent = asObj(e);
            if (!asArr(ent.roles).map(String).includes('registrar')) {
                continue;
            }
            const vcard = asArr(ent.vcardArray);
            for (const it of asArr(vcard[1])) {
                const item = asArr(it);
                if (item[0] === 'fn' && typeof item[3] === 'string' && item[3]) {
                    registrar = item[3];
                    break;
                }
            }
            if (registrar) {
                break;
            }
        }
        const eventDate = (action) => {
            for (const ev of asArr(data.events)) {
                const e = asObj(ev);
                if (asStr(e.eventAction) === action) {
                    return asStr(e.eventDate).split('T')[0] || asStr(e.eventDate);
                }
            }
            return '';
        };
        const nameservers = asArr(data.nameservers)
            .map((n) => asStr(asObj(n).ldhName) || asStr(asObj(n).unicodeName))
            .filter((s) => s !== '')
            .slice(0, 6);
        const statusList = asArr(data.status).map(String);
        const dnssec = asObj(data.secureDNS).delegationSigned;
        const ldh = asStr(data.ldhName) || host;
        let body = `• <b>Domain</b>: <code>${escapeHtml(ldh)}</code>\n`;
        if (registrar) {
            body += `• <b>Registrar</b>: <code>${escapeHtml(registrar)}</code>\n`;
        }
        const created = eventDate('registration');
        const updated = eventDate('last changed');
        const expires = eventDate('expiration');
        if (created) {
            body += `• <b>Dibuat</b>: <code>${escapeHtml(created)}</code>\n`;
        }
        if (expires) {
            body += `• <b>Expired</b>: <code>${escapeHtml(expires)}</code>\n`;
        }
        if (updated) {
            body += `• <b>Diperbarui</b>: <code>${escapeHtml(updated)}</code>\n`;
        }
        if (statusList.length > 0) {
            body += `• <b>Status</b>: <code>${escapeHtml(statusList.slice(0, 4).join(', '))}</code>\n`;
        }
        if (typeof dnssec === 'boolean') {
            body += `• <b>DNSSEC</b>: ${dnssec ? 'Aktif' : 'Tidak'}\n`;
        }
        if (nameservers.length > 0) {
            body += '• <b>Nameserver</b>:\n';
            for (const ns of nameservers) {
                body += `  - <code>${escapeHtml(ns)}</code>\n`;
            }
        }
        return `📋 <b>WHOIS</b>\n\n<blockquote>${body.trimEnd()}</blockquote>`;
    }
    finally {
        t.done();
    }
};
const buildUd = async (term) => {
    const t = withTimeout(15000);
    try {
        const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`, {
            headers: { 'User-Agent': UA },
            signal: t.signal
        });
        if (!res.ok) {
            throw new Error(`Urban Dictionary menjawab HTTP ${res.status}`);
        }
        const data = asObj(await res.json());
        const list = asArr(data.list);
        if (list.length === 0) {
            throw new Error(`Tidak ada definisi untuk "${term}"`);
        }
        const top = asObj(list[0]);
        const word = asStr(top.word) || term;
        const definition = stripUdMarkdown(asStr(top.definition)) || '(tanpa definisi)';
        const example = stripUdMarkdown(asStr(top.example));
        const permalink = asStr(top.permalink);
        const up = asNum(top.thumbs_up);
        let body = `<b>${escapeHtml(clamp(word, 80))}</b> (👍 ${up})\n`;
        body += `${escapeHtml(clamp(definition, 600))}\n`;
        if (example) {
            body += `\n<i>Contoh:</i>\n"${escapeHtml(clamp(example, 300))}"\n`;
        }
        if (permalink) {
            body += `\n🔗 ${escapeHtml(permalink)}`;
        }
        return `📖 <b>Urban Dictionary</b>\n\n<blockquote>${body.trimEnd()}</blockquote>`;
    }
    finally {
        t.done();
    }
};
const spcheckViaXon = async (email) => {
    const t = withTimeout(20000);
    try {
        const res = await fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`, {
            headers: { 'User-Agent': UA },
            signal: t.signal
        });
        if (!res.ok) {
            throw new Error(`XposedOrNot menjawab HTTP ${res.status}`);
        }
        const data = asObj(await res.json());
        const sites = asStr(asObj(data.BreachesSummary).site)
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s !== '');
        const details = asArr(asObj(data.ExposedBreaches).breaches_details);
        let records = 0;
        for (const b of details) {
            records += asNum(asObj(b).xposed_records);
        }
        const pastes = asNum(asObj(data.PastesSummary).cnt);
        let body = `• <b>Email</b>: <code>${escapeHtml(email)}</code>\n`;
        if (sites.length === 0) {
            body += '• <b>Hasil</b>: ✅ Tidak ditemukan di breach yang diketahui\n';
        }
        else {
            body += `• <b>Hasil</b>: ⚠️ Ditemukan di <b>${sites.length}</b> breach\n`;
            body += `• <b>Breach</b>: ${escapeHtml(sites.slice(0, 10).join(', '))}${sites.length > 10 ? `, +${sites.length - 10} lainnya` : ''}\n`;
            if (records > 0) {
                body += `• <b>Total rekaman terekspos</b>: <code>${records.toLocaleString('en-US')}</code>\n`;
            }
        }
        if (pastes > 0) {
            body += `• <b>Pastes</b>: <code>${pastes}</code>\n`;
        }
        body += '\n<i>🩺 Sumber: XposedOrNot breach-analytics — endpoint breachedaccount mati (404 permanen, dicek 2026-09-06)</i>';
        return `🛡️ <b>Breach Check</b>\n\n<blockquote>${body.trimEnd()}</blockquote>`;
    }
    finally {
        t.done();
    }
};
const spcheckViaLeakcheck = async (email) => {
    const t = withTimeout(20000);
    try {
        const res = await fetch(`https://leakcheck.io/api/public?check=${encodeURIComponent(email)}`, {
            headers: { 'User-Agent': UA, accept: 'application/json' },
            signal: t.signal
        });
        if (!res.ok) {
            throw new Error(`LeakCheck menjawab HTTP ${res.status}`);
        }
        const data = asObj(await res.json());
        if (data.success !== true) {
            throw new Error('LeakCheck menjawab success=false');
        }
        const found = asNum(data.found);
        const sources = [...new Set(asArr(data.sources)
                .map((s) => {
                const o = asObj(s);
                const name = asStr(o.name);
                const date = asStr(o.date);
                return date ? `${name} (${date})` : name;
            })
                .filter((s) => s !== ''))];
        let body = `• <b>Email</b>: <code>${escapeHtml(email)}</code>\n`;
        if (found === 0) {
            body += '• <b>Hasil</b>: ✅ Tidak ditemukan kebocoran\n';
        }
        else {
            body += `• <b>Hasil</b>: ⚠️ Muncul dalam <b>${found}</b> entri kebocoran\n`;
            if (sources.length > 0) {
                body += '• <b>Sumber</b>:\n';
                for (const s of sources.slice(0, 8)) {
                    body += `  - ${escapeHtml(s)}\n`;
                }
                if (sources.length > 8) {
                    body += `  - <i>+${sources.length - 8} lainnya</i>\n`;
                }
            }
        }
        body += '\n<i>🩺 Sumber: leakcheck.io (fallback kedua)</i>';
        return `🛡️ <b>Breach Check</b>\n\n<blockquote>${body.trimEnd()}</blockquote>`;
    }
    finally {
        t.done();
    }
};
const buildSpcheck = async (email) => {
    try {
        return await spcheckViaXon(email);
    }
    catch (_e) {
        // fallback ke leakcheck — commented agar lolos no-empty
    }
    try {
        return await spcheckViaLeakcheck(email);
    }
    catch (e) {
        throw new Error('Semua sumber breach (xposedornot, leakcheck) tidak dapat dihubungi', { cause: e });
    }
};
export default {
    name: 'webtools',
    version: '1.0.0',
    description: 'Lookup web: DNS, ping HTTP, WHOIS, Urban Dictionary, dan cek breach email.',
    help: {
        title: 'Web Tools (.dns / .pingweb / .whois / .ud / .spcheck)',
        description: 'Kumpulan lookup utilitas web: DNS A record, latency HTTPS, WHOIS domain, kamus slang, dan cek kebocoran data email.',
        usage: '• `.dns <domain>` — resolve A record via dns.google\n• `.pingweb <domain>` — ukur latency HTTPS GET + status code\n• `.whois <domain>` — registrar, tanggal dibuat/expired, nameserver via rdap.org\n• `.ud <kata>` — definisi teratas Urban Dictionary\n• `.spcheck <email>` — cek kebocoran data email',
        detail: 'Semua lookup memakai API publik gratis: dns.google, rdap.org, api.urbandictionary.com, api.xposedornot.com (breach-analytics; breachedaccount mati), leakcheck.io (fallback).'
    },
    async execute(_client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.trim().match(/^\.(\w+)(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const cmd = (match[1] || '').toLowerCase();
        const commands = ['dns', 'pingweb', 'whois', 'ud', 'spcheck'];
        if (!commands.includes(cmd)) {
            return;
        }
        const arg = (match[2] || '').trim();
        const usage = (text) => message.edit({
            text: `<blockquote>❌ <b>Format salah:</b> ${text}</blockquote>`,
            parseMode: 'html'
        });
        const run = async (loading, fn) => {
            await message.edit({ text: `<blockquote>⏳ ${loading}</blockquote>`, parseMode: 'html' });
            try {
                const out = await fn();
                await message.edit({ text: out, parseMode: 'html', linkPreview: false });
            }
            catch (err) {
                Logger.logUser(telegramId, `Error in webtools plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                const detail = err instanceof Error ? err.message : String(err);
                let text = detail;
                if (err instanceof Error && err.name === 'AbortError') {
                    text = 'Timeout: tidak ada respons dari server';
                }
                else if (/ENOTFOUND|EAI_AGAIN/.test(detail)) {
                    text = 'Domain tidak dapat diresolve (DNS gagal)';
                }
                else if (/ECONNREFUSED/.test(detail)) {
                    text = 'Koneksi ditolak server';
                }
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal:</b> ${escapeHtml(text)}</blockquote>`,
                    parseMode: 'html',
                    linkPreview: false
                });
            }
        };
        if (cmd === 'dns') {
            const host = normalizeHost(arg);
            if (!arg || !DOMAIN_RE.test(host)) {
                await usage('<code>.dns &lt;domain&gt;</code>\nContoh: <code>.dns example.com</code>');
                return;
            }
            await run(`Mengresolve <code>${escapeHtml(host)}</code>...`, () => buildDns(host));
            return;
        }
        if (cmd === 'pingweb') {
            const host = normalizeHost(arg);
            if (!arg || !DOMAIN_RE.test(host)) {
                await usage('<code>.pingweb &lt;domain&gt;</code>\nContoh: <code>.pingweb google.com</code>');
                return;
            }
            await run(`Memeriksa <code>https://${escapeHtml(host)}</code>...`, () => buildPing(host));
            return;
        }
        if (cmd === 'whois') {
            const host = normalizeHost(arg);
            if (!arg || !DOMAIN_RE.test(host)) {
                await usage('<code>.whois &lt;domain&gt;</code>\nContoh: <code>.whois example.com</code>');
                return;
            }
            await run(`Mengambil WHOIS <code>${escapeHtml(host)}</code>...`, () => buildWhois(host));
            return;
        }
        if (cmd === 'ud') {
            const term = arg.replace(/^["']|["']$/g, '').trim();
            if (!term) {
                await usage('<code>.ud &lt;kata&gt;</code>\nContoh: <code>.ud yeet</code>');
                return;
            }
            await run(`Mencari "<b>${escapeHtml(clamp(term, 60))}</b>" di Urban Dictionary...`, () => buildUd(term));
            return;
        }
        if (cmd === 'spcheck') {
            const email = arg.replace(/^mailto:/i, '').trim();
            if (!email || !EMAIL_RE.test(email)) {
                await usage('<code>.spcheck &lt;email&gt;</code>\nContoh: <code>.spcheck user@example.com</code>');
                return;
            }
            await run(`Mengecek breach untuk <code>${escapeHtml(email)}</code>...`, () => buildSpcheck(email));
        }
    }
};
