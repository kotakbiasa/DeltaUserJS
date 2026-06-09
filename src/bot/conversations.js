import { InputFile, InlineKeyboard } from 'grammy';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import qrcode from 'qrcode';
import config from '../config.js';
import { saveUserbotSession } from '../database/db.js';
import userbotManager from '../userbot/manager.js';
import { cancelKeyboard } from './keypads.js';

// ==========================================
// 🔧 Custom Prototype Extension for GramJS
// Resolves client.signIn is not a function
// ==========================================
TelegramClient.prototype.signIn = async function ({ phoneNumber, phoneCodeHash, phoneCode, password }) {
  if (!this.connected) {
    await this.connect();
  }

  if (password) {
    return await this.signInWithPassword(
      { apiId: this.apiId, apiHash: this.apiHash },
      { password: async () => password }
    );
  } else {
    const result = await this.invoke(
      new Api.auth.SignIn({
        phoneNumber,
        phoneCodeHash,
        phoneCode,
      })
    );
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
  if (client) return client;

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
    } catch (e) {}
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
    } catch (e) {}
    await ctx.reply('❌ Pendaftaran dibatalkan.');
    throw new Error('USER_CANCELLED');
  }

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
    await ctx.reply('📱 <b>Pendaftaran via OTP dimulai.</b>\n\n<blockquote>Silakan kirimkan nomor HP Anda dalam format internasional (contoh: <code>+628123456789</code>).</blockquote>', {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard,
    });

    // Step 1: Wait for phone number
    let phoneNumber;
    try {
      phoneNumber = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    // 🧹 Sanitize Phone Number: Bersihkan spasi, strip, dll. (misal: "+62 812-345" -> "+62812345")
    if (phoneNumber) {
      const cleaned = phoneNumber.replace(/[^0-9]/g, '');
      phoneNumber = (phoneNumber.startsWith('+') ? '+' : '') + cleaned;
    }

    // Validate phone number format (must start with +)
    if (!phoneNumber.startsWith('+')) {
      await ctx.reply('❌ <b>Format nomor HP salah!</b>\n\n<blockquote>Harus diawali dengan kode negara (contoh: <code>+628xxx</code>). Silakan ulangi proses <code>/daftar</code>.</blockquote>', { parse_mode: 'HTML' });
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
          console.log(`[OTP] Menggunakan hash yang sudah ada (resume dari checkpoint)`);
          return { phoneCodeHash: existing.phoneCodeHash, isCodeViaApp: existing.isCodeViaApp };
        }

        // Buat client dan connect
        const client = getOrCreateClient(telegramId, phoneNumber);
        await ensureConnected(client);

        console.log(`[OTP] Mengirim kode ke ${phoneNumber}...`);
        const result = await client.sendCode(
          { apiId: config.apiId, apiHash: config.apiHash },
          phoneNumber
        );
        console.log(`[OTP] Kode terkirim. isCodeViaApp=${result.isCodeViaApp}, hash=${result.phoneCodeHash?.slice(0, 8)}...`);

        // Simpan ke pendingOtpState agar replay tidak membuat client baru
        const state = { phoneCodeHash: result.phoneCodeHash, isCodeViaApp: result.isCodeViaApp };
        pendingOtpState.set(telegramId, state);

        // Return HANYA plain serializable data
        return state;
      });
      phoneCodeHash = initResult.phoneCodeHash;
      isCodeViaApp = initResult.isCodeViaApp;
    } catch (err) {
      console.error(`[OTP] Error saat init/sendCode:`, err);
      await ctx.reply(`❌ <b>Gagal mengirim OTP:</b>\n<blockquote>${err.message}</blockquote>\nSilakan ulangi <code>/daftar</code>.`, { parse_mode: 'HTML' });
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
        ? '📱 <b>Kode dikirim via Aplikasi Telegram</b>\n\n<blockquote>Buka aplikasi <b>Telegram</b> di HP Anda → cari chat <b>"Telegram"</b> (✓ centang biru).\n\n⚠️ <i>Kode berlaku <b>2 menit</b>. Jika tidak muncul, klik "Kirim Ulang via SMS".</i></blockquote>'
        : '💬 <b>Kode dikirim via SMS</b>\n\n<blockquote>Cek SMS di nomor <code>' + phoneNumber + '</code>.\n\n⚠️ <i>Kode berlaku <b>2 menit</b>. Segera masukkan!</i></blockquote>';
      await ctx.reply(prefix + info + antiShareTip + '\n\nKirimkan kode OTP di sini:', {
        parse_mode: 'HTML',
        reply_markup: buildOtpKeyboard(viaApp),
      });
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
          try { await inputResult.deleteMessage(); } catch (e) {}
          await ctx.reply('❌ Pendaftaran dibatalkan.');
          return;
        }

        if (cbData === 'otp_resend_sms') {
          await inputResult.answerCallbackQuery('Mengirim ulang via SMS...');
          try {
            const resendResult = await conversation.external(async () => {
              const activeClient = activeRegClients.get(telegramId);
              if (!activeClient) throw new Error('Client tidak ditemukan. Ulangi /daftar.');
              await ensureConnected(activeClient);
              console.log(`[OTP] Resend via SMS ke ${phoneNumber}...`);
              const r = await activeClient.sendCode(
                { apiId: config.apiId, apiHash: config.apiHash },
                phoneNumber,
                true // forceSMS
              );
              console.log(`[OTP] SMS terkirim. phoneCodeHash=${r.phoneCodeHash?.slice(0, 8)}...`);
              // Update pending state
              pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp });
              return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp };
            });
            phoneCodeHash = resendResult.phoneCodeHash;
          } catch (e) {
            console.error('[OTP] Gagal resend SMS:', e);
            await ctx.reply(`❌ Gagal mengirim ulang via SMS: ${e.message}`, { parse_mode: 'HTML' });
          }
          await ctx.reply('💬 <b>Kode OTP dikirim ulang via SMS.</b>\n\n<blockquote>Cek SMS masuk di nomor <code>' + phoneNumber + '</code>.\n⏱️ Segera masukkan kode di sini (berlaku 2 menit).</blockquote>\n\n🛡️ <b>PENTING:</b> Ketik kode dengan <b>spasi</b> antar digit.\n<i>Contoh: <code>12345</code> → ketik <code>1 2 3 4 5</code></i>', {
            parse_mode: 'HTML',
            reply_markup: buildOtpKeyboard(false),
          });
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
        if (!activeClient) return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };
        // Reconnect jika koneksi terputus selama user menunggu
        await ensureConnected(activeClient);
        console.log(`[OTP] Mencoba signIn... (percobaan ${attemptCount}/${MAX_ATTEMPTS})`);
        try {
          await activeClient.signIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode: otpCode,
          });
          // Simpan session string SEKARANG
          const sess = activeClient.session.save();
          return { status: 'success', sessionString: sess };
        } catch (err) {
          const errMsg = err.errorMessage || err.message || '';
          console.error(`[OTP] signIn error (percobaan ${attemptCount}):`, errMsg);
          // Klasifikasi error dan return sebagai plain object
          if (errMsg.includes('SESSION_PASSWORD_NEEDED') || err.name === 'SessionPasswordNeededError') {
            return { status: '2fa_needed' };
          } else if (errMsg.includes('PHONE_CODE_EXPIRED') || errMsg.includes('CODE_EXPIRED')) {
            return { status: 'code_expired' };
          } else if (errMsg.includes('PHONE_CODE_INVALID') || errMsg.includes('CODE_INVALID')) {
            return { status: 'code_invalid' };
          } else {
            return { status: 'error', error: errMsg };
          }
        }
      });

      // Handle result berdasarkan status
      if (signInResult.status === 'success') {
        sessionString = signInResult.sessionString;
        signInDone = true; // ✅ Berhasil!

      } else if (signInResult.status === 'code_expired') {
        // ♻️ Kode expired — kirim kode baru otomatis
        if (attemptCount < MAX_ATTEMPTS) {
            await ctx.reply(`⚠️ <b>Kode OTP kadaluarsa!</b>\n\n<blockquote>Mengirim kode baru... (Percobaan ${attemptCount}/${MAX_ATTEMPTS})</blockquote>`, { parse_mode: 'HTML' });
            try {
              const resendResult = await conversation.external(async () => {
                const activeClient = activeRegClients.get(telegramId);
                if (!activeClient) throw new Error('Client tidak ditemukan. Ulangi /daftar.');
                await ensureConnected(activeClient);
                console.log(`[OTP] Resend kode baru karena expired...`);
                const r = await activeClient.sendCode({ apiId: config.apiId, apiHash: config.apiHash }, phoneNumber);
                console.log(`[OTP] Kode baru terkirim. hash=${r.phoneCodeHash?.slice(0, 8)}...`);
                pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp });
                return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp };
              });
              phoneCodeHash = resendResult.phoneCodeHash;
              isCodeViaApp = resendResult.isCodeViaApp;
              await showOtpPrompt(isCodeViaApp, true);
            } catch (resendErr) {
              console.error('[OTP] Gagal resend setelah expired:', resendErr);
              await ctx.reply(`❌ <b>Gagal mengirim kode baru:</b>\n<blockquote>${resendErr.message}</blockquote>\nSilakan ulangi <code>/daftar</code>.`, { parse_mode: 'HTML' });
              return;
            }
          } else {
            await ctx.reply(`❌ Kode OTP terus kadaluarsa setelah ${MAX_ATTEMPTS}x percobaan.\n\nSilakan ulangi <code>/daftar</code> dan masukkan kode dengan cepat.`, { parse_mode: 'HTML' });
            return;
          }

      } else if (signInResult.status === '2fa_needed') {
        // 🔒 2FA Password needed
        await ctx.reply('🔒 <b>Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</b>\n\n<blockquote>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</blockquote>', {
            parse_mode: 'HTML',
            reply_markup: cancelKeyboard,
          });
          let password;
          try {
            password = await waitForInput(conversation, ctx);
          } catch (pwdErr) {
            if (pwdErr.message === 'USER_CANCELLED') return;
            throw pwdErr;
          }
          // 2FA signIn — juga tangkap error di dalam external()
          const pwdResult = await conversation.external(async () => {
            const activeClient = activeRegClients.get(telegramId);
            if (!activeClient) return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };
            await ensureConnected(activeClient);
            try {
              await activeClient.signIn({ password });
              const sess = activeClient.session.save();
              return { status: 'success', sessionString: sess };
            } catch (e) {
              return { status: 'error', error: e.errorMessage || e.message || 'Password salah' };
            }
          });
          if (pwdResult.status === 'success') {
            sessionString = pwdResult.sessionString;
            signInDone = true;
          } else {
            await ctx.reply(`❌ <b>Password 2FA salah:</b>\n<blockquote>${pwdResult.error}</blockquote>\nPendaftaran dibatalkan.`, { parse_mode: 'HTML' });
            return;
          }

      } else if (signInResult.status === 'code_invalid') {
        // ❌ Kode salah — minta input ulang (hash masih valid)
        if (attemptCount < MAX_ATTEMPTS) {
            await ctx.reply(`❌ <b>Kode OTP salah!</b>\n\n<blockquote>Pastikan kode yang dimasukkan benar dan belum kadaluarsa.\n<i>Percobaan ${attemptCount}/${MAX_ATTEMPTS}. Silakan coba lagi.</i></blockquote>`, {
              parse_mode: 'HTML',
              reply_markup: buildOtpKeyboard(false),
            });
          } else {
            await ctx.reply(`❌ <b>Kode OTP salah ${MAX_ATTEMPTS}x.</b>\n\nPendaftaran dibatalkan. Silakan ulangi <code>/daftar</code>.`, { parse_mode: 'HTML' });
            return;
          }

      } else {
        // ❌ Error tidak dikenal
        await ctx.reply(`❌ <b>Gagal login:</b>\n<blockquote>${signInResult.error || 'Unknown error'}</blockquote>\nPendaftaran dibatalkan.`, { parse_mode: 'HTML' });
        return;
      }
    }

    if (!signInDone || !sessionString) {
      await ctx.reply(`❌ Gagal login setelah ${MAX_ATTEMPTS}x percobaan. Silakan ulangi <code>/daftar</code>.`, { parse_mode: 'HTML' });
      return;
    }

    // Step 6: Save session on success
    // Session string sudah didapat dari dalam external() di atas
    saveUserbotSession(telegramId, phoneNumber, sessionString);

    await ctx.reply('✨ <b>Selamat! Pendaftaran Userbot Berhasil!</b>\n\n<blockquote>Sedang mengaktifkan userbot Anda...</blockquote>', { parse_mode: 'HTML' });

    // Start userbot in manager
    await conversation.external(async () => {
      await userbotManager.startUserbot(telegramId, sessionString);
    });

    await ctx.reply('🟢 <b>Userbot Anda sekarang AKTIF!</b>\n\n<blockquote>Coba kirimkan pesan <code>.ping</code> di chat mana pun menggunakan akun Telegram Anda, userbot akan otomatis membalasnya dengan <b>Pong</b>.</blockquote>', { parse_mode: 'HTML' });

  } catch (error) {
    const isCancelled = error.message === 'USER_CANCELLED' || 
                        error.message?.includes('disconnected') || 
                        error.message?.includes('disconnect') ||
                        error.message?.includes('Closed') ||
                        error.message?.includes('connection');
                        
    if (!isCancelled) {
      console.error('Error in OTP registration conversation:', error);
      await ctx.reply('❌ Terjadi kesalahan sistem saat pendaftaran. Silakan coba lagi nanti.');
    }
  } finally {
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
    await ctx.reply('🔍 <b>Pendaftaran via Scan QR Code dimulai.</b>\n\n<blockquote>Menghubungkan ke server Telegram untuk membuat QR Code...\n\n⏱️ QR Code akan muncul dalam beberapa detik. Anda punya waktu <b>2 menit</b> untuk memindai.</blockquote>', {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard,
    });

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
        const loginPromise = client.signInUserWithQrCode(
          {
            apiId: config.apiId,
            apiHash: config.apiHash,
          },
          {
            qrCode: async (token) => {
              try {
                const url = `tg://login?token=${token.token.toString('base64url')}`;
                const qrBuffer = await qrcode.toBuffer(url, { scale: 8 });

                // Hapus QR code sebelumnya
                if (qrImageMessageId) {
                  try {
                    await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
                  } catch (e) {}
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
              } catch (qrErr) {
                console.error('Error generating/sending QR:', qrErr);
              }
            },
            onError: (err) => {
              if (!isScanned) {
                console.error('QR Sign-in Error:', err);
              }
            }
          }
        );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 120000)
        );

        try {
          await Promise.race([loginPromise, timeoutPromise]);
          isScanned = true;
        } finally {
          // Bersihkan QR image
          if (qrImageMessageId) {
            try {
              await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
            } catch (e) {}
          }
        }

        // Berhasil login - simpan session
        const sessionString = client.session.save();

        // Disconnect client setelah session disimpan
        try {
          await client.disconnect();
        } catch (e) {}
        activeRegClients.delete(telegramId);

        return { sessionString };
      },
      // Data dari external() harus serializable - sessionString adalah string
      beforeStore: (data) => data,
      afterLoad: (data) => data,
    });

    // Save to Database
    saveUserbotSession(telegramId, null, qrResult.sessionString);

    await ctx.reply('✨ <b>Selamat! Pendaftaran via QR Code Berhasil!</b>\n\n<blockquote>Sedang mengaktifkan userbot Anda...</blockquote>', { parse_mode: 'HTML' });

    // Start userbot in manager
    await conversation.external(async () => {
      await userbotManager.startUserbot(telegramId, qrResult.sessionString);
    });

    await ctx.reply('🟢 <b>Userbot Anda sekarang AKTIF!</b>\n\n<blockquote>Coba kirimkan pesan <code>.ping</code> di chat mana pun menggunakan akun Telegram Anda, userbot akan otomatis membalasnya dengan <b>Pong</b>.</blockquote>', { parse_mode: 'HTML' });

  } catch (error) {
    const isCancelled = error.message === 'USER_CANCELLED' || 
                        error.message?.includes('disconnected') || 
                        error.message?.includes('disconnect') ||
                        error.message?.includes('Closed') ||
                        error.message?.includes('connection');
                        
    if (!isCancelled) {
      if (error.message === 'TIMEOUT') {
        await ctx.reply('⏰ <b>Waktu pendaftaran habis (2 menit tanpa pemindaian).</b>\n\nSilakan ulangi <code>/daftar</code>.', { parse_mode: 'HTML' });
      } else {
        console.error('Error in QR registration conversation:', error);
        await ctx.reply(`❌ <b>Login QR Code gagal:</b>\n<blockquote>${error.message}</blockquote>\nSilakan ulangi <code>/daftar</code>.`, { parse_mode: 'HTML' });
      }
    }
  } finally {
    await cleanupClient(telegramId);
  }
}

