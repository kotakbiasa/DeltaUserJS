import { Api } from 'teleproto';
import bigInt from 'big-integer';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// ============================================================
// SESSIONS — manajemen sesi aktif akun Telegram (security).
//   .sessions           : daftar sesi via account.GetAuthorizations
//   .sessions kill <hash>: putus sesi via account.ResetAuthorization
//   .sessionkiller on/off: monitor tiap 60 detik — sesi baru yang
//                          muncul langsung di-reset + notif owner.
// State monitor disimpan di globalThis (Map per telegramId) agar
// timer survive hot-reload, pola sama dengan plugin health.
// Konsep diadaptasi dari Dragon sessionkiller.py + PagerMaid
// sessions.py (riset lintas-repo), ditulis ulang ke pola plugin
// DeltaUserJS — bukan salinan.
// ============================================================
import config from '../../../config.js';
const KILL_INTERVAL_MS = 60 * 1000;
// telegramId -> KillerState (pinned di globalThis, survive hot-reload)
const KILLER_KEY = '__deltauserjs_sessionkiller__';
const globalStore = globalThis;
const killerStore = globalStore[KILLER_KEY] || new Map();
globalStore[KILLER_KEY] = killerStore;
function errText(err) {
    return err instanceof Error ? err.message : String(err);
}
async function fetchAuthorizations(client) {
    const result = await client.invoke(new Api.account.GetAuthorizations());
    const list = (result && Array.isArray(result.authorizations))
        ? result.authorizations
        : [];
    return list;
}
function fmtDate(unix) {
    if (!unix) {
        return '-';
    }
    const d = new Date(unix * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function sessionRow(auth) {
    const device = auth.deviceModel || 'Unknown';
    const app = auth.appName || (auth.officialApp ? 'Official' : 'Unknown');
    const version = auth.appVersion || '?';
    const ip = auth.ip || '?';
    const country = auth.country || '';
    const current = auth.current ? ' <b>[SESI INI]</b>' : '';
    return `🖥 <b>${escapeHtml(device)}</b>${current}\n`
        + `📱 ${escapeHtml(app)} <i>v${escapeHtml(version)}</i> • ${escapeHtml(auth.platform || '?')}\n`
        + `🌐 <code>${escapeHtml(ip)}</code> ${escapeHtml(country)}\n`
        + `🕒 Dibuat: ${escapeHtml(fmtDate(auth.dateCreated))} • Aktif: ${escapeHtml(fmtDate(auth.dateActive))}\n`
        + `#️⃣ <code>${String(auth.hash)}</code>`;
}
function renderList(authorizations) {
    const sorted = [...authorizations].sort((a, b) => Number(b.current ?? false) - Number(a.current ?? false));
    let body = '';
    for (const auth of sorted) {
        body += `${sessionRow(auth)}\n\n`;
    }
    return body;
}
function stopKiller(telegramId) {
    const st = killerStore.get(telegramId);
    if (!st) {
        return false;
    }
    if (st.timer) {
        clearInterval(st.timer);
    }
    killerStore.delete(telegramId);
    return true;
}
async function monitorTick(client, telegramId, st) {
    try {
        const authorizations = await fetchAuthorizations(client);
        const current = new Set(authorizations.map((auth) => String(auth.hash)));
        // Sesuatu hilang sendiri (logout remote / reset manual) — refresh baseline.
        for (const known of [...st.knownHashes]) {
            if (!current.has(known)) {
                st.knownHashes.delete(known);
            }
        }
        const newcomers = authorizations.filter((auth) => !st.knownHashes.has(String(auth.hash)) && !auth.current);
        for (const newcomer of newcomers) {
            st.knownHashes.add(String(newcomer.hash));
        }
        if (newcomers.length === 0) {
            return;
        }
        let killed = 0;
        const details = [];
        for (const auth of newcomers) {
            try {
                await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(Number(auth.hash)) }));
                killed++;
                details.push(`🚫 ${escapeHtml(auth.deviceModel || 'Unknown')} — ${escapeHtml(auth.appName || 'Unknown')} • <code>${escapeHtml(auth.ip || '?')}</code> (${escapeHtml(auth.country || '?')})`);
            }
            catch (err) {
                details.push(`⚠️ ${escapeHtml(auth.deviceModel || 'Unknown')} — gagal reset: ${escapeHtml(errText(err))}`);
            }
        }
        if (killed > 0) {
            st.lastKillAt = Date.now();
        }
        const text = `🚨 <b>SESSIONKILLER</b>\n<blockquote>${newcomers.length} sesi baru terdeteksi & langsung diputus (<b>${killed}</b> berhasil):\n\n${details.join('\n')}\n\nℹ️ Matikan dengan <code>.sessionkiller off</code></blockquote>`;
        await client.sendMessage(config.ownerId, { message: text, parseMode: 'html', linkPreview: false });
        Logger.logSystem(`🚨 SessionKiller: ${newcomers.length} sesi baru, ${killed} direset`, killed > 0 ? 'WARN' : 'INFO');
    }
    catch (err) {
        Logger.logSystem(`SessionKiller tick error: ${errText(err)}`, 'ERROR');
    }
}
function startKiller(client, telegramId) {
    stopKiller(telegramId);
    const st = { knownHashes: new Set() };
    st.startedAt = Date.now();
    // Baseline awal: sesi yang sudah ada TIDAK dianggap penyusup.
    fetchAuthorizations(client).then((authorizations) => {
        for (const auth of authorizations) {
            st.knownHashes.add(String(auth.hash));
        }
    }).catch((_e) => { });
    const timer = setInterval(() => {
        void monitorTick(client, telegramId, st);
    }, KILL_INTERVAL_MS);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    st.timer = timer;
    killerStore.set(telegramId, st);
}
export default {
    name: 'sessions',
    version: '1.0.0',
    description: 'Manajemen sesi aktif akun: daftar, kill by hash, sessionkiller auto-reset. Khusus Owner.',
    help: {
        title: 'Sesi Aktif (.sessions, .sessionkiller)',
        description: 'Lihat semua perangkat yang login ke akun ini, putus sesi asing, dan mode auto-kill sesi baru.',
        usage: '• `.sessions` — daftar sesi aktif (device, app, IP, tanggal, hash)\n• `.sessions kill <hash>` — putus sesi tertentu\n• `.sessionkiller on` — auto-reset sesi baru + notif owner (cek 60 detik)\n• `.sessionkiller off` — matikan auto-kill',
        detail: 'SessionKiller menyimpan baseline hash sesi saat diaktifkan; hanya sesi yang muncul SETELAH itu yang dianggap baru dan langsung di-reset. '
            + 'Sesi berlabel [SESI INI] tidak akan pernah di-reset. State monitor tersimpan di globalThis sehingga bertahan saat plugin hot-reload (hilang saat userbot restart).'
    },
    onLoad: () => {
        Logger.logSystem(`🔐 Plugin Sessions loaded (${killerStore.size} sessionkiller aktif survive hot-reload)`, 'INFO');
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        if (Number(telegramId) !== Number(config.ownerId)) {
            return;
        }
        const text = String(message.message).trim();
        const listMatch = text.match(/^\.sessions$/i);
        const killMatch = text.match(/^\.sessions\s+kill\s+(\d+)$/i);
        const killerMatch = text.match(/^\.sessionkiller\s+(on|off)$/i);
        if (!listMatch && !killMatch && !killerMatch) {
            return;
        }
        try {
            // ---- .sessions ----
            if (listMatch) {
                await message.edit({
                    text: '🔐 <b>MEMUAT SESI AKTIF...</b>',
                    parseMode: 'html',
                });
                const authorizations = await fetchAuthorizations(client);
                await message.edit({
                    text: `🔐 <b>SESI AKTIF (${authorizations.length})</b>\n\n${renderList(authorizations)}`
                        + `<blockquote>💡 Putus sesi asing: <code>.sessions kill &lt;hash&gt;</code>\n🛡️ Auto-kill sesi baru: <code>.sessionkiller on</code></blockquote>`,
                    parseMode: 'html',
                });
                return;
            }
            // ---- .sessions kill <hash> ----
            if (killMatch) {
                const hash = killMatch[1];
                await message.edit({
                    text: `🔐 <b>MEMUTUS SESI</b> <code>${escapeHtml(hash)}</code><b>...</b>`,
                    parseMode: 'html',
                });
                const authorizations = await fetchAuthorizations(client);
                const target = authorizations.find((auth) => String(auth.hash) === hash);
                if (!target) {
                    await message.edit({
                        text: `<blockquote>❌ Hash <code>${escapeHtml(hash)}</code> tidak ditemukan di daftar sesi. Jalankan <code>.sessions</code> untuk melihat hash yang valid.</blockquote>`,
                        parseMode: 'html',
                    });
                    return;
                }
                if (target.current) {
                    await message.edit({
                        text: '<blockquote>❌ Itu sesi ini sendiri — tidak bisa diputus. Logout manual dari Telegram jika memang ingin keluar.</blockquote>',
                        parseMode: 'html',
                    });
                    return;
                }
                try {
                    await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(Number(hash)) }));
                }
                catch (err) {
                    const msg = errText(err);
                    const hint = /FRESH_RESET|24 hour/i.test(msg)
                        ? '\nℹ️ Telegram melarang reset sesi < 24 jam sejak login sesi ini.'
                        : '';
                    await message.edit({
                        text: `<blockquote>❌ Gagal memutus sesi: <i>${escapeHtml(msg)}</i>${hint}</blockquote>`,
                        parseMode: 'html',
                    });
                    return;
                }
                // Sync state killer jika sedang jalan.
                const st = killerStore.get(Number(telegramId));
                if (st) {
                    st.knownHashes.delete(hash);
                }
                await message.edit({
                    text: `✂️ <b>SESI DIPUTUS</b>\n<blockquote>🖥 <b>${escapeHtml(target.deviceModel || 'Unknown')}</b> — ${escapeHtml(target.appName || 'Unknown')}\n🌐 <code>${escapeHtml(target.ip || '?')}</code>\nSesi tersebut sudah logout paksa dari akun ini.</blockquote>`,
                    parseMode: 'html',
                });
                Logger.logSystem(`🔐 Session ${hash} (${target.deviceModel}) diputus manual oleh owner`, 'WARN');
                return;
            }
            // ---- .sessionkiller on|off ----
            const arg = killerMatch ? killerMatch[1].toLowerCase() : '';
            const idNum = Number(telegramId);
            if (arg === 'on') {
                startKiller(client, idNum);
                await message.edit({
                    text: `🛡️ <b>SESSIONKILLER AKTIF</b>\n<blockquote>👀 Pemantauan tiap <b>60 detik</b>\n🚫 Sesi baru yang muncul → langsung di-reset otomatis\n📨 Notif hasil dikirim ke Owner\nℹ️ Sesi yang sudah ada saat ini tidak dianggap penyusup</blockquote>`,
                    parseMode: 'html',
                });
                return;
            }
            const stopped = stopKiller(idNum);
            await message.edit({
                text: stopped ? '🛑 <b>SessionKiller dimatikan.</b>' : 'ℹ️ <b>SessionKiller memang tidak aktif.</b>',
                parseMode: 'html',
            });
            return;
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in sessions plugin: ${errText(err)}`, 'ERROR');
            await message.edit({
                text: `🔐 <b>SESSIONS</b>\n<blockquote>❌ Gagal: <code>${escapeHtml(errText(err))}</code></blockquote>`,
                parseMode: 'html',
            }).catch(() => { });
        }
    }
};
