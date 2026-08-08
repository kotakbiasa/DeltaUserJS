import { InputFile, InlineKeyboard } from 'grammy';
import { replyRich } from '../../utils/richMessage.js';
import { Logger } from '../../utils/logger.js';
import { TelegramClient, Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import qrcode from 'qrcode';
import config from '../../config.js';
import { saveUserbotSession } from '../../infrastructure/database.js';
import userbotManager from '../../userbot/engine/manager.js';
export const cancelKeyboard = new InlineKeyboard().text('❌ Batal', 'cancel');
// ==========================================
// 🔧 Custom Prototype Extension for GramJS
// Resolves client.signIn is not a function
// ==========================================
TelegramClient.prototype.signIn = async function ({ phoneNumber, phoneCodeHash, phoneCode, password }) {
    if (!this.connected) {
        await this.connect();
    }
    if (password) {
        return await this.signInWithPassword({ apiId: this.apiId, apiHash: this.apiHash }, { password: async () => password });
    }
    else {
        const result = await this.invoke(new Api.auth.SignIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode,
        }));
        return result.user;
    }
};
// Global map to track active registration clients
export const activeRegClients = new Map(); // userId -> GramJS TelegramClient
// Global map untuk menyimpan state OTP sementara antar replay Grammy
// Kunci: telegramId, Nilai: { phoneCodeHash, isCodeViaApp }
// Ini mencegah sendCode dipanggil ulang saat Grammy me-resume conversation dari checkpoint,
// yang menyebabkan client baru dibuat dengan server session berbeda → PHONE_CODE_EXPIRED.
const pendingOtpState = new Map();
/**
 * Helper: Buat GramJS client baru dan simpan di activeRegClients
 * Dipanggil DILUAR external() agar client selalu tersedia di runtime.
 */
function getOrCreateClient(telegramId, phoneNumber) {
    let client = activeRegClients.get(telegramId);
    if (client) {
        return client;
    }
    const session = new StringSession('');
    // Preset DC 5 untuk nomor Indonesia
    if (phoneNumber && phoneNumber.startsWith('+62')) {
        session.setDC(5, '91.108.56.121', 80);
    }
    client = new TelegramClient(session, config.apiId, config.apiHash, {
        connectionRetries: 5,
        deviceModel: 'Chrome 147',
        systemVersion: 'Android 11',
        appVersion: '2.2 K',
        langCode: 'id',
        systemLangCode: 'id-ID',
    });
    activeRegClients.set(telegramId, client);
    return client;
}
/**
 * Helper: Pastikan client terhubung
 */
async function ensureConnected(client) {
    if (!client.connected) {
        await client.connect();
    }
}
/**
 * Helper: Bersihkan client dari map dan disconnect
 */
async function cleanupClient(telegramId) {
    const client = activeRegClients.get(telegramId);
    activeRegClients.delete(telegramId);
    pendingOtpState.delete(telegramId);
    if (client) {
        try {
            await client.disconnect();
        }
        catch (_e) { /* ignore: already disconnected */ }
    }
}
/**
 * Helper to wait for either text input or cancellation button
 * Grammy v2: waitFor() dengan array filter query = OR logic.
 * ['message:text', 'callback_query:data'] artinya cocokkan SALAH SATU.
 */
