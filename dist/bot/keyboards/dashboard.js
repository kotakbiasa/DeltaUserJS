// @ts-nocheck
/**
 * DeltaUbotJS — Dashboard (UI builders + rich handlers)
 *
 * Gabungan dari modul UI (panel/keyboard) dan handler dashboard "rich".
 * Sebelumnya terpisah di richUi.js + richHandlers.js; disatukan di sini
 * karena keduanya saling terikat & dipakai oleh Master Bot.
 */
import { Api } from 'teleproto';
import config from '../../config.js';
import { replyRich } from '../../utils/richMessage.js';
import { getUserbotSession, getAllRegisteredUsers, getDisabledPlugins, updateUserbotStatus, disablePlugin, enablePlugin, deleteUserbot, updateUserbotFeature, hasClaimedTrial, setTrialClaimed, } from '../../infrastructure/database.js';
import { loadedPlugins } from '../../userbot/engine/pluginRegistry.js';
import userbotManager from '../../userbot/engine/manager.js';
import { buildHelpMenuRichHtml, helpKeyboard } from '../handlers/core/help.js';
// ==========================================================================
// SECTION 1 — UI BUILDERS (panels & keyboards)  [ex richUi.js]
// ==========================================================================
const PROTECTED_PLUGINS = ['admin', 'pluginmanager'];
const PLUGINS_PER_PAGE = 8;
function normalizedDisabled(telegramId) {
    return getDisabledPlugins(telegramId).map(name => String(name).toLowerCase());
}
function sortedPlugins() {
    return [...loadedPlugins].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
export function pluginPageInfo(page = 1) {
    const plugins = sortedPlugins();
    const totalPages = Math.max(1, Math.ceil(plugins.length / PLUGINS_PER_PAGE));
    const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const start = (currentPage - 1) * PLUGINS_PER_PAGE;
    return { plugins: plugins.slice(start, start + PLUGINS_PER_PAGE), page: currentPage, totalPages, total: plugins.length };
}
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function stripHtml(value) {
    return String(value ?? '').replace(/<[^>]+>/g, '');
}
function daysLeftText(dateValue) {
    if (!dateValue)
        return 'Belum tersedia';
    const expDate = new Date(dateValue);
    const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
    return diffDays > 0
        ? `${expDate.toLocaleDateString()} · ${diffDays} hari lagi`
        : `${expDate.toLocaleDateString()} · kedaluwarsa`;
}
function badge(condition, yes = 'Online', no = 'Offline') {
    return condition ? `✓ ${yes}` : `— ${no}`;
}
function escapeMarkdown(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/`/g, '\\`')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
}
export function hero(icon, title, subtitle) {
    return `<h1>${icon} ${escapeHtml(title)}</h1>` +
        `<blockquote>${escapeHtml(subtitle)}</blockquote>`;
}
export function kpi(caption, items) {
    return `<table bordered><caption>${escapeHtml(caption)}</caption><tr>` +
        items.map(([label, value]) => `<td align="center"><b>${escapeHtml(label)}</b><br>${escapeHtml(stripHtml(value))}</td>`).join('') +
        `</tr></table>`;
}
export function table(caption, rows, firstHeader = 'Area', secondHeader = 'Detail') {
    return `<table bordered striped><caption>${escapeHtml(caption)}</caption>` +
        `<tr><th align="center">${escapeHtml(firstHeader)}</th><th align="center">${escapeHtml(secondHeader)}</th></tr>` +
        rows.map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td align="center">${escapeHtml(stripHtml(value))}</td></tr>`).join('') +
        `</table>`;
}
export function note(text, title = 'Catatan') {
    return `<details><summary>${escapeHtml(title)}</summary><p>${escapeHtml(text)}</p></details>`;
}
function pluginStatusTable(caption, plugins, disabledSet) {
    const rows = plugins.map(plugin => {
        const name = String(plugin.name);
        const lower = name.toLowerCase();
        const isActive = !disabledSet.has(lower);
        const isProtected = PROTECTED_PLUGINS.includes(lower);
        return `<tr>` +
            `<td>${escapeHtml(name)}</td>` +
            `<td align="center">${isActive ? 'Aktif' : 'Nonaktif'}</td>` +
            `<td align="center">${isProtected ? 'Protected' : '—'}</td>` +
            `</tr>`;
    }).join('') || '<tr><td colspan="3" align="center">Tidak ada plugin</td></tr>';
    return `<table bordered striped>` +
        `<caption>${escapeHtml(caption)}</caption>` +
        `<tr><th align="left">Plugin</th><th align="center">Status</th><th align="center">Guard</th></tr>` +
        rows +
        `</table>`;
}
export function isOwner(ctx) {
    return Number(ctx.from?.id) === Number(config.ownerId);
}
export function panelMain(ctx) {
    const firstName = ctx.from.first_name || 'User';
    const botName = ctx.me?.first_name || 'Bot';
    return hero('👋', `Halo ${escapeHtml(firstName)}!`, `Saya adalah ${escapeHtml(botName)}, asisten manajemen grup tingkat lanjut yang siap menjaga keamanan dan ketertiban komunitas Anda.`) +
        note('Tekan tombol bantuan di bawah untuk melihat cara menggunakan saya.');
}
export function panelMenuList(ctx) {
    return hero('🎛️', 'Panel Menu', 'Silakan masuk ke ruang kontrol yang sesuai.') +
        note('Akses Admin Command Center hanya terbuka untuk Owner.');
}
export function panelUserbot(ctx) {
    const session = getUserbotSession(ctx.from.id);
    const running = userbotManager.isRunning(ctx.from.id);
    const botName = session?.custom_name || ctx.me?.first_name || 'Bot';
    return `<h1>🤖 Dashboard ${escapeHtml(botName)}</h1>` +
        `<blockquote>Panel kendali cerdas untuk mengatur sesi Userbot Anda. Pantau status koneksi dan fitur aktif secara <i>real-time</i>.</blockquote>` +
        kpi('Status Integrasi', [
            ['Koneksi', badge(running, 'Online', 'Offline')],
            ['Anti-PM', badge(session?.anti_pm === 1, 'ON', 'OFF')],
            ['AFK', badge(session?.auto_reply === 1, 'ON', 'OFF')],
        ]) +
        table('Informasi Sesi', [
            ['ID Akun', `<code>${ctx.from.id}</code>`],
            ['Telepon', session?.phone ? `+${session.phone}` : 'Disembunyikan'],
            ['Masa Aktif', daysLeftText(session?.expired_at)],
        ]) +
        `<details><summary>🛡️ Tips Keamanan</summary><p>Halaman ini terenkripsi. Jangan pernah membagikan <i>screenshot</i> area ini kepada pihak mana pun untuk mencegah pencurian sesi Telegram Anda.</p></details>`;
}
export function panelPlugins(ctx, page = 1, notice = '') {
    const disabled = normalizedDisabled(ctx.from.id);
    const disabledSet = new Set(disabled);
    const { plugins, page: currentPage, totalPages, total } = pluginPageInfo(page);
    const active = sortedPlugins().filter(p => !disabledSet.has(String(p.name).toLowerCase())).length;
    return hero('🧩', 'Plugin Studio', notice || 'Kelola modul bot langsung dari dashboard utama.') +
        kpi('Plugin State', [
            ['Total', total],
            ['Aktif', active],
            ['Nonaktif', Math.max(0, total - active)],
        ]) +
        pluginStatusTable(`Plugin List · Page ${currentPage}/${totalPages}`, plugins, disabledSet) +
        note('Tabel daftar plugin. Tekan tombol di bawah untuk menyalakan/mematikan plugin. Plugin protected tidak bisa dimatikan.');
}
export function panelSettings(ctx) {
    const session = getUserbotSession(ctx.from.id);
    return hero('⚙️', 'Settings Center', 'Pusat preferensi bot dan identitas panel.') +
        kpi('Feature Switch', [
            ['Anti-PM', badge(session?.anti_pm === 1, 'ON', 'OFF')],
            ['AFK', badge(session?.auto_reply === 1, 'ON', 'OFF')],
            ['Session', session ? '✅ Ada' : '🔴 Tidak ada'],
        ]) +
        table('Identity', [
            ['Inline Bot', session?.inline_bot_username ? `@${session.inline_bot_username}` : 'Belum diset'],
            ['Danger Zone', 'Hapus sesi permanen'],
        ]);
}
export function panelRegister(ctx) {
    return hero('🚀', 'Metode Login', `Halo, ${ctx.from.first_name || 'User'}. Pilih metode login yang paling nyaman.`) +
        kpi('Login Options', [
            ['OTP', 'Nomor HP'],
            ['QR', 'Scan Device'],
            ['Security', 'Private'],
        ]) +
        table('Perbandingan', [
            ['OTP', 'Kode Telegram via aplikasi/SMS'],
            ['QR', 'Scan dari Telegram > Devices'],
            ['Rekomendasi', 'Gunakan akun milik sendiri'],
        ]) +
        note('Jangan bagikan OTP, password 2FA, atau session string kepada siapa pun.', 'Keamanan');
}
export function panelSubscription(ctx) {
    return hero('💎', 'Pilih Paket Langganan', `Halo, ${ctx.from.first_name || 'User'}. Dapatkan akses penuh ke fitur premium.`) +
        table('Paket Tersedia', [
            ['🎁 Coba Gratis', '7 Hari (1x klaim per akun)'],
            ['💎 Premium', '30 Hari - Coming Soon'],
        ]) +
        note('Pilih Coba Gratis untuk langsung membuat bot Anda hari ini juga.');
}
export function panelAccessDenied(ctx) {
    return hero('🔒', 'Akses Belum Dibuka', 'Registrasi bot membutuhkan persetujuan owner.') +
        table('Status Registrasi', [
            ['Akun', ctx.from.id],
            ['Status', 'Menunggu approval'],
            ['Langkah', 'Ajukan permintaan ke owner'],
        ]);
}
export function panelAdmin(ctx) {
    const users = getAllRegisteredUsers();
    return hero('👑', 'Admin Command Center', 'Panel owner untuk operasi server, bot, dan maintenance.') +
        kpi('Server Snapshot', [
            ['Bot', users.length],
            ['Running', userbotManager.clients.size],
            ['Plugins', loadedPlugins.length],
        ]) +
        table('Owner Tools', [
            ['User Directory', 'Manajemen akun terdaftar'],
            ['Health', 'Runtime & database status'],
            ['Backup', 'Export data dan maintenance'],
        ]) +
        note('Aksi admin dapat memengaruhi semua userbot. Gunakan dengan hati-hati.');
}
export function panelStats(ctx) {
    const users = getAllRegisteredUsers();
    return hero('📊', 'System Analytics', `Ringkasan performa layanan ${ctx.me?.first_name || 'Bot'}.`) +
        kpi('Metrics', [
            ['Bot', users.length],
            ['Running', userbotManager.clients.size],
            ['Uptime', `${Math.round(process.uptime() / 60)}m`],
        ]) +
        table('Service', [
            ['Plugins', loadedPlugins.length],
            ['Mode', 'Modern Dashboard'],
            ['RAM', 'Disembunyikan'],
        ]);
}
export function panelQuickHelp(ctx) {
    return hero('❓', 'Quick Guide', 'Panduan singkat navigasi dashboard baru.') +
        table('Navigasi', [
            ['Dashboard', 'Kontrol userbot pribadi'],
            ['Plugin Studio', 'Ringkasan modul'],
            ['Settings', 'Preferensi & identitas'],
            ['Health', 'Cek layanan server'],
        ]) +
        note('Jika pesan lama masih terlihat, kirim /menu baru agar bot memperbarui tampilan panel utama.');
}
export function panelDonate(ctx) {
    return hero('💰', 'Support Project', 'Dukungan membantu pengembangan dan maintenance server.') +
        table('Channel Donasi', [
            ['e-Wallet', '0821-xxxx-xxxx'],
            ['Transfer Bank', '883xxxxxxx'],
            ['Status', 'Opsional'],
        ]);
}
export function panelHealth(mongoStatus = 'Unknown') {
    const users = getAllRegisteredUsers();
    const rows = users.slice(0, 10).map(user => {
        const running = userbotManager.isRunning(user.telegram_id) ? '🟢 Running' : '🔴 Stopped';
        return `<tr><td>${escapeHtml(user.telegram_id)}</td><td align="center">${running}</td><td align="center">${user.is_active === 1 ? 'active' : 'inactive'}</td></tr>`;
    }).join('') || '<tr><td colspan="3" align="center">Belum ada userbot terdaftar</td></tr>';
    return hero('🩺', 'Server Health', 'Status runtime, database, dan userbot aktif.') +
        kpi('Core Status', [
            ['MongoDB', mongoStatus],
            ['Running', userbotManager.clients.size],
            ['Uptime', `${Math.round(process.uptime() / 60)}m`],
        ]) +
        table('Runtime', [
            ['Node', process.version],
            ['Platform', `${process.platform} ${process.arch}`],
            ['Plugins', loadedPlugins.length],
        ]) +
        `<details><summary>Userbot Snapshot</summary>` +
        `<table bordered striped>` +
        `<tr><th align="center">ID</th><th align="center">Koneksi</th><th align="center">Status</th></tr>` +
        rows +
        `</table>` +
        `</details>`;
}
export function keyboardMain(ctx) {
    const botUsername = ctx.me?.username || 'Bot';
    const botName = ctx.me?.first_name || 'Bot';
    const rows = [
        [{ text: `➕ Tambahkan ${botName} ke Grup Anda ➕`, url: `https://t.me/${botUsername}?startgroup=true` }],
        [
            { text: '📚 Help', callback_data: 'rich:help_main' },
            { text: '⚙️ Pengaturan Grup', callback_data: 'rich:group_settings' },
        ],
        [{ text: '🤖 Userbot', callback_data: 'rich:panel_menu', style: 'primary' }],
        [{ text: '💰 Donasi', callback_data: 'rich:donate' }]
    ];
    return { inline_keyboard: rows };
}
export function keyboardPanelMenu(ctx) {
    const session = getUserbotSession(ctx.from.id);
    const rows = [];
    if (session) {
        rows.push([{ text: '🤖 Panel Userbot', callback_data: 'rich:ubot' }]);
    }
    else {
        rows.push([{ text: '🚀 Register Panel', callback_data: 'rich:subscription' }]);
    }
    if (isOwner(ctx)) {
        rows.push([{ text: '👑 Panel Admin', callback_data: 'rich:admin', style: 'danger' }]);
    }
    rows.push([{ text: '🔙 Dashboard Utama', callback_data: 'rich:main' }]);
    return { inline_keyboard: rows };
}
export function keyboardUserbot(ctx) {
    const isRunning = userbotManager.isRunning(ctx.from.id);
    return { inline_keyboard: [
            [{ text: isRunning ? '🔌 Matikan Bot' : '⚡ Hidupkan Bot', callback_data: 'rich:toggle_power' }],
            [{ text: '🧩 Plugin Studio', callback_data: 'rich:plugin_page:1' }, { text: '⚙️ Settings', callback_data: 'rich:settings' }],
            [{ text: '📚 Help', callback_data: 'rich:help_ubot' }],
            [{ text: '🔙 Dashboard Utama', callback_data: 'rich:main' }],
        ] };
}
export function keyboardPluginStudio(ctx, page = 1) {
    const disabled = normalizedDisabled(ctx.from.id);
    const disabledSet = new Set(disabled);
    const { plugins, page: currentPage, totalPages } = pluginPageInfo(page);
    const rows = plugins.map(plugin => {
        const name = String(plugin.name);
        const lower = name.toLowerCase();
        const isDisabled = disabledSet.has(lower);
        const protectedPlugin = PROTECTED_PLUGINS.includes(lower);
        const action = isDisabled ? 'Aktifkan' : 'Nonaktifkan';
        const label = protectedPlugin ? `${name} · protected` : `${action} ${name}`;
        return [{ text: label, callback_data: `rich:plugin_toggle:${encodeURIComponent(lower)}:${currentPage}` }];
    });
    const nav = [];
    if (currentPage > 1)
        nav.push({ text: '⬅️ Prev', callback_data: `rich:plugin_page:${currentPage - 1}` });
    nav.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: `rich:plugin_page:${currentPage}` });
    if (currentPage < totalPages)
        nav.push({ text: 'Next ➡️', callback_data: `rich:plugin_page:${currentPage + 1}` });
    rows.push(nav);
    rows.push([{ text: '🔙 Dashboard Bot', callback_data: 'rich:ubot' }]);
    return { inline_keyboard: rows };
}
export function keyboardSettings(ctx) {
    const session = getUserbotSession(ctx.from.id);
    const isAntiPm = session?.anti_pm === 1;
    const isAfk = session?.auto_reply === 1;
    return { inline_keyboard: [
            [{ text: isAntiPm ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF', callback_data: 'rich:toggle_anti_pm' }],
            [{ text: isAfk ? '🤖 Auto-Reply (AFK): 🟢 ON' : '🤖 Auto-Reply (AFK): 🔴 OFF', callback_data: 'rich:toggle_afk' }],
            [{ text: '📝 Ubah Pesan AFK', callback_data: 'rich:edit_afk' }, { text: '⚙️ Vars Config', callback_data: 'rich:edit_vars' }],
            [{ text: '⚠️ Danger Zone: Hapus Sesi', callback_data: 'rich:danger_delete_session' }],
            [{ text: '🔙 Kembali', callback_data: 'rich:ubot' }],
        ] };
}
export function keyboardDangerDelete() {
    return { inline_keyboard: [
            [{ text: '🗑️ Ya, Hapus Sesi Ini', callback_data: 'rich:confirm_delete_session' }],
            [{ text: '❌ Batal', callback_data: 'rich:settings' }],
        ] };
}
export function keyboardRegister() {
    return { inline_keyboard: [
            [{ text: '📱 Login via OTP', callback_data: 'rich:otp', style: 'success' }, { text: '🔍 Scan QR', callback_data: 'rich:qr', style: 'success' }],
            [{ text: '🔙 Kembali', callback_data: 'rich:subscription' }],
        ] };
}
export function keyboardSubscription() {
    return { inline_keyboard: [
            [{ text: '🎁 Coba Gratis (7 Hari)', callback_data: 'rich:claim_trial', style: 'success' }],
            [{ text: '💎 Beli Premium (Coming Soon)', callback_data: 'rich:buy_premium' }],
            [{ text: '🔙 Dashboard', callback_data: 'rich:main' }],
        ] };
}
export function keyboardAdmin() {
    return { inline_keyboard: [
            [{ text: '👥 User Directory', callback_data: 'rich:admin_users' }],
            [{ text: '📢 Broadcast', callback_data: 'rich:broadcast' }, { text: '🩺 Health', callback_data: 'rich:health' }],
            [{ text: '⚙️ System Vars', callback_data: 'rich:edit_system_vars' }, { text: '📦 Backup', callback_data: 'rich:backup' }],
            [{ text: '🔙 Dashboard', callback_data: 'rich:main' }],
        ] };
}
export function keyboardBack(target = 'main') {
    return { inline_keyboard: [[{ text: '🔙 Back', callback_data: `rich:${target}` }]] };
}
// ==========================================================================
// SECTION 2 — DASHBOARD HANDLERS  [ex richHandlers.js]
// ==========================================================================
function styleForButtonText(text = '') {
    const label = String(text).trim();
    if (label.includes('Mulai') || label.includes('Login'))
        return 'success';
    if (label.includes('Dashboard') || label.includes('Command Center'))
        return 'primary';
    if (label.includes('Hapus') || label.includes('Cancel') || label.includes('Danger'))
        return 'danger';
    return undefined;
}
export function applyButtonStylesToPayload(payload) {
    const keyboard = payload?.reply_markup?.inline_keyboard;
    if (!Array.isArray(keyboard))
        return;
    for (const row of keyboard) {
        if (!Array.isArray(row))
            continue;
        for (const button of row) {
            if (!button?.style) {
                const style = styleForButtonText(button?.text);
                if (style)
                    button.style = style;
            }
        }
    }
}
async function mongoStatusLabel() {
    try {
        const mongoose = await import('mongoose');
        return mongoose.default.connection.readyState === 1
            ? `🟢 Connected (${mongoose.default.connection.name})`
            : `🔴 State ${mongoose.default.connection.readyState}`;
    }
    catch (e) {
        return '🔴 Disconnected';
    }
}
async function sendRich(ctx, rich, reply_markup, { deleteOld = false } = {}) {
    if (ctx.inlineMessageId) {
        if (ctx.answerCallbackQuery) {
            await ctx.answerCallbackQuery({ text: '⚠️ Silakan akses menu ini melalui Private Chat (DM) bot.', show_alert: true }).catch(() => { });
        }
        return;
    }
    const rich_message = typeof rich === 'string' ? { html: rich } : rich;
    try {
        await ctx.replyWithRichMessage(rich_message, { reply_markup });
        if (deleteOld) {
            try {
                await ctx.deleteMessage();
            }
            catch (_) { }
        }
    }
    catch (err) {
        console.warn('sendRichMessage failed:', err.message);
        await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Rich message gagal dikirim. Coba update Telegram atau kirim /menu lagi.</blockquote>` });
    }
}
async function openMain(ctx, options = {}) {
    await sendRich(ctx, panelMain(ctx), keyboardMain(ctx), options);
}
async function openHelp(ctx, target = 'main', options = {}) {
    const dbSession = getUserbotSession(ctx.from.id);
    await sendRich(ctx, buildHelpMenuRichHtml(dbSession, 1, target), helpKeyboard(1, target), options);
}
function findPlugin(name) {
    const target = decodeURIComponent(String(name || '')).trim().toLowerCase();
    return loadedPlugins.find(plugin => String(plugin.name).toLowerCase() === target);
}
function pluginNotice(pluginName, enabled) {
    return `${enabled ? 'Plugin diaktifkan' : 'Plugin dinonaktifkan'}: ${pluginName}`;
}
async function openPluginStudio(ctx, page = 1, notice = '', options = {}) {
    await sendRich(ctx, panelPlugins(ctx, page, notice), keyboardPluginStudio(ctx, page), options);
}
export function registerRichHandlers(bot) {
    bot.api.config.use(async (prev, method, payload, signal) => {
        applyButtonStylesToPayload(payload);
        if (Array.isArray(payload?.results)) {
            for (const result of payload.results)
                applyButtonStylesToPayload(result);
        }
        return prev(method, payload, signal);
    });
    bot.command('help', async (ctx) => {
        if (ctx.chat.type !== 'private')
            return;
        await openHelp(ctx, 'main');
    });
    bot.command(['start', 'menu'], async (ctx) => {
        if (ctx.chat.type !== 'private') {
            await replyRich(ctx, `🤖 <b>${ctx.me.first_name} Aktif!</b>\n\nSilakan kirim pesan secara privat (PM) kepada saya untuk mengelola Bot Anda.`, {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Buka Private Chat', url: `https://t.me/${ctx.me.username}?start=true` }]]
                }
            });
            return;
        }
        await openMain(ctx);
    });
    bot.command('health', async (ctx) => {
        if (!isOwner(ctx))
            return;
        await sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'));
    });
    bot.command('revoke', async (ctx) => {
        const telegramId = ctx.from.id;
        const session = getUserbotSession(telegramId);
        if (!session) {
            return ctx.reply('❌ Anda belum memiliki sesi bot yang aktif di sistem.');
        }
        await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Memproses penghapusan sesi dan logout dari Telegram...</blockquote>` });
        // Attempt remote logout
        try {
            const ubot = userbotManager.clients.get(telegramId);
            if (ubot && ubot.client) {
                await ubot.client.call({ _: 'auth.logOut' });
            }
        }
        catch (e) {
            console.log(`Failed to logout remotely for ${telegramId}:`, e.message);
        }
        // Stop bot locally
        await userbotManager.stopUserbot(telegramId);
        // Delete from database
        deleteUserbot(telegramId);
        await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br>Sesi Anda telah berhasil dihapus sepenuhnya (Revoked).\n\nKetik /daftar kembali jika ingin mendaftar ulang.</blockquote>` });
    });
    bot.callbackQuery(/^rich:(.+)$/, async (ctx) => {
        const action = ctx.match[1];
        try {
            await ctx.answerCallbackQuery();
        }
        catch (_) { }
        if (action === 'main')
            return openMain(ctx, { deleteOld: true });
        if (action === 'panel_menu')
            return sendRich(ctx, panelMenuList(ctx), keyboardPanelMenu(ctx), { deleteOld: true });
        if (action === 'ubot') {
            try {
                const thinking = await ctx.replyWithRichMessage({ html: `<blockquote>⏳ Mengambil data sensor Userbot...</blockquote>` });
                await sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
                if (thinking && thinking.message_id) {
                    await ctx.api.deleteMessage(ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id, thinking.message_id).catch(() => { });
                }
            }
            catch (err) {
                console.warn('Thinking error:', err.message);
                await sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
            }
            return;
        }
        if (action === 'toggle_power') {
            const telegramId = ctx.from.id;
            const session = getUserbotSession(telegramId);
            if (!session)
                return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
            const isRunning = userbotManager.isRunning(telegramId);
            if (isRunning) {
                await ctx.answerCallbackQuery('Mematikan Bot...');
                await userbotManager.stopUserbot(telegramId);
                updateUserbotStatus(telegramId, false); // Optional: if status is tracked
            }
            else {
                await ctx.answerCallbackQuery('Menghidupkan Bot...');
                try {
                    await userbotManager.startUserbot(telegramId, session.session_string);
                    updateUserbotStatus(telegramId, true);
                }
                catch (err) {
                    return ctx.reply(`❌ Gagal menghidupkan Bot: ${err.message}`);
                }
            }
            return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
        }
        if (action === 'plugins')
            return openPluginStudio(ctx, 1, '', { deleteOld: true });
        if (action.startsWith('plugin_page:')) {
            const page = Number(action.split(':')[1] || 1);
            return openPluginStudio(ctx, page, '', { deleteOld: true });
        }
        if (action.startsWith('plugin_toggle:')) {
            const [, rawName, rawPage] = action.split(':');
            const page = Number(rawPage || 1);
            const plugin = findPlugin(rawName);
            if (!plugin) {
                return openPluginStudio(ctx, page, 'Plugin tidak ditemukan.', { deleteOld: true });
            }
            const pluginName = String(plugin.name);
            const lower = pluginName.toLowerCase();
            const protectedPlugins = ['admin', 'pluginmanager'];
            const disabled = getDisabledPlugins(ctx.from.id).map(name => String(name).toLowerCase());
            const isDisabled = disabled.includes(lower);
            if (!isDisabled && protectedPlugins.includes(lower)) {
                return openPluginStudio(ctx, page, `Plugin protected tidak bisa dimatikan: ${pluginName}`, { deleteOld: true });
            }
            if (isDisabled) {
                await enablePlugin(ctx.from.id, pluginName);
                return openPluginStudio(ctx, page, pluginNotice(pluginName, true), { deleteOld: true });
            }
            await disablePlugin(ctx.from.id, pluginName);
            return openPluginStudio(ctx, page, pluginNotice(pluginName, false), { deleteOld: true });
        }
        if (action === 'settings')
            return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
        if (action === 'toggle_anti_pm') {
            const session = getUserbotSession(ctx.from.id);
            if (!session)
                return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
            const newStatus = session.anti_pm === 1 ? 0 : 1;
            updateUserbotFeature(ctx.from.id, 'anti_pm', newStatus);
            await ctx.answerCallbackQuery(`Anti-PM diubah menjadi ${newStatus === 1 ? 'ON' : 'OFF'}`);
            return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
        }
        if (action === 'toggle_afk') {
            const session = getUserbotSession(ctx.from.id);
            if (!session)
                return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
            const newStatus = session.auto_reply === 1 ? 0 : 1;
            updateUserbotFeature(ctx.from.id, 'auto_reply', newStatus);
            await ctx.answerCallbackQuery(`Auto-Reply (AFK) diubah menjadi ${newStatus === 1 ? 'ON' : 'OFF'}`);
            return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
        }
        if (action === 'edit_afk') {
            await ctx.answerCallbackQuery();
            return ctx.conversation.enter('afk-reason-conv');
        }
        if (action === 'edit_vars') {
            await ctx.answerCallbackQuery();
            return ctx.conversation.enter('manage-vars-conv');
        }
        if (action === 'danger_delete_session') {
            await ctx.answerCallbackQuery();
            const text = `🔺 <b>D E L T A   B O T</b> 🔺\n────────────────────────\n⚠️ <b>KONFIRMASI PENGHAPUSAN SESI</b>\n\nTindakan ini akan mematikan bot dan menghapus session string dari database.\n\nJika hanya ingin berhenti sementara, gunakan tombol <b>Matikan Bot</b>, bukan hapus sesi.`;
            return sendRich(ctx, text, keyboardDangerDelete(), { deleteOld: true });
        }
        if (action === 'confirm_delete_session') {
            await ctx.answerCallbackQuery('Menghapus sesi...');
            const telegramId = ctx.from.id;
            try {
                const ubot = userbotManager.clients.get(telegramId);
                if (ubot && ubot.client) {
                    await ubot.client.invoke(new Api.auth.LogOut());
                }
            }
            catch (e) {
                console.log(`Failed to logout remotely for ${telegramId}:`, e.message);
            }
            if (userbotManager.isRunning(telegramId)) {
                await userbotManager.stopUserbot(telegramId);
            }
            deleteUserbot(telegramId);
            await ctx.replyWithRichMessage({ html: `<blockquote>🗑️ <b>Sesi berhasil dihapus secara permanen dari server Telegram dan database.</b></blockquote>` });
            return openMain(ctx, { deleteOld: true });
        }
        if (action === 'subscription')
            return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(), { deleteOld: true });
        if (action === 'register')
            return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { deleteOld: true });
        if (action === 'claim_trial') {
            await ctx.answerCallbackQuery();
            const claimed = hasClaimedTrial(ctx.from.id);
            if (claimed) {
                return ctx.reply('❌ Anda sudah pernah menggunakan batas percobaan gratis (Trial 7 Hari). Silakan tunggu hingga paket Premium dirilis untuk memperpanjang sesi Anda.');
            }
            setTrialClaimed(ctx.from.id);
            return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { deleteOld: true });
        }
        if (action === 'buy_premium') {
            return ctx.answerCallbackQuery({
                text: '⏳ Fitur ini masih dalam tahap pengembangan (Coming Soon).',
                show_alert: true
            });
        }
        if (action === 'stats')
            return sendRich(ctx, panelStats(ctx), keyboardBack('main'), { deleteOld: true });
        if (action === 'guide')
            return sendRich(ctx, panelQuickHelp(ctx), keyboardBack('main'), { deleteOld: true });
        if (action === 'donate')
            return sendRich(ctx, panelDonate(ctx), keyboardBack('main'), { deleteOld: true });
        if (action === 'help' || action === 'help_main')
            return openHelp(ctx, 'main', { deleteOld: true });
        if (action === 'help_ubot')
            return openHelp(ctx, 'ubot', { deleteOld: true });
        if (action === 'admin') {
            if (!isOwner(ctx))
                return;
            return sendRich(ctx, panelAdmin(ctx), keyboardAdmin(), { deleteOld: true });
        }
        if (action === 'health') {
            if (!isOwner(ctx))
                return;
            return sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'), { deleteOld: true });
        }
        if (action === 'edit_system_vars') {
            if (!isOwner(ctx))
                return;
            await ctx.answerCallbackQuery();
            return ctx.conversation.enter('manage-system-vars-conv');
        }
        if (action === 'admin_users') {
            if (!isOwner(ctx))
                return;
            const users = getAllRegisteredUsers();
            const rows = users.slice(0, 10).map(u => `${u.telegram_id} · ${u.is_active === 1 ? 'active' : 'inactive'}`).join('\n') || 'Belum ada user.';
            return ctx.reply(`👥 User Directory\n\n${rows}`);
        }
        if (action === 'backup') {
            if (!isOwner(ctx))
                return;
            return ctx.reply('Gunakan command owner:\n/backup — backup database\n/stats_db — statistik database');
        }
        if (action === 'broadcast') {
            if (!isOwner(ctx))
                return;
            return ctx.conversation.enter('admin-broadcast-conv');
        }
        if (action === 'otp')
            return ctx.conversation.enter('otp-reg');
        if (action === 'qr')
            return ctx.conversation.enter('qr-reg');
    });
}
export async function sendAccessDeniedRich(ctx) {
    await sendRich(ctx, panelAccessDenied(ctx), keyboardBack('main'), { deleteOld: true });
}
