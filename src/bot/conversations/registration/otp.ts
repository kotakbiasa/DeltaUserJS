import { InlineKeyboard } from 'grammy';
import { replyRich } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import config from '../../../config.js';
import { saveUserbotSession } from '../../../infrastructure/database.js';
import userbotManager from '../../../userbot/engine/manager.js';
import { isApproved, hasAcceptedTerms } from '../../state/approvedUsers.js';
import {
  cancelKeyboard,
  activeRegClients,
  pendingOtpState,
  getOrCreateClient,
  ensureConnected,
  cleanupClient,
  waitForInput,
} from './shared.js';

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

  if (telegramId !== Number(config.ownerId) && !isApproved(telegramId)) {
    await replyRich(ctx, `<p>🔒 Pendaftaran userbot membutuhkan persetujuan owner.<br>Silakan ajukan <b>🎁 Request Coba Gratis</b> di menu utama terlebih dahulu.</p>`);
    return;
  }

  if (!hasAcceptedTerms(telegramId)) {
    await replyRich(ctx, `<p>⚠️ Anda harus menyetujui <b>Syarat &amp; Ketentuan Layanan</b> terlebih dahulu sebelum menghubungkan akun.<br>Ketik <code>/daftar</code> atau buka menu untuk menyetujui.</p>`);
    return;
  }

  try {
    await replyRich(ctx, `<h1 align="center">📱 Pendaftaran via OTP</h1>` +
      `<table bordered striped><caption>📋 Langkah</caption>` +
      `<tr><th>#</th><th>Aksi</th></tr>` +
      `<tr><td align="center">1</td><td>Kirim nomor HP (format internasional / 08xx)</td></tr>` +
      `<tr><td align="center">2</td><td>Masukkan kode OTP yang diterima</td></tr>` +
      `<tr><td align="center">3</td><td>Selesai — userbot aktif 🎉</td></tr>` +
      `</table>` +
      `<p>Silakan kirimkan nomor HP Anda, contoh: <code>+628123456789</code> atau <code>08123456789</code></p>`, { reply_markup: cancelKeyboard, });

    // Step 1: Wait for phone number
    let phoneNumber;
    try {
      phoneNumber = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {return;}
      throw err;
    }

    // 🧹 Auto-format Phone Number:
    // Bersihkan karakter non-digit kecuali tanda plus
    if (phoneNumber) {
      let cleaned = phoneNumber.replace(/[^0-9+]/g, '');
      if (cleaned.startsWith('08')) {
        cleaned = '+628' + cleaned.slice(2);
      } else if (cleaned.startsWith('628')) {
        cleaned = '+' + cleaned;
      } else if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
      }
      phoneNumber = cleaned;
    }

    // Validate phone number format (must start with + and at least 9 digits)
    if (!phoneNumber.startsWith('+') || phoneNumber.length < 9) {
      await replyRich(ctx, `<h1 align="center">❌ Format nomor HP salah!</h1><p>Harus berupa nomor telepon valid dengan kode negara (contoh: <code>+628xxx</code> atau <code>08xxx</code>). Silakan ulangi dengan klik /daftar.</p>`, {  });
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
        const result = await client.sendCode(
          { apiId: config.apiId, apiHash: config.apiHash },
          phoneNumber
        );
        Logger.logUser(telegramId, `[OTP] Kode terkirim. isCodeViaApp=${result.isCodeViaApp}, hash=${result.phoneCodeHash?.slice(0, 8)}...`, 'INFO');

        // Simpan ke pendingOtpState agar replay tidak membuat client baru
        const state = { phoneCodeHash: result.phoneCodeHash, isCodeViaApp: result.isCodeViaApp };
        pendingOtpState.set(telegramId, state);

        // Return HANYA plain serializable data
        return state;
      });
      phoneCodeHash = initResult.phoneCodeHash;
      isCodeViaApp = initResult.isCodeViaApp;
    } catch (err) {
      Logger.logUser(telegramId, `[OTP] Error saat init/sendCode: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await replyRich(ctx, `❌ <b>Gagal mengirim OTP:</b><br><p>${err instanceof Error ? err.message : String(err)}</p><br>Silakan ulangi <code>/daftar</code>.`);
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
          `<p>⚠️ Kode berlaku <b>2 menit</b>. Jika tidak muncul, klik "Kirim Ulang via SMS".</p>`
        : `<table bordered striped><caption>💬 Kode via SMS</caption>` +
          `<tr><th>Langkah</th><th>Aksi</th></tr>` +
          `<tr><td>1</td><td>Cek SMS di nomor <code>${phoneNumber}</code></td></tr>` +
          `<tr><td>2</td><td>Salin kode 5 digit dari SMS</td></tr>` +
          `</table>` +
          `<p>⚠️ Kode berlaku <b>2 menit</b>. Segera masukkan!</p>`;
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

        if (cbData === 'cancel' || cbData === 'cancel_reg' || cbData === 'cancel_qr' || inputResult.message?.text?.trim().toLowerCase() === '/cancel') {
          if (inputResult.callbackQuery) {
            try { await inputResult.answerCallbackQuery('Pendaftaran dibatalkan.'); } catch (_e) { /* ignore */ }
            try { await inputResult.deleteMessage(); } catch (_e) { /* ignore */ }
          }
          await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali ke Menu Utama.</p>`);
          return;
        }

        if (cbData === 'otp_resend_sms') {
          await inputResult.answerCallbackQuery('Mengirim ulang via SMS...');
          try {
            const resendResult = await conversation.external(async () => {
              const activeClient = activeRegClients.get(telegramId);
              if (!activeClient) {throw new Error('Client tidak ditemukan. Ulangi /daftar.');}
              await ensureConnected(activeClient);
              Logger.logUser(telegramId, `[OTP] Resend via SMS ke ${phoneNumber}...`, 'INFO');
              const r = await activeClient.sendCode(
                { apiId: config.apiId, apiHash: config.apiHash },
                phoneNumber,
                true // forceSMS
              );
              Logger.logUser(telegramId, `[OTP] SMS terkirim. phoneCodeHash=${r.phoneCodeHash?.slice(0, 8)}...`, 'INFO');
              // Update pending state
              pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp });
              return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: r.isCodeViaApp };
            });
            phoneCodeHash = resendResult.phoneCodeHash;
          } catch (e) {
            Logger.logUser(telegramId, `[OTP] Gagal resend SMS: ${e.message}`, 'ERROR');
            await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Gagal mengirim ulang via SMS: ${e.message}</p>`);
          }
          await replyRich(ctx, '💬 <b>Kode OTP dikirim ulang via SMS.</b>\n\n<p>Cek SMS masuk di nomor <code>' + phoneNumber + '</code>.<br>⏱️ Segera masukkan kode di sini (berlaku 2 menit).</p>\n\n🛡️ <b>PENTING:</b> Ketik kode dengan <b>spasi</b> antar digit.\n<i>Contoh: <code>12345</code> → ketik <code>1 2 3 4 5</code></i>', { reply_markup: buildOtpKeyboard(false) });
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
        if (!activeClient) {return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };}
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
        } catch (err) {
          const errMsg = err.errorMessage || err.message || '';
          Logger.logUser(telegramId, `[OTP] signIn error (percobaan ${attemptCount}): ${errMsg}`, 'ERROR');
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
            await replyRich(ctx, `<h1 align="center">⚠️ Kode OTP kadaluarsa!</h1><p>Mengirim kode baru... (Percobaan ${attemptCount}/${MAX_ATTEMPTS})</p>`, {  });
            try {
              const resendResult = await conversation.external(async () => {
                const activeClient = activeRegClients.get(telegramId);
                if (!activeClient) {throw new Error('Client tidak ditemukan. Ulangi /daftar.');}
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
            } catch (resendErr) {
              Logger.logUser(telegramId, `[OTP] Gagal resend setelah expired: ${resendErr.message}`, 'ERROR');
              await replyRich(ctx, `❌ <b>Gagal mengirim kode baru:</b><br><p>${resendErr.message}</p><br>Silakan ulangi <code>/daftar</code>.`);
              return;
            }
          } else {
            await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Kode OTP terus kadaluarsa setelah ${MAX_ATTEMPTS}x percobaan.<br><br>Silakan ulangi <code>/daftar</code> dan masukkan kode dengan cepat.</p>`);
            return;
          }

      } else if (signInResult.status === '2fa_needed') {
        // 🔒 2FA Password needed
        await replyRich(ctx, `<h1 align="center">🔒 Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</h1><p>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</p>`, { reply_markup: cancelKeyboard, });
          let password;
          try {
            password = await waitForInput(conversation, ctx);
          } catch (pwdErr) {
            if (pwdErr.message === 'USER_CANCELLED') {return;}
            throw pwdErr;
          }
          // 2FA signIn — juga tangkap error di dalam external()
          const pwdResult = await conversation.external(async () => {
            const activeClient = activeRegClients.get(telegramId);
            if (!activeClient) {return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };}
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
            await replyRich(ctx, `❌ <b>Password 2FA salah:</b><br><p>${pwdResult.error}</p><br>Pendaftaran dibatalkan.`);
            return;
          }

      } else if (signInResult.status === 'code_invalid') {
        // ❌ Kode salah — minta input ulang (hash masih valid)
        if (attemptCount < MAX_ATTEMPTS) {
            await replyRich(ctx, `<h1 align="center">❌ Kode OTP salah!</h1><p>Pastikan kode yang dimasukkan benar dan belum kadaluarsa.<br><i>Percobaan ${attemptCount}/${MAX_ATTEMPTS}. Silakan coba lagi.</i></p>`, { reply_markup: buildOtpKeyboard(false), });
          } else {
            await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br><b>Kode OTP salah ${MAX_ATTEMPTS}x.</b><br><br>Pendaftaran dibatalkan. Silakan ulangi <code>/daftar</code>.</p>`);
            return;
          }

      } else {
        // ❌ Error tidak dikenal
        await replyRich(ctx, `❌ <b>Gagal login:</b><br><p>${signInResult.error || 'Unknown error'}</p><br>Pendaftaran dibatalkan.`);
        return;
      }
    }

    if (!signInDone || !sessionString) {
      await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Gagal login setelah ${MAX_ATTEMPTS}x percobaan. Silakan ulangi <code>/daftar</code>.</p>`);
      return;
    }

    // Step 6: Save session on success
    // Session string sudah didapat dari dalam external() di atas
    await saveUserbotSession(telegramId, phoneNumber, sessionString);

    await replyRich(ctx, `<h1 align="center">✨ Pendaftaran Berhasil!</h1><p>⏳ Mengaktifkan userbot Anda...</p>`, {  });

    // Start userbot in manager
    await conversation.external(async () => {
      await userbotManager.startUserbot(telegramId, sessionString);
    });

    await replyRich(ctx, `<h1 align="center">🟢 Userbot AKTIF!</h1>` +
      `<table bordered striped><caption>🎉 Akun Berhasil Didaftarkan</caption>` +
      `<tr><th>Item</th><th>Detail</th></tr>` +
      `<tr><td>Status</td><td align="center">🟢 Aktif</td></tr>` +
      `<tr><td>Nomor HP</td><td align="center"><code>${phoneNumber}</code></td></tr>` +
      `<tr><td>ID Telegram</td><td align="center"><code>${telegramId}</code></td></tr>` +
      `</table>` +
      `<footer>💡 Coba kirim <code>.ping</code> di chat mana pun — userbot akan membalas <b>Pong</b>!</footer>`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' }],
            [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
          ]
        }
      });

  } catch (error) {
    const isCancelled = error.message === 'USER_CANCELLED' ||
                        error.message?.includes('disconnected') ||
                        error.message?.includes('disconnect') ||
                        error.message?.includes('Closed') ||
                        error.message?.includes('connection');

    if (!isCancelled) {
      Logger.logUser(telegramId, `Error in OTP registration conversation: ${error.message}`, 'ERROR');
      await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem saat pendaftaran. Silakan coba lagi nanti.</p>`);
    }
  } finally {
    await cleanupClient(telegramId);
  }
}