async function waitForInput(conversation, ctx) {
    const result = await conversation.waitFor(['message:text', 'callback_query:data']);
    if (result.callbackQuery?.data === 'cancel_reg') {
        await result.answerCallbackQuery('Pendaftaran dibatalkan.');
        try {
            await result.deleteMessage();
        }
        catch (_e) { /* ignore: already deleted */ }
        await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran dibatalkan.</blockquote>`);
        throw new Error('USER_CANCELLED');
    }
    // Berikan reaksi 👍 pada pesan yang dikirim pengguna sebagai indikasi bot memprosesnya
    try {
        await result.react('👍');
    }
    catch (_e) { /* ignore: reaction may fail */ }
    return result.message.text.trim();
}
/**
 * Conversation handler for OTP Registration
 *
 * Grammy Conversations v2 Key Rules:
 * 1. conversation.external() hanya untuk side-effects; return value HARUS serializable (plain object/string/number)
 * 2. JANGAN simpan/akses non-serializable objects (TelegramClient) di dalam external()
 * 3. Client lifecycle dikelola via global Map di luar external()
 * 4. Gunakan pendingOtpState sebagai idempotency guard agar replay tidak memanggil sendCode ulang
 */
export async function otpRegistrationConversation(conversation, ctx) {
    const telegramId = ctx.from.id;
    try {
        await replyRich(ctx, `<h1>📱 Pendaftaran via OTP</h1>` +
            `<table bordered striped><caption>📋 Langkah</caption>` +
            `<tr><th>#</th><th>Aksi</th></tr>` +
            `<tr><td align="center">1</td><td>Kirim nomor HP (format internasional)</td></tr>` +
            `<tr><td align="center">2</td><td>Masukkan kode OTP yang diterima</td></tr>` +
            `<tr><td align="center">3</td><td>Selesai — userbot aktif 🎉</td></tr>` +
            `</table>` +
            `<blockquote>Silakan kirimkan nomor HP Anda dalam format internasional, contoh: <code>+628123456789</code></blockquote>`, { reply_markup: cancelKeyboard, });
        // Step 1: Wait for phone number
        let phoneNumber;
        try {
            phoneNumber = await waitForInput(conversation, ctx);
        }
        catch (err) {
            if (err.message === 'USER_CANCELLED') {
                return;
            }
            throw err;
        }
        // 🧹 Sanitize Phone Number: Bersihkan spasi, strip, dll. (misal: "+62 812-345" -> "+62812345")
        if (phoneNumber) {
            const cleaned = phoneNumber.replace(/[^0-9]/g, '');
            phoneNumber = (phoneNumber.startsWith('+') ? '+' : '') + cleaned;
        }
        // Validate phone number format (must start with +)
        if (!phoneNumber.startsWith('+')) {
            await replyRich(ctx, `<h1>❌ Format nomor HP salah!</h1><blockquote>Harus diawali dengan kode negara (contoh: <code>+628xxx</code>). Silakan ulangi proses <code>/daftar</code>.</blockquote>`, {});
            return;
        }
        // Step 2+3: Connect + sendCode
        // Gunakan external() HANYA untuk operasi network, return plain data saja.
        // Client dibuat di luar external() via getOrCreateClient().
        let phoneCodeHash;
        let isCodeViaApp = false;
        try {
            const initResult = await conversation.external(async () => {
                // 🔒 Idempotency guard: jika sudah ada pending state dari eksekusi sebelumnya, pakai itu
                const existing = pendingOtpState.get(telegramId);
                if (existing && activeRegClients.has(telegramId)) {
                    Logger.logUser(telegramId, '[OTP] Menggunakan hash yang sudah ada (resume dari checkpoint)', 'INFO');
                    return { phoneCodeHash: existing.phoneCodeHash, isCodeViaApp: existing.isCodeViaApp };
                }
                // Buat client dan connect
                const client = getOrCreateClient(telegramId, phoneNumber);
                await ensureConnected(client);
                Logger.logUser(telegramId, `[OTP] Mengirim kode ke ${phoneNumber}...`, 'INFO');
                const result = await client.sendCode({ apiId: config.apiId, apiHash: config.apiHash }, phoneNumber);
                Logger.logUser(telegramId, `[OTP] Kode terkirim. isCodeViaApp=${result.isCodeViaApp}, hash=${result.phoneCodeHash?.slice(0, 8)}...`, 'INFO');
                // Simpan ke pendingOtpState agar replay tidak membuat client baru
                const state = { phoneCodeHash: result.phoneCodeHash, isCodeViaApp: result.isCodeViaApp };
                pendingOtpState.set(telegramId, state);
                // Return HANYA plain serializable data
                return state;
            });
            phoneCodeHash = initResult.phoneCodeHash;
            isCodeViaApp = initResult.isCodeViaApp;
        }
        catch (err) {
            Logger.logUser(telegramId, `[OTP] Error saat init/sendCode: ${err.message}`, 'ERROR');
            await replyRich(ctx, `❌ <b>Gagal mengirim OTP:</b>\n<blockquote>${err.message}</blockquote>\nSilakan ulangi <code>/daftar</code>.`);
            return;
        }
        // Helper: keyboard OTP
        const buildOtpKeyboard = (showSmsBtn) => {
            const kb = new InlineKeyboard();
            if (showSmsBtn) {
                kb.text('💬 Kirim Ulang via SMS', 'otp_resend_sms').row();
            }
            kb.text('❌ Batalkan Pendaftaran', 'cancel_reg');
            return kb;
        };
        // Helper: tampilkan prompt OTP
        const showOtpPrompt = async (viaApp, isRetry = false) => {
            const prefix = isRetry ? '🔄 <b>Kode baru telah dikirim!</b>\n\n' : '';
            const antiShareTip = '\n\n🛡️ <b>PENTING:</b> Ketik kode dengan <b>spasi</b> antar digit agar tidak diblokir Telegram.\n<i>Contoh: kode <code>12345</code> → ketik <code>1 2 3 4 5</code></i>';
            const info = viaApp
                ? `<table bordered striped><caption>📱 Kode via Aplikasi Telegram</caption>` +
                    `<tr><th>Langkah</th><th>Aksi</th></tr>` +
                    `<tr><td>1</td><td>Buka aplikasi <b>Telegram</b> di HP</td></tr>` +
                    `<tr><td>2</td><td>Cari chat <b>"Telegram"</b> (✓ centang biru)</td></tr>` +
                    `<tr><td>3</td><td>Salin kode 5 digit dari chat tsb</td></tr>` +
                    `</table>` +
                    `<blockquote>⚠️ Kode berlaku <b>2 menit</b>. Jika tidak muncul, klik "Kirim Ulang via SMS".</blockquote>`
                : `<table bordered striped><caption>💬 Kode via SMS</caption>` +
                    `<tr><th>Langkah</th><th>Aksi</th></tr>` +
                    `<tr><td>1</td><td>Cek SMS di nomor <code>${phoneNumber}</code></td></tr>` +
                    `<tr><td>2</td><td>Salin kode 5 digit dari SMS</td></tr>` +
                    `</table>` +
                    `<blockquote>⚠️ Kode berlaku <b>2 menit</b>. Segera masukkan!</blockquote>`;
            await replyRich(ctx, prefix + info + antiShareTip + '\n\nKirimkan kode OTP di sini:', { reply_markup: buildOtpKeyboard(viaApp) });
        };
        await showOtpPrompt(isCodeViaApp);
        // Step 4 & 5: OTP input + SignIn retry loop (handles PHONE_CODE_EXPIRED & PHONE_CODE_INVALID)
        let signInDone = false;
        let attemptCount = 0;
        const MAX_ATTEMPTS = 3;
        let sessionString = null;
        while (!signInDone && attemptCount < MAX_ATTEMPTS) {
            attemptCount++;
            // --- Wait for OTP input (supports SMS resend button & cancel) ---
            let otpCode;
            let waitingForOtp = true;
            while (waitingForOtp) {
                // Wait for text message, SMS resend button, or cancel button
                // Array = OR filter: cocokkan text ATAU callback query
                const inputResult = await conversation.waitFor(['message:text', 'callback_query:data']);
                const cbData = inputResult.callbackQuery?.data;
                if (cbData === 'cancel_reg') {
                    await inputResult.answerCallbackQuery('Pendaftaran dibatalkan.');
                    try {
                        await inputResult.deleteMessage();
                    }
                    catch (_e) { /* ignore */ }
                    await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran dibatalkan.</blockquote>`);
                    return;
                }
                if (cbData === 'otp_resend_sms') {
                    await inputResult.answerCallbackQuery('Mengirim ulang via SMS...');
                    try {
                        const resendResult = await conversation.external(async () => {
                            const activeClient = activeRegClients.get(telegramId);
                            if (!activeClient) {
                                throw new Error('Client tidak ditemukan. Ulangi /daftar.');
                            }
                            await ensureConnected(activeClient);
                            Logger.logUser(telegramId, `[OTP] Resend via SMS ke ${phoneNumber}...`, 'INFO');
                            const r = await activeClient.sendCode({ apiId: config.apiId, apiHash: config.apiHash }, phoneNumber, true // forceSMS
                            );
                            Logger.logUser(telegramId, `[OTP] SMS terkirim. phoneCodeHash=${r.phoneCodeHash?.slice(0, 8)}...`, 'INFO');
                            // Update pending state
                            pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp });
                            return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp };
                        });
                        phoneCodeHash = resendResult.phoneCodeHash;
                    }
                    catch (e) {
                        Logger.logUser(telegramId, `[OTP] Gagal resend SMS: ${e.message}`, 'ERROR');
                        await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Gagal mengirim ulang via SMS: ${e.message}</blockquote>`);
                    }
                    await replyRich(ctx, '💬 <b>Kode OTP dikirim ulang via SMS.</b>\n\n<blockquote>Cek SMS masuk di nomor <code>' + phoneNumber + '</code>.\n⏱️ Segera masukkan kode di sini (berlaku 2 menit).</blockquote>\n\n🛡️ <b>PENTING:</b> Ketik kode dengan <b>spasi</b> antar digit.\n<i>Contoh: <code>12345</code> → ketik <code>1 2 3 4 5</code></i>', { reply_markup: buildOtpKeyboard(false) });
                    continue;
                }
                // Got text — it's the OTP
                otpCode = inputResult.message?.text?.trim();
                waitingForOtp = false;
            }
            // 🧹 Sanitize OTP
            if (otpCode) {
                otpCode = otpCode.replace(/[^0-9]/g, '');
            }
            // --- Try signIn ---
            // Tangkap error DI DALAM external() agar properti error tidak hilang saat serialisasi
            const signInResult = await conversation.external(async () => {
                const activeClient = activeRegClients.get(telegramId);
                if (!activeClient) {
                    return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };
                }
                // Reconnect jika koneksi terputus selama user menunggu
                await ensureConnected(activeClient);
                Logger.logUser(telegramId, `[OTP] Mencoba signIn... (percobaan ${attemptCount}/${MAX_ATTEMPTS})`, 'INFO');
                try {
                    await activeClient.signIn({
                        phoneNumber,
                        phoneCodeHash,
                        phoneCode: otpCode,
                    });
                    // Simpan session string SEKARANG
                    const sess = activeClient.session.save();
                    return { status: 'success', sessionString: sess };
                }
                catch (err) {
                    const errMsg = err.errorMessage || err.message || '';
                    Logger.logUser(telegramId, `[OTP] signIn error (percobaan ${attemptCount}): ${errMsg}`, 'ERROR');
                    // Klasifikasi error dan return sebagai plain object
                    if (errMsg.includes('SESSION_PASSWORD_NEEDED') || err.name === 'SessionPasswordNeededError') {
                        return { status: '2fa_needed' };
                    }
                    else if (errMsg.includes('PHONE_CODE_EXPIRED') || errMsg.includes('CODE_EXPIRED')) {
                        return { status: 'code_expired' };
                    }
                    else if (errMsg.includes('PHONE_CODE_INVALID') || errMsg.includes('CODE_INVALID')) {
                        return { status: 'code_invalid' };
                    }
                    else {
                        return { status: 'error', error: errMsg };
                    }
                }
            });
            // Handle result berdasarkan status
            if (signInResult.status === 'success') {
                sessionString = signInResult.sessionString;
                signInDone = true; // ✅ Berhasil!
            }
            else if (signInResult.status === 'code_expired') {
                // ♻️ Kode expired — kirim kode baru otomatis
                if (attemptCount < MAX_ATTEMPTS) {
                    await replyRich(ctx, `<h1>⚠️ Kode OTP kadaluarsa!</h1><blockquote>Mengirim kode baru... (Percobaan ${attemptCount}/${MAX_ATTEMPTS})</blockquote>`, {});
                    try {
                        const resendResult = await conversation.external(async () => {
                            const activeClient = activeRegClients.get(telegramId);
                            if (!activeClient) {
                                throw new Error('Client tidak ditemukan. Ulangi /daftar.');
                            }
                            await ensureConnected(activeClient);
                            Logger.logUser(telegramId, '[OTP] Resend kode baru karena expired...', 'INFO');
                            const r = await activeClient.sendCode({ apiId: config.apiId, apiHash: config.apiHash }, phoneNumber);
                            Logger.logUser(telegramId, `[OTP] Kode baru terkirim. hash=${r.phoneCodeHash?.slice(0, 8)}...`, 'INFO');
                            pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp });
                            return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp };
                        });
                        phoneCodeHash = resendResult.phoneCodeHash;
                        isCodeViaApp = resendResult.isCodeViaApp;
                        await showOtpPrompt(isCodeViaApp, true);
                    }
                    catch (resendErr) {
                        Logger.logUser(telegramId, `[OTP] Gagal resend setelah expired: ${resendErr.message}`, 'ERROR');
                        await replyRich(ctx, `❌ <b>Gagal mengirim kode baru:</b>\n<blockquote>${resendErr.message}</blockquote>\nSilakan ulangi <code>/daftar</code>.`);
                        return;
                    }
                }
                else {
                    await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Kode OTP terus kadaluarsa setelah ${MAX_ATTEMPTS}x percobaan.\n\nSilakan ulangi <code>/daftar</code> dan masukkan kode dengan cepat.</blockquote>`);
                    return;
                }
            }
            else if (signInResult.status === '2fa_needed') {
                // 🔒 2FA Password needed
                await replyRich(ctx, `<h1>🔒 Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</h1><blockquote>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</blockquote>`, { reply_markup: cancelKeyboard, });
                let password;
                try {
                    password = await waitForInput(conversation, ctx);
                }
                catch (pwdErr) {
                    if (pwdErr.message === 'USER_CANCELLED') {
                        return;
                    }
                    throw pwdErr;
                }
                // 2FA signIn — juga tangkap error di dalam external()
                const pwdResult = await conversation.external(async () => {
                    const activeClient = activeRegClients.get(telegramId);
                    if (!activeClient) {
                        return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };
                    }
                    await ensureConnected(activeClient);
                    try {
                        await activeClient.signIn({ password });
                        const sess = activeClient.session.save();
                        return { status: 'success', sessionString: sess };
                    }
                    catch (e) {
                        return { status: 'error', error: e.errorMessage || e.message || 'Password salah' };
                    }
                });
                if (pwdResult.status === 'success') {
                    sessionString = pwdResult.sessionString;
                    signInDone = true;
                }
                else {
                    await replyRich(ctx, `❌ <b>Password 2FA salah:</b>\n<blockquote>${pwdResult.error}</blockquote>\nPendaftaran dibatalkan.`);
                    return;
                }
            }
            else if (signInResult.status === 'code_invalid') {
                // ❌ Kode salah — minta input ulang (hash masih valid)
                if (attemptCount < MAX_ATTEMPTS) {
                    await replyRich(ctx, `<h1>❌ Kode OTP salah!</h1><blockquote>Pastikan kode yang dimasukkan benar dan belum kadaluarsa.\n<i>Percobaan ${attemptCount}/${MAX_ATTEMPTS}. Silakan coba lagi.</i></blockquote>`, { reply_markup: buildOtpKeyboard(false), });
                }
                else {
                    await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br><b>Kode OTP salah ${MAX_ATTEMPTS}x.</b>\n\nPendaftaran dibatalkan. Silakan ulangi <code>/daftar</code>.</blockquote>`);
                    return;
                }
            }
            else {
                // ❌ Error tidak dikenal
                await replyRich(ctx, `❌ <b>Gagal login:</b>\n<blockquote>${signInResult.error || 'Unknown error'}</blockquote>\nPendaftaran dibatalkan.`);
                return;
            }
        }
        if (!signInDone || !sessionString) {
            await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Gagal login setelah ${MAX_ATTEMPTS}x percobaan. Silakan ulangi <code>/daftar</code>.</blockquote>`);
            return;
        }
        // Step 6: Save session on success
        // Session string sudah didapat dari dalam external() di atas
        await saveUserbotSession(telegramId, phoneNumber, sessionString);
        await replyRich(ctx, `<h1>✨ Pendaftaran Berhasil!</h1><blockquote>⏳ Mengaktifkan userbot Anda...</blockquote>`, {});
        // Start userbot in manager
        await conversation.external(async () => {
            await userbotManager.startUserbot(telegramId, sessionString);
        });
        await replyRich(ctx, `<h1>🟢 Userbot AKTIF!</h1>` +
            `<table bordered striped><caption>🎉 Akun Berhasil Didaftarkan</caption>` +
            `<tr><th>Item</th><th>Detail</th></tr>` +
            `<tr><td>Status</td><td align="center">🟢 Aktif</td></tr>` +
            `<tr><td>ID</td><td align="center"><code>${telegramId}</code></td></tr>` +
            `</table>` +
            `<blockquote>💡 Coba kirim <code>.ping</code> di chat mana pun — userbot akan membalas <b>Pong</b>!</blockquote>`, {});
    }
    catch (error) {
        const isCancelled = error.message === 'USER_CANCELLED' ||
            error.message?.includes('disconnected') ||
            error.message?.includes('disconnect') ||
            error.message?.includes('Closed') ||
            error.message?.includes('connection');
        if (!isCancelled) {
            Logger.logUser(telegramId, `Error in OTP registration conversation: ${error.message}`, 'ERROR');
            await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem saat pendaftaran. Silakan coba lagi nanti.</blockquote>`);
        }
    }
    finally {
        await cleanupClient(telegramId);
    }
}
/**
 * Conversation handler for QR Code Registration
 *
 * QR login menggunakan pendekatan khusus:
 * - signInUserWithQrCode adalah operasi long-running (menunggu user scan QR)
 * - Seluruh proses QR (connect + signIn + save session) dilakukan dalam SATU external()
 * - QR image dikirim via ctx.api yang di-pass dari luar conversation (via escape callback)
 */
