import { InlineKeyboard } from 'grammy';
import type { BotContext, BotConversation } from '../../context.js';
import { escapeHtml, replyRich } from '../../../utils/richMessage.js';
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
import { errorMessage, errorName, isRpcError, rpcErrorText } from '../../../utils/errors.js';

/**
 * Conversation handler for OTP Registration via mtcute
 */
export async function otpRegistrationConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from.id;

  if (telegramId !== Number(config.ownerId) && !isApproved(telegramId)) {
    await replyRich(
      ctx,
      `<p>🔒 Pendaftaran userbot membutuhkan persetujuan owner.<br>Silakan ajukan <b>🎁 Request Coba Gratis</b> di menu utama terlebih dahulu.</p>`
    );
    return;
  }

  if (!hasAcceptedTerms(telegramId)) {
    await replyRich(
      ctx,
      `<p>⚠️ Anda harus menyetujui <b>Syarat &amp; Ketentuan Layanan</b> terlebih dahulu sebelum menghubungkan akun.<br>Ketik <code>/daftar</code> atau buka menu untuk menyetujui.</p>`
    );
    return;
  }

  try {
    await replyRich(
      ctx,
      `<h1 align="center">📱 Pendaftaran via OTP</h1>` +
        `<table bordered striped><caption>📋 Langkah</caption>` +
        `<tr><th>#</th><th>Aksi</th></tr>` +
        `<tr><td align="center">1</td><td>Kirim nomor HP (format internasional / 08xx)</td></tr>` +
        `<tr><td align="center">2</td><td>Masukkan kode OTP yang diterima</td></tr>` +
        `<tr><td align="center">3</td><td>Selesai — userbot aktif 🎉</td></tr>` +
        `</table>` +
        `<blockquote>💡 <b>Catatan Keamanan:</b> Disarankan akun Telegram berusia minimal 6 bulan – 1 tahun demi menghindari limit/ban otomatis.</blockquote>` +
        `<p>Silakan kirimkan nomor HP Anda, contoh: <code>+628123456789</code> atau <code>08123456789</code></p>`,
      { reply_markup: cancelKeyboard }
    );

    // Step 1: Wait for phone number
    let phoneNumber: string;
    try {
      phoneNumber = await waitForInput(conversation, ctx);
    } catch (err: unknown) {
      if (errorMessage(err) === 'USER_CANCELLED') {return;}
      throw err;
    }

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

    if (!phoneNumber.startsWith('+') || phoneNumber.length < 9) {
      await replyRich(
        ctx,
        `<h1 align="center">❌ Format nomor HP salah!</h1><p>Harus berupa nomor telepon valid dengan kode negara (contoh: <code>+628xxx</code> atau <code>08xxx</code>). Silakan ulangi dengan klik /daftar.</p>`
      );
      return;
    }

    // Step 2+3: Connect + sendCode
    let phoneCodeHash: string;
    let isCodeViaApp = false;
    try {
      const initResult = await conversation.external(async () => {
        const existing = pendingOtpState.get(telegramId);
        if (existing && activeRegClients.has(telegramId)) {
          Logger.logUser(telegramId, '[OTP] Menggunakan hash yang sudah ada (resume dari checkpoint)', 'INFO');
          return { phoneCodeHash: existing.phoneCodeHash, isCodeViaApp: existing.isCodeViaApp ?? false };
        }

        const client = getOrCreateClient(telegramId, phoneNumber);
        await ensureConnected(client);

        const result = await client.sendCode({ phone: phoneNumber });
        if (!('phoneCodeHash' in result)) {
          throw new Error('Akun sudah dalam keadaan login.');
        }
        const viaApp = result.type === 'app';
        Logger.logUser(telegramId, `[OTP] Kode terkirim. type=${result.type}, hash=${result.phoneCodeHash.slice(0, 8)}...`, 'INFO');

        const state = { phoneCodeHash: result.phoneCodeHash, isCodeViaApp: viaApp };
        pendingOtpState.set(telegramId, state);
        return state;
      });
      phoneCodeHash = initResult.phoneCodeHash;
      isCodeViaApp = initResult.isCodeViaApp;
    } catch (err: unknown) {
      Logger.logUser(telegramId, `[OTP] Error saat init/sendCode: ${errorMessage(err)}`, 'ERROR');
      await replyRich(
        ctx,
        `❌ <b>Gagal mengirim OTP:</b><br><p>${escapeHtml(errorMessage(err))}</p><br>Silakan ulangi <code>/daftar</code>.`
      );
      return;
    }

    const buildOtpKeyboard = (showSmsBtn: boolean) => {
      const kb = new InlineKeyboard();
      if (showSmsBtn) {
        kb.text('💬 Kirim Ulang via SMS', 'otp_resend_sms').row();
      }
      kb.text('❌ Batalkan Pendaftaran', 'cancel_reg');
      return kb;
    };

    const showOtpPrompt = async (viaApp: boolean, isRetry = false) => {
      const prefix = isRetry ? '🔄 <b>Kode baru telah dikirim!</b>\n\n' : '';
      const antiShareTip =
        '\n\n🛡️ <b>PENTING:</b> Ketik kode dengan <b>spasi</b> antar digit agar tidak diblokir Telegram.\n<i>Contoh: kode <code>12345</code> → ketik <code>1 2 3 4 5</code></i>';
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
      await replyRich(ctx, prefix + info + antiShareTip + '\n\nKirimkan kode OTP di sini:', {
        reply_markup: buildOtpKeyboard(viaApp),
      });
    };

    await showOtpPrompt(isCodeViaApp);

    let signInDone = false;
    let attemptCount = 0;
    const MAX_ATTEMPTS = 3;
    let sessionString: string | null = null;

    while (!signInDone && attemptCount < MAX_ATTEMPTS) {
      attemptCount++;

      let otpCode: string | undefined;
      let waitingForOtp = true;
      while (waitingForOtp) {
        const inputResult = await conversation.waitFor(['message:text', 'callback_query:data']);
        const cbData = inputResult.callbackQuery?.data;

        if (
          cbData === 'cancel' ||
          cbData === 'cancel_reg' ||
          cbData === 'cancel_qr' ||
          inputResult.message?.text?.trim().toLowerCase() === '/cancel'
        ) {
          if (inputResult.callbackQuery) {
            try {
              await inputResult.answerCallbackQuery('Pendaftaran dibatalkan.');
            } catch {
              // ignore
            }
            try {
              await inputResult.deleteMessage();
            } catch {
              // ignore
            }
          }
          await replyRich(
            ctx,
            `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali ke Menu Utama.</p>`
          );
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
              const r = await activeClient.resendCode({ phone: phoneNumber, phoneCodeHash });
              pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: false });
              return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: false };
            });
            phoneCodeHash = resendResult.phoneCodeHash;
          } catch (e: unknown) {
            Logger.logUser(telegramId, `[OTP] Gagal resend SMS: ${errorMessage(e)}`, 'ERROR');
            await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Gagal mengirim ulang via SMS: ${escapeHtml(errorMessage(e))}</p>`);
          }
          await replyRich(
            ctx,
            '💬 <b>Kode OTP dikirim ulang via SMS.</b>\n\n<p>Cek SMS masuk di nomor <code>' +
              phoneNumber +
              '</code>.<br>⏱️ Segera masukkan kode di sini (berlaku 2 menit).</p>\n\n🛡️ <b>PENTING:</b> Ketik kode dengan <b>spasi</b> antar digit.\n<i>Contoh: <code>12345</code> → ketik <code>1 2 3 4 5</code></i>',
            { reply_markup: buildOtpKeyboard(false) }
          );
          continue;
        }

        otpCode = inputResult.message?.text?.trim();
        waitingForOtp = false;
      }

      if (otpCode) {
        otpCode = otpCode.replace(/[^0-9]/g, '');
      }

      const signInResult = await conversation.external(async () => {
        const activeClient = activeRegClients.get(telegramId);
        if (!activeClient) {return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };}
        await ensureConnected(activeClient);
        Logger.logUser(telegramId, `[OTP] Mencoba signIn... (percobaan ${attemptCount}/${MAX_ATTEMPTS})`, 'INFO');
        try {
          await activeClient.signIn({
            phone: phoneNumber,
            phoneCodeHash,
            phoneCode: otpCode!,
          });
          const sess = await activeClient.exportSession();
          return { status: 'success', sessionString: sess };
        } catch (err: unknown) {
          const errMsg = rpcErrorText(err);
          Logger.logUser(telegramId, `[OTP] signIn error (percobaan ${attemptCount}): ${errMsg}`, 'ERROR');
          if (errMsg.includes('SESSION_PASSWORD_NEEDED') || errorName(err) === 'SessionPasswordNeededError' || isRpcError(err, 'SESSION_PASSWORD_NEEDED')) {
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

      if (signInResult.status === 'success') {
        sessionString = signInResult.sessionString ?? null;
        signInDone = true;
      } else if (signInResult.status === 'code_expired') {
        if (attemptCount < MAX_ATTEMPTS) {
          await replyRich(
            ctx,
            `<h1 align="center">⚠️ Kode OTP kadaluarsa!</h1><p>Mengirim kode baru... (Percobaan ${attemptCount}/${MAX_ATTEMPTS})</p>`
          );
          try {
            const resendResult = await conversation.external(async () => {
              const activeClient = activeRegClients.get(telegramId);
              if (!activeClient) {throw new Error('Client tidak ditemukan. Ulangi /daftar.');}
              await ensureConnected(activeClient);
              Logger.logUser(telegramId, '[OTP] Resend kode baru karena expired...', 'INFO');
              const r = await activeClient.sendCode({ phone: phoneNumber });
              if (!('phoneCodeHash' in r)) {throw new Error('Akun sudah dalam keadaan login.');}
              const viaApp = r.type === 'app';
              pendingOtpState.set(telegramId, { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: viaApp });
              return { phoneCodeHash: r.phoneCodeHash, isCodeViaApp: viaApp };
            });
            phoneCodeHash = resendResult.phoneCodeHash;
            isCodeViaApp = resendResult.isCodeViaApp;
            await showOtpPrompt(isCodeViaApp, true);
          } catch (resendErr: unknown) {
            Logger.logUser(telegramId, `[OTP] Gagal resend setelah expired: ${errorMessage(resendErr)}`, 'ERROR');
            await replyRich(
              ctx,
              `❌ <b>Gagal mengirim kode baru:</b><br><p>${escapeHtml(errorMessage(resendErr))}</p><br>Silakan ulangi <code>/daftar</code>.`
            );
            return;
          }
        } else {
          await replyRich(
            ctx,
            `<p><b>❌ KESALAHAN</b><br>Kode OTP terus kadaluarsa setelah ${MAX_ATTEMPTS}x percobaan.<br><br>Silakan ulangi <code>/daftar</code> dan masukkan kode dengan cepat.</p>`
          );
          return;
        }
      } else if (signInResult.status === '2fa_needed') {
        await replyRich(
          ctx,
          `<h1 align="center">🔒 Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</h1><p>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</p>`,
          { reply_markup: cancelKeyboard }
        );
        let password: string;
        try {
          password = await waitForInput(conversation, ctx);
        } catch (pwdErr: unknown) {
          if (errorMessage(pwdErr) === 'USER_CANCELLED') {return;}
          throw pwdErr;
        }
        const pwdResult = await conversation.external(async () => {
          const activeClient = activeRegClients.get(telegramId);
          if (!activeClient) {return { status: 'error', error: 'Client tidak ditemukan. Ulangi /daftar.' };}
          await ensureConnected(activeClient);
          try {
            await activeClient.checkPassword(password);
            const sess = await activeClient.exportSession();
            return { status: 'success', sessionString: sess };
          } catch (err: unknown) {
            Logger.logUser(telegramId, `[OTP] 2FA signIn error: ${errorMessage(err)}`, 'ERROR');
            return { status: 'wrong_password', error: errorMessage(err) };
          }
        });

        if (pwdResult.status === 'wrong_password') {
          await replyRich(
            ctx,
            `<h1 align="center">❌ Password 2FA salah!</h1><p>Silakan ulangi proses pendaftaran dengan /daftar.</p>`
          );
          await cleanupClient(telegramId);
          return;
        }
        if (pwdResult.status === 'success') {
          sessionString = pwdResult.sessionString ?? null;
          signInDone = true;
        } else {
          await replyRich(
            ctx,
            `❌ <b>Autentikasi 2FA gagal:</b><br><p>${escapeHtml(pwdResult.error || 'Terjadi kesalahan')}</p><br>Silakan ulangi <code>/daftar</code>.`
          );
          await cleanupClient(telegramId);
          return;
        }
      } else if (signInResult.status === 'code_invalid') {
        const remaining = MAX_ATTEMPTS - attemptCount;
        if (remaining > 0) {
          await replyRich(
            ctx,
            `<h1 align="center">❌ Kode OTP salah!</h1><p>Sisa kesempatan: <b>${remaining}x</b>.<br>Silakan periksa kembali dan ketik dengan spasi antar digit.</p>`,
            { reply_markup: buildOtpKeyboard(isCodeViaApp) }
          );
        } else {
          await replyRich(
            ctx,
            `<p><b>❌ KESALAHAN</b><br>Kesempatan memasukkan kode telah habis (${MAX_ATTEMPTS}x salah).<br><br>Silakan ulangi <code>/daftar</code> dari awal.</p>`
          );
          await cleanupClient(telegramId);
          return;
        }
      } else {
        await replyRich(
          ctx,
          `❌ <b>Gagal login:</b><br><p>${escapeHtml(signInResult.error || 'Terjadi kesalahan')}</p><br>Silakan ulangi <code>/daftar</code>.`
        );
        await cleanupClient(telegramId);
        return;
      }
    }

    if (!sessionString) {
      await cleanupClient(telegramId);
      return;
    }

    // Step 6: Ambil info profil & simpan sesi
    const profileInfo = await conversation.external(async () => {
      const activeClient = activeRegClients.get(telegramId);
      let customName: string | undefined;
      let resolvedPhone = phoneNumber;
      if (activeClient) {
        try {
          const me = await activeClient.getMe();
          if (me?.phoneNumber) {
            resolvedPhone = me.phoneNumber.startsWith('+') ? me.phoneNumber : `+${me.phoneNumber}`;
          }
          customName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || undefined;
        } catch {
          // ignore
        }
      }
      return { phone: resolvedPhone, customName };
    });

    await cleanupClient(telegramId);

    await conversation.external(async () => {
      await saveUserbotSession(
        telegramId,
        profileInfo.phone,
        sessionString!
      );
      await userbotManager.startUserbot(telegramId, sessionString!);
    });

    Logger.logUser(telegramId, `Userbot berhasil terdaftar & aktif via OTP (mtcute) [${profileInfo.phone}]`, 'SUCCESS');

    await replyRich(
      ctx,
      `<h1 align="center">🎉 Selamat! Userbot Berhasil Aktif!</h1>` +
        `<p>Akun Telegram Anda telah terhubung dan siap digunakan.</p>` +
        `<blockquote>` +
        `<b>Nomor HP:</b> <code>${escapeHtml(profileInfo.phone)}</code><br>` +
        `<b>Status:</b> ✅ Aktif<br>` +
        `<b>Prefix default:</b> <code>.</code> (titik)` +
        `</blockquote>` +
        `<p>Coba kirimkan <code>.ping</code> di chat mana pun dari akun userbot Anda untuk menguji respon.</p>` +
        `<footer>Ketik /menu untuk membuka Menu Utama &amp; pengaturan userbot.</footer>`
    );
  } catch (error: unknown) {
    await cleanupClient(telegramId);
    if (errorMessage(error) === 'USER_CANCELLED') {return;}
    Logger.logUser(telegramId, `Error dalam OTP Registration: ${errorMessage(error)}`, 'ERROR');
    await replyRich(
      ctx,
      `<h1 align="center">❌ Terjadi Kesalahan</h1><p>Gagal menghubungkan userbot: <code>${escapeHtml(errorMessage(error))}</code></p><p>Silakan coba lagi beberapa saat lagi dengan /daftar.</p>`
    );
  }
}
