import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import config from '../../../config.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// Snapshot terakhir (di-set tiap scan) & baseline (hanya lewat .modcheck save).
// Disimpan di globalThis — sengaja in-memory, hilang saat restart.
const SNAPSHOT_KEY = '__MODCHECK_SNAPSHOT__';
const BASELINE_KEY = '__MODCHECK_BASELINE__';
const MAX_JSON_CHARS = 3000;
const MAX_LIST_LINES = 15;
// Heuristik soft-findings ala scanner Kitsune (bukan vonis — bisa false positive):
// pola yang umum dipakai modul jahat untuk eksekusi proses / impor kode remote / backdoor.
const SUSPICIOUS_PATTERNS = [
    { tag: 'child_process', re: /['"](node:)?child_process['"]/ },
    { tag: 'eval', re: /\beval\s*\(/ },
    { tag: 'new-Function', re: /\bnew\s+Function\s*\(/ },
    { tag: 'exec-spawn', re: /\b(execSync|spawnSync|spawn)\s*\(/ },
    { tag: 'remote-import', re: /\bimport\s*\(\s*['"]https?:\/\// },
    { tag: 'net-connect', re: /\b(net|dgram|tls)\s*\.\s*connect\s*\(/ },
];
function getFromGlobal(key) {
    const store = globalThis;
    const raw = store[key];
    if (raw && typeof raw === 'object' && raw.files) {
        return raw;
    }
    return null;
}
function setToGlobal(key, snap) {
    globalThis[key] = snap;
}
/** Root scan: dist/userbot/handlers (tempat pluginLoader memuat plugin). */
function resolveScanRoot() {
    const fromCwd = path.join(process.cwd(), 'dist', 'userbot', 'handlers');
    if (existsSync(fromCwd)) {
        return fromCwd;
    }
    // Fallback: relatif terhadap file terkompilasi (dist/userbot/handlers/system → ../..)
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, '..', '..');
}
async function walkJsFiles(dir) {
    const out = [];
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch (_e) {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walkJsFiles(full)));
        }
        else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.d.js')) {
            out.push(full);
        }
    }
    return out;
}
function detectFlags(buf) {
    const text = buf.toString('utf8');
    const flags = [];
    for (const { tag, re } of SUSPICIOUS_PATTERNS) {
        if (re.test(text)) {
            flags.push(tag);
        }
    }
    return flags;
}
async function scanPlugins() {
    const root = resolveScanRoot();
    const fulls = (await walkJsFiles(root)).sort();
    const files = {};
    for (const full of fulls) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const buf = await readFile(full);
        const flags = detectFlags(buf);
        files[rel] = {
            size: buf.length,
            md5: createHash('md5').update(buf).digest('hex'),
            ...(flags.length ? { flags } : {}),
        };
    }
    return { savedAt: new Date().toISOString(), root, files };
}
function diffAgainstBaseline(current, baseline) {
    const rows = [];
    for (const rel of Object.keys(current.files).sort()) {
        const cur = current.files[rel];
        const base = baseline.files[rel];
        if (!base) {
            rows.push({ path: rel, status: 'BARU', size: cur.size, md5: cur.md5 });
        }
        else if (base.md5 !== cur.md5) {
            rows.push({ path: rel, status: 'DIUBAH', size: cur.size, md5: cur.md5, oldMd5: base.md5 });
        }
    }
    for (const rel of Object.keys(baseline.files).sort()) {
        if (!current.files[rel]) {
            const base = baseline.files[rel];
            rows.push({ path: rel, status: 'DIHAPUS', size: base.size, md5: base.md5 });
        }
    }
    return rows;
}
function formatSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function renderJson(payload) {
    let json = JSON.stringify(payload, null, 1);
    if (json.length > MAX_JSON_CHARS) {
        const kept = payload.files.slice(0, 10);
        const hidden = Math.max(0, payload.files.length - kept.length);
        json = JSON.stringify({
            files: kept,
            summary: `${payload.summary} (JSON terpotong — ${hidden} entri tidak ditampilkan)`,
        }, null, 1);
    }
    if (json.length > MAX_JSON_CHARS) {
        json = JSON.stringify(payload, null, 0);
    }
    if (json.length > MAX_JSON_CHARS) {
        json = `${json.slice(0, MAX_JSON_CHARS)}…`;
    }
    return json;
}
function jsonSection(payload) {
    return `📄 <b>Output JSON:</b>\n<pre><code>${escapeHtml(renderJson(payload))}</code></pre>`;
}
function relRoot(root) {
    const rel = path.relative(process.cwd(), root);
    return rel && !rel.startsWith('..') ? rel : root;
}
const STATUS_EMOJI = {
    'BARU': '🟢',
    'DIHAPUS': '🔴',
    'DIUBAH': '🟡',
};
export default {
    name: 'modcheck',
    version: '1.0.0',
    description: 'Security scanner file plugin (md5 + baseline + diff). Khusus Owner.',
    help: {
        title: 'Security Scan (.modcheck)',
        description: 'Memindai file plugin dist/userbot/handlers/**/*.js sebelum di-load: ukuran + hash MD5, simpan baseline, dan diff untuk mendeteksi modul curiga yang di-drop hot.',
        usage: '• `.modcheck` — scan & snapshot\n• `.modcheck save` — set baseline\n• `.modcheck diff` — bandingkan vs baseline',
        detail: 'Snapshot & baseline disimpan di memori proses (globalThis) dan hilang saat userbot restart — jalankan ulang `.modcheck save` setelah restart. File dengan pola mencurigakan (child_process, eval, spawn, impor remote) ditandai sebagai soft findings, bukan vonis.'
    },
    onLoad: () => {
        Logger.logSystem('🛡️ Plugin ModCheck loaded — security scanner aktif (.modcheck | .modcheck save | .modcheck diff)', 'INFO');
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out) {
            return;
        }
        if (Number(telegramId) !== Number(config.ownerId)) {
            return;
        }
        const text = message.message || '';
        const match = text.match(/^\.modcheck(?:\s+(\S+))?\s*$/i);
        if (!match) {
            return;
        }
        const arg = (match[1] || '').toLowerCase();
        if (arg && !['save', 'diff'].includes(arg)) {
            await message.edit({
                text: `🛡️ <b>MODCHECK</b>\n<blockquote>❌ Sub-perintah tidak dikenal: <code>${escapeHtml(arg)}</code>\nGunakan: <code>.modcheck</code>, <code>.modcheck save</code>, <code>.modcheck diff</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        try {
            await message.edit({
                text: '🛡️ <b>MODCHECK</b>\n<blockquote>🔎 Memindai file plugin...</blockquote>',
                parseMode: 'html'
            });
            const snap = await scanPlugins();
            setToGlobal(SNAPSHOT_KEY, snap);
            const rels = Object.keys(snap.files).sort();
            const totalSize = rels.reduce((sum, rel) => sum + snap.files[rel].size, 0);
            const flagged = rels.filter(rel => (snap.files[rel].flags || []).length > 0);
            // ── .modcheck save ──
            if (arg === 'save') {
                setToGlobal(BASELINE_KEY, snap);
                const payload = {
                    files: rels.map(rel => ({ path: rel, size: snap.files[rel].size, md5: snap.files[rel].md5 })),
                    summary: `Baseline disimpan: ${rels.length} file, total ${formatSize(totalSize)}, pada ${snap.savedAt}`
                };
                await message.edit({
                    text: `🛡️ <b>MODCHECK — Baseline Disimpan</b>\n` +
                        `<blockquote>✅ <b>${rels.length}</b> file ter-catalog • 💾 <b>${escapeHtml(formatSize(totalSize))}</b>\n` +
                        `🕒 <code>${escapeHtml(snap.savedAt)}</code>\n` +
                        `ℹ️ Baseline hidup di memori proses (globalThis) — hilang saat restart.</blockquote>\n` +
                        jsonSection(payload),
                    parseMode: 'html'
                });
                Logger.logSystem(`🛡️ ModCheck baseline disimpan: ${rels.length} file (${formatSize(totalSize)})`, 'INFO');
                return;
            }
            // ── .modcheck diff ──
            if (arg === 'diff') {
                const baseline = getFromGlobal(BASELINE_KEY);
                if (!baseline) {
                    await message.edit({
                        text: `🛡️ <b>MODCHECK — Diff</b>\n<blockquote>❌ Baseline belum ada.\nJalankan <code>.modcheck save</code> dulu untuk mengunci kondisi saat ini.</blockquote>`,
                        parseMode: 'html'
                    });
                    return;
                }
                const rows = diffAgainstBaseline(snap, baseline);
                const added = rows.filter(r => r.status === 'BARU');
                const removed = rows.filter(r => r.status === 'DIHAPUS');
                const changed = rows.filter(r => r.status === 'DIUBAH');
                const clean = rows.length === 0;
                let list = '';
                for (const row of rows.slice(0, MAX_LIST_LINES)) {
                    const extra = row.oldMd5 ? ` (was <code>${escapeHtml(row.oldMd5.slice(0, 8))}</code>)` : '';
                    list += `${STATUS_EMOJI[row.status]} <code>${escapeHtml(row.path)}</code> — ${escapeHtml(formatSize(row.size))} — <code>${escapeHtml(row.md5.slice(0, 8))}</code>${extra}\n`;
                }
                if (rows.length > MAX_LIST_LINES) {
                    list += `… +${rows.length - MAX_LIST_LINES} perubahan lainnya (lihat JSON)\n`;
                }
                const summary = clean
                    ? `${rels.length} file identik dengan baseline (${baseline.savedAt}) — tidak ada perubahan`
                    : `BARU=${added.length} DIHAPUS=${removed.length} DIUBAH=${changed.length} vs baseline ${baseline.savedAt}`;
                const payload = {
                    files: rows.map(r => ({ path: r.path, status: r.status, size: r.size, md5: r.md5, ...(r.oldMd5 ? { oldMd5: r.oldMd5 } : {}) })),
                    summary
                };
                const header = `🛡️ <b>MODCHECK — Diff vs Baseline</b>\n` +
                    `<blockquote>${clean ? '✅ <b>Tidak ada perubahan.</b>' : `🟢 BARU: <b>${added.length}</b> • 🔴 DIHAPUS: <b>${removed.length}</b> • 🟡 DIUBAH: <b>${changed.length}</b>`}\n` +
                    `🧭 Baseline: <code>${escapeHtml(baseline.savedAt)}</code>\n` +
                    `📄 File saat ini: <b>${rels.length}</b></blockquote>\n`;
                const body = clean ? '' : list;
                await message.edit({
                    text: header + body + jsonSection(payload),
                    parseMode: 'html'
                });
                if (!clean) {
                    Logger.logSystem(`🛡️ ModCheck diff: BARU=${added.length} DIHAPUS=${removed.length} DIUBAH=${changed.length}`, 'WARN');
                }
                return;
            }
            // ── .modcheck (scan) ──
            const baseline = getFromGlobal(BASELINE_KEY);
            let flagLines = '';
            for (const rel of flagged.slice(0, MAX_LIST_LINES)) {
                flagLines += `⚠️ <code>${escapeHtml(rel)}</code> → <code>${escapeHtml((snap.files[rel].flags || []).join(','))}</code>\n`;
            }
            if (flagged.length > MAX_LIST_LINES) {
                flagLines += `… +${flagged.length - MAX_LIST_LINES} file ber-flag lainnya\n`;
            }
            const payload = {
                files: rels.map(rel => {
                    const entry = snap.files[rel];
                    return { path: rel, size: entry.size, md5: entry.md5, ...(entry.flags ? { flags: entry.flags } : {}) };
                }),
                summary: `Scan ${rels.length} file (total ${formatSize(totalSize)}), ${flagged.length} flagged mencurigakan, baseline ${baseline ? `ada (${baseline.savedAt})` : 'belum disimpan'}`
            };
            await message.edit({
                text: `🛡️ <b>MODCHECK — Plugin Integrity Scan</b>\n` +
                    `<blockquote>📁 <b>Root:</b> <code>${escapeHtml(relRoot(snap.root))}</code>\n` +
                    `📄 <b>File:</b> <b>${rels.length}</b> • 💾 <b>Total:</b> <b>${escapeHtml(formatSize(totalSize))}</b>\n` +
                    `⚠️ <b>Mencurigakan:</b> <b>${flagged.length}</b>\n` +
                    `🧭 <b>Baseline:</b> ${baseline ? `ada (<code>${escapeHtml(baseline.savedAt)}</code>)` : 'belum disimpan — <code>.modcheck save</code>'}\n` +
                    `🕒 <code>${escapeHtml(snap.savedAt)}</code></blockquote>\n` +
                    (flagLines ? `${flagLines}\n` : '') +
                    jsonSection(payload),
                parseMode: 'html'
            });
            if (flagged.length > 0) {
                Logger.logSystem(`🛡️ ModCheck: ${flagged.length} file plugin ber-flag mencurigakan`, 'WARN');
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            Logger.logUser(telegramId, `Error in modcheck plugin: ${msg}`, 'ERROR');
            await message.edit({
                text: `🛡️ <b>MODCHECK</b>\n<blockquote>❌ Gagal: <code>${escapeHtml(msg)}</code></blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