/**
 * Conversation to set custom AFK reason
 */
export async function afkReasonConversation(conversation, ctx) {
  const telegramId = ctx.from.id;
  
  try {
    await ctx.reply('📝 <b>Setel Alasan AFK Baru</b>\n\n<blockquote>Silakan kirimkan teks alasan AFK Anda yang baru. Contoh:\n<code>Sedang tidur, jangan spam ya!</code></blockquote>', {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard,
    });

    let newReason;
    try {
      newReason = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    if (newReason.length > 200) {
      await ctx.reply('❌ Alasan AFK terlalu panjang! Maksimal 200 karakter. Pengaturan dibatalkan.');
      return;
    }

    // Save to DB
    const { updateUserbotFeature } = await import('../database/db.js');
    updateUserbotFeature(telegramId, 'afk_reason', newReason);

    await ctx.reply(`✅ <b>Alasan AFK berhasil diperbarui menjadi:</b>\n<blockquote>"${newReason}"</blockquote>`, { parse_mode: 'HTML' });
    
    await ctx.reply('Gunakan `/menu` untuk kembali ke Panel Kontrol Utama.');

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      console.error('Error in AFK reason conversation:', error);
      await ctx.reply('❌ Terjadi kesalahan sistem. Gagal mengubah alasan AFK.');
    }
  }
}