export async function qrRegistrationConversation(conversation, ctx) {
    const telegramId = ctx.from.id;
    const chatId = ctx.chat.id;
    try {
        await replyRich(ctx, `<h1>🔍 Pendaftaran via Scan QR Code</h1>` +
            `<table bordered striped><caption>📋 Langkah</caption>` +
            `<tr><th>#</th><th>Aksi</th></tr>` +
            `<tr><td align="center">1</td><td>QR Code muncul di bawah</td></tr>` +
            `<tr><td align="center">2</td><td>Buka Telegram → Settings → Devices</td></tr>` +
            `<tr><td align="center">3</td><td>Scan QR → userbot aktif 🎉</td></tr>` +
            `</table>` +
            `<blockquote>⏱️ Anda punya waktu <b>2 menit</b> untuk memindai.</blockquote>`, { reply_markup: cancelKeyboard, });
        // Seluruh proses QR login dilakukan dalam satu external() call
        // karena signInUserWithQrCode adalah operasi blocking yang harus selesai sebelum kita bisa lanjut
        const qrResult = await conversation.external({
            task: async (outsideCtx) => {
                const client = new TelegramClient(new StringSession(''), config.apiId, config.apiHash, {
                    connectionRetries: 5,
                    deviceModel: 'Chrome 147',
                    systemVersion: 'Android 11',
                    appVersion: '2.2 K',
                    langCode: 'id',
                    systemLangCode: 'id-ID',
                });
                activeRegClients.set(telegramId, client);
                await client.connect();
                let qrImageMessageId = null;
                let isScanned = false;
                // QR login with timeout
                const loginPromise = client.signInUserWithQrCode({
                    apiId: config.apiId,
                    apiHash: config.apiHash,
                }, {
                    qrCode: async (token) => {
                        try {
                            const url = `tg://login?token=${token.token.toString('base64url')}`;
                            const qrBuffer = await qrcode.toBuffer(url, { scale: 8 });
                            // Hapus QR code sebelumnya
                            if (qrImageMessageId) {
                                try {
                                    await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
                                }
                                catch (_e) { /* ignore: may be already deleted */ }
                            }
                            const qrMsg = await outsideCtx.api.sendPhoto(chatId, new InputFile(qrBuffer), {
                                caption: '📷 <b>SCAN QR CODE INI</b>\n\n' +
                                    '<blockquote>' +
                                    '1. Buka Telegram di HP Anda.\n' +
                                    '2. Buka <b>Pengaturan (Settings) > Perangkat (Devices) > Hubungkan Perangkat</b>.\n' +
                                    '3. Arahkan kamera HP ke QR Code di atas.' +
                                    '</blockquote>\n' +
                                    '⚠️ <i>QR Code ini berlaku selama 30 detik. Jika kedaluwarsa, bot akan mengirimkan QR Code yang baru.</i>',
                                parse_mode: 'HTML',
                                reply_markup: cancelKeyboard,
                            });
                            qrImageMessageId = qrMsg.message_id;
                        }
                        catch (qrErr) {
                            Logger.logUser(telegramId, `Error generating/sending QR: ${qrErr.message}`, 'ERROR');
                        }
                    },
                    onError: (err) => {
                        if (!isScanned) {
                            Logger.logUser(telegramId, `QR Sign-in Error: ${err.message}`, 'ERROR');
                        }
                    }
                });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 120000));
                let result;
                try {
                    await Promise.race([loginPromise, timeoutPromise]);
                    isScanned = true;
                    result = { status: 'success' };
                }
                catch (e) {
                    if (e.message?.includes('Account has 2FA enabled') || e.message === 'SESSION_PASSWORD_NEEDED') {
                        isScanned = true;
                        result = { status: '2fa_needed' };
                    }
                    else {
                        throw e;
                    }
                }
                finally {
                    // Bersihkan QR image
                    if (qrImageMessageId) {
                        try {
                            await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
                        }
                        catch (_e) { /* ignore */ }
                    }
                }
                if (result.status === '2fa_needed') {
                    return { status: '2fa_needed' };
                }
                // Berhasil login tanpa 2FA - simpan session
                const sessionString = client.session.save();
                // Disconnect client setelah session disimpan
                try {
                    await client.disconnect();
                }
                catch (_e) { /* ignore */ }
                activeRegClients.delete(telegramId);
                return { status: 'success', sessionString };
            },
            // Data dari external() harus serializable - sessionString adalah string
            beforeStore: (data) => data,
            afterLoad: (data) => data,
        });
        // --- Handle 2FA jika diperlukan ---
        if (qrResult.status === '2fa_needed') {
            await replyRich(ctx, `<h1>🔒 Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</h1><blockquote>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</blockquote>`, { reply_markup: cancelKeyboard, });
            const pwdResult = await conversation.waitFor('message:text');
            if (pwdResult.message?.text?.trim() === '/cancel') {
                cleanupClient(telegramId);
                await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran dibatalkan.</blockquote>`);
                return;
            }
            const password = pwdResult.message.text.trim();
            const pwdAuthResult = await conversation.external(async () => {
                const activeClient = activeRegClients.get(telegramId);
                if (!activeClient) {
                    return { status: 'error', error: 'Client hilang.' };
                }
                try {
                    await activeClient.signInWithPassword({ apiId: config.apiId, apiHash: config.apiHash }, { password: async () => password });
                    const sess = activeClient.session.save();
                    try {
                        await activeClient.disconnect();
                    }
                    catch (_e) { /* ignore */ }
                    activeRegClients.delete(telegramId);
                    return { status: 'success', sessionString: sess };
                }
                catch (err) {
                    try {
                        await activeClient.disconnect();
                    }
                    catch (_e) { /* ignore */ }
                    activeRegClients.delete(telegramId);
                    return { status: 'error', error: err.message };
                }
            });
            if (pwdAuthResult.status !== 'success') {
                await replyRich(ctx, `❌ <b>Gagal login 2FA:</b>\n<blockquote>${pwdAuthResult.error}</blockquote>\nSilakan ulangi <code>/daftar</code>.`);
                return;
            }
            qrResult.sessionString = pwdAuthResult.sessionString;
        }
        // Save to Database
        await saveUserbotSession(telegramId, null, qrResult.sessionString);
        await replyRich(ctx, `<h1>✨ Pendaftaran Berhasil!</h1><blockquote>⏳ Mengaktifkan userbot Anda...</blockquote>`, {});
        // Start userbot in manager
        await conversation.external(async () => {
            await userbotManager.startUserbot(telegramId, qrResult.sessionString);
        });
        await replyRich(ctx, `<h1>🟢 Userbot AKTIF!</h1>` +
            `<table bordered striped><caption>🎉 Akun Berhasil Didaftarkan</caption>` +
            `<tr><th>Item</th><th>Detail</th></tr>` +
            `<tr><td>Metode</td><td align="center">🔍 QR Code</td></tr>` +
            `<tr><td>Status</td><td align="center">🟢 Aktif</td></tr>` +
            `<tr><td>ID</td><td align="center"><code>${telegramId}</code></td></tr>` +
            `</table>` +
            `<blockquote>💡 Coba kirim <code>.ping</code> di chat mana pun — userbot akan membalas <b>Pong</b>!</blockquote>`, {});
    }
    catch (error) {
        const isCancelled = error.message === 'USER_CANCELLED' ||
            error.message?.includes('disconnected') ||
            error.message?.includes('disconnect') ||
            error.message?.includes('Closed') ||
            error.message?.includes('connection');
        if (!isCancelled) {
            if (error.message === 'TIMEOUT') {
                await replyRich(ctx, `<blockquote>⏰ <b>Waktu pendaftaran habis (2 menit tanpa pemindaian).</b>\n\nSilakan ulangi <code>/daftar</code>.</blockquote>`);
            }
            else {
                Logger.logUser(telegramId, `Error in QR registration conversation: ${error.message}`, 'ERROR');
                await replyRich(ctx, `❌ <b>Login QR Code gagal:</b>\n<blockquote>${error.message}</blockquote>\nSilakan ulangi <code>/daftar</code>.`);
            }
        }
    }
    finally {
        await cleanupClient(telegramId);
    }
}
/**
 * Conversation to broadcast message to all registered users (Owner Only)
 */
export async function broadcastConversation(conversation, ctx) {
    const telegramId = ctx.from.id;
    // Double-check if the sender is the owner
    if (Number(telegramId) !== Number(config.ownerId)) {
        await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Anda tidak memiliki akses ke fitur Administrator ini!</blockquote>`);
        return;
    }
    try {
        await replyRich(ctx, `<h1>📢 Panel Broadcast Userbot</h1><blockquote>Silakan kirimkan pesan broadcast yang ingin Anda sebarluaskan ke seluruh pengguna terdaftar.</blockquote>`, { reply_markup: cancelKeyboard, });
        let broadcastMsg;
        try {
            broadcastMsg = await waitForInput(conversation, ctx);
        }
        catch (err) {
            if (err.message === 'USER_CANCELLED') {
                return;
            }
            throw err;
        }
        await replyRich(ctx, `<blockquote>⏳ Memulai proses broadcast...</blockquote>`);
        // Load DB and active list
        const { getAllRegisteredUsers } = await import('../../infrastructure/database.js');
        const allUsers = getAllRegisteredUsers();
        let successCount = 0;
        let failCount = 0;
        for (const user of allUsers) {
            try {
                await ctx.api.sendMessage(user.telegram_id, `📢 <b>PEMBERITAHUAN USERBOT</b>\n\n<blockquote>${broadcastMsg}</blockquote>`, {
                    parse_mode: 'HTML',
                });
                successCount++;
                // Add a small 100ms delay to avoid hitting Telegram's rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            catch (_err) {
                failCount++;
            }
        }
        await replyRich(ctx, `<h1>✅ Broadcast Selesai!</h1>` +
            `<table bordered striped><caption>📊 Ringkasan Pengiriman</caption>` +
            `<tr><th>Item</th><th>Jumlah</th></tr>` +
            `<tr><td>✅ Sukses Terkirim</td><td align="center"><code>${successCount} Akun</code></td></tr>` +
            `<tr><td>❌ Gagal Terkirim</td><td align="center"><code>${failCount} Akun</code></td></tr>` +
            `</table>` +
            `<blockquote>Gunakan <code>/menu</code> untuk kembali ke Menu Utama.</blockquote>`);
    }
    catch (error) {
        if (error.message !== 'USER_CANCELLED') {
            Logger.logUser(telegramId, `Error in Broadcast Conversation: ${error.message}`, 'ERROR');
            await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem saat memproses broadcast.</blockquote>`);
        }
    }
}
/**
 * Conversation to set custom userbot name
 */
export async function customNameConversation(conversation, ctx) {
    const telegramId = ctx.from.id;
    try {
        await replyRich(ctx, `<h1>📝 Set Custom Nama Ubot</h1><blockquote>Kirimkan nama/signature baru untuk userbot Anda (Maksimal 30 karakter).\nContoh: <code>Ubot Sultan</code></blockquote>\n\nKetik /cancel untuk membatalkan.`, { reply_markup: cancelKeyboard, });
        let newName;
        try {
            newName = await waitForInput(conversation, ctx);
        }
        catch (err) {
            if (err.message === 'USER_CANCELLED') {
                return;
            }
            throw err;
        }
        if (newName.length > 30) {
            await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Nama terlalu panjang! Maksimal 30 karakter. Pengaturan dibatalkan.</blockquote>`);
            return;
        }
        // Save to DB
        const { updateUserbotFeature } = await import('../../infrastructure/database.js');
        await updateUserbotFeature(telegramId, 'custom_name', newName);
        await replyRich(ctx, `✅ <b>Nama Ubot berhasil diperbarui menjadi:</b>\n<blockquote>"${newName}"</blockquote>`);
        await ctx.replyWithRichMessage({ html: `<blockquote>Gunakan <code>/menu</code> untuk kembali ke Panel Kontrol Utama.</blockquote>` });
    }
    catch (error) {
        if (error.message !== 'USER_CANCELLED') {
            Logger.logUser(telegramId, `Error in custom name conversation: ${error.message}`, 'ERROR');
            await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem. Gagal mengubah nama ubot.</blockquote>`);
        }
    }
}