/**
 * Conversation to broadcast message to all registered users (Owner Only)
 */
export async function broadcastConversation(conversation, ctx) {
  const telegramId = ctx.from.id;
  
  // Double-check if the sender is the owner
  if (Number(telegramId) !== Number(config.ownerId)) {
    await ctx.reply('❌ Anda tidak memiliki akses ke fitur Administrator ini!');
    return;
  }

  try {
    await ctx.reply('📢 <b>Panel Broadcast DeltaUbotJS</b>\n\n<blockquote>Silakan kirimkan pesan broadcast yang ingin Anda sebarluaskan ke seluruh pengguna terdaftar.</blockquote>', {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard,
    });

    let broadcastMsg;
    try {
      broadcastMsg = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    await ctx.reply('⏳ Memulai proses broadcast ke seluruh pengguna database...');

    // Load DB and active list
    const { getAllRegisteredUsers } = await import('../database/db.js');
    const allUsers = getAllRegisteredUsers();

    let successCount = 0;
    let failCount = 0;

    for (const user of allUsers) {
      try {
        await ctx.api.sendMessage(user.telegram_id, `📢 <b>PEMBERITAHUAN DELTAUBOTJS</b>\n\n<blockquote>${broadcastMsg}</blockquote>`, {
          parse_mode: 'HTML',
        });
        successCount++;
        // Add a small 100ms delay to avoid hitting Telegram's rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        failCount++;
      }
    }

    await ctx.reply(
      `✅ <b>Broadcast Selesai!</b>\n\n` +
      `<blockquote>` +
      `• Sukses Terkirim: <code>${successCount} Akun</code>\n` +
      `• Gagal Terkirim: <code>${failCount} Akun</code>` +
      `</blockquote>\n\n` +
      `Gunakan <code>/menu</code> untuk kembali ke Menu Utama.`,
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      console.error('Error in Broadcast Conversation:', error);
      await ctx.reply('❌ Terjadi kesalahan sistem saat memproses broadcast.');
    }
  }
}

/**
 * Conversation to set custom inline bot
 */
export async function setInlineBotConversation(conversation, ctx) {
  const telegramId = ctx.from.id;
  
  try {
    await ctx.reply('🤖 <b>Set Custom Inline Bot</b>\n\n<blockquote>Silakan kirimkan <b>Bot Token</b> Anda yang didapat dari @BotFather.\nContoh: <code>123456789:ABCdefGHIjklMNOpqrsTUVwxyz</code>\n\nAtau ketik <b>hapus</b> untuk menonaktifkan fitur ini.</blockquote>', {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard,
    });

    let inputToken;
    try {
      inputToken = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    if (inputToken.toLowerCase() === 'hapus') {
      const { updateUserbotFeature } = await import('../database/db.js');
      updateUserbotFeature(telegramId, 'inline_bot_token', null);
      updateUserbotFeature(telegramId, 'inline_bot_username', null);
      
      const inlineBotManager = (await import('../userbot/inlineBotManager.js')).default;
      await inlineBotManager.stopInlineBot(telegramId);
      
      await ctx.reply('✅ Custom Inline Bot berhasil dinonaktifkan.');
      return;
    }

    await ctx.reply('⏳ Memvalidasi Bot Token...');

    // Validate token via external call
    const botData = await conversation.external(async () => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${inputToken}/getMe`);
        const data = await response.json();
        return data;
      } catch (e) {
        return { ok: false, description: e.message };
      }
    });

    if (!botData.ok) {
      await ctx.reply(`❌ <b>Token tidak valid!</b>\n<blockquote>${botData.description || 'Gagal terhubung ke Telegram API'}</blockquote>\nSilakan coba lagi melalui /menu.`, { parse_mode: 'HTML' });
      return;
    }

    const botUsername = botData.result.username;

    // Save to DB
    const { updateUserbotFeature } = await import('../database/db.js');
    updateUserbotFeature(telegramId, 'inline_bot_token', inputToken);
    updateUserbotFeature(telegramId, 'inline_bot_username', botUsername);

    // Start the inline bot
    const inlineBotManager = (await import('../userbot/inlineBotManager.js')).default;
    await inlineBotManager.stopInlineBot(telegramId);
    await inlineBotManager.startInlineBot(telegramId, inputToken);

    await ctx.reply(`✅ <b>Custom Inline Bot Berhasil Diatur!</b>\n\n<blockquote>Bot kustom Anda: <b>@${botUsername}</b> siap digunakan untuk fitur inline (seperti .help).</blockquote>\n\n⚠️ Pastikan Anda sudah mengaktifkan <b>Inline Mode</b> untuk bot tersebut di @BotFather (/setinline).`, { parse_mode: 'HTML' });
    
  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      console.error('Error in set inline bot conversation:', error);
      await ctx.reply('❌ Terjadi kesalahan sistem. Gagal mengatur inline bot.');
    }
  }
}

/**
 * Conversation to set custom userbot name
 */
export async function customNameConversation(conversation, ctx) {
  const telegramId = ctx.from.id;
  
  try {
    await ctx.reply('📝 <b>Set Custom Nama Ubot</b>\n\n<blockquote>Kirimkan nama/signature baru untuk userbot Anda (Maksimal 30 karakter).\nContoh: <code>Ubot Sultan</code></blockquote>\n\nKetik /cancel untuk membatalkan.', {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard,
    });

    let newName;
    try {
      newName = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    if (newName.length > 30) {
      await ctx.reply('❌ Nama terlalu panjang! Maksimal 30 karakter. Pengaturan dibatalkan.');
      return;
    }

    // Save to DB
    const { updateUserbotFeature } = await import('../database/db.js');
    updateUserbotFeature(telegramId, 'custom_name', newName);

    await ctx.reply(`✅ <b>Nama Ubot berhasil diperbarui menjadi:</b>\n<blockquote>"${newName}"</blockquote>`, { parse_mode: 'HTML' });
    
    await ctx.reply('Gunakan `/menu` untuk kembali ke Panel Kontrol Utama.');

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      console.error('Error in custom name conversation:', error);
      await ctx.reply('❌ Terjadi kesalahan sistem. Gagal mengubah nama ubot.');
    }
  }
}
