import { InputFile } from 'grammy';
import type { BotContext, BotConversation } from '../../context.js';
import { escapeHtml, replyRich } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import qrcode from 'qrcode';
import config from '../../../config.js';
import { saveUserbotSession } from '../../../infrastructure/database.js';
import userbotManager from '../../../userbot/engine/manager.js';
import { isApproved, hasAcceptedTerms } from '../../state/approvedUsers.js';
import {
  cancelKeyboard,
  activeRegClients,
  activeQrSessions,
  cleanupClient,
  getOrCreateClient,
} from './shared.js';
import { errorMessage, errorName } from '../../../utils/errors.js';
import type { Context } from 'grammy';

/**
 * Conversation handler for QR Code Registration via mtcute
 */
/** Hasil tahap login QR yang dioper keluar dari conversation.external(). */
type QrTaskResult = {
  status: string;
  sessionString?: string;
  phone?: string | null;
  customName?: string;
  error?: string;
};

export async function qrRegistrationConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from.id;
  const chatId = ctx.chat?.id ?? telegramId;

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
    const abortController = new AbortController();
    activeQrSessions.set(telegramId, {
      abortController,
      chatId,
    });

    await replyRich(
      ctx,
      `<h1 align="center">🔍 Pendaftaran via Scan QR Code</h1>` +
        `<table bordered striped><caption>📋 Langkah</caption>` +
        `<tr><th>#</th><th>Aksi</th></tr>` +
        `<tr><td align="center">1</td><td>QR Code muncul di bawah</td></tr>` +
        `<tr><td align="center">2</td><td>Buka Telegram → Settings → Devices</td></tr>` +
        `<tr><td align="center">3</td><td>Scan QR → userbot aktif 🎉</td></tr>` +
        `</table>` +
        `<footer>⏱️ Anda punya waktu <b>2 menit</b> untuk memindai.</footer>`,
      { reply_markup: cancelKeyboard }
    );

    // Disimpan dalam satu objek, bukan dua `let`. Keduanya hanya di-assign dari
    // dalam callback, dan dengan strictNullChecks TypeScript menyimpulkan
    // variabel `let` semacam itu selalu null — sehingga pemanggilannya ditandai
    // "not callable" meski sudah dijaga if.
    const twoFa: {
      resolve: ((pwd: string) => void) | null;
      reject: ((err: unknown) => void) | null;
    } = { resolve: null, reject: null };

    const qrResult = await conversation.external({
      task: async (outsideCtx: Context) => {
        const client = getOrCreateClient(telegramId);
        activeRegClients.set(telegramId, client);

        let qrImageMessageId: number | null = null;

        const sessionState = activeQrSessions.get(telegramId);
        const signal = sessionState?.abortController?.signal || abortController.signal;

        const loginPromise = client.start({
          qrCodeHandler: async (url: string) => {
            if (signal.aborted) {return;}
            try {
              const qrBuffer = await qrcode.toBuffer(url, { scale: 8 });

              if (qrImageMessageId) {
                try {
                  await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
                } catch {
                  // ignore
                }
              }

              if (signal.aborted) {return;}

              const qrMsg = await outsideCtx.api.sendPhoto(chatId, new InputFile(qrBuffer), {
                caption:
                  '📷 <b>SCAN QR CODE INI</b>\n\n' +
                  '1. Buka Telegram di HP Anda.\n' +
                  '2. Buka <b>Pengaturan > Perangkat > Hubungkan Perangkat</b>.\n' +
                  '3. Arahkan kamera HP ke QR Code di atas.\n\n' +
                  '⚠️ <i>QR Code ini berlaku selama 30 detik. Jika kedaluwarsa, bot akan otomatis mengirimkan QR Code yang baru.</i>',
                parse_mode: 'HTML',
                reply_markup: cancelKeyboard,
              });
              qrImageMessageId = qrMsg.message_id;
              if (sessionState) {
                sessionState.qrMessageId = qrImageMessageId;
              }
            } catch (qrErr: unknown) {
              if (!signal.aborted) {
                Logger.logUser(telegramId, `Error generating/sending QR: ${errorMessage(qrErr)}`, 'ERROR');
              }
            }
          },
          password: () => new Promise<string>((resolve, reject) => {
              twoFa.resolve = resolve;
              twoFa.reject = reject;
            }),
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 120000)
        );

        let result: QrTaskResult;

        try {
          // If 2FA triggers, start() hangs until password() resolves
          // We race against timeout or 2FA signal
          await Promise.race([
            loginPromise,
            timeoutPromise,
            new Promise((resolve) => {
              const check2Fa = setInterval(() => {
                if (twoFa.resolve) {
                  clearInterval(check2Fa);
                  resolve('2fa_needed');
                }
              }, 300);
            }),
          ]);

          if (twoFa.resolve) {
            result = { status: '2fa_needed' };
          } else {
            const sessionString = await client.exportSession();
            let phone: string | null = null;
            let customName: string | undefined;
            try {
              const me = await client.getMe();
              phone = me?.phoneNumber ? (me.phoneNumber.startsWith('+') ? me.phoneNumber : `+${me.phoneNumber}`) : null;
              customName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || undefined;
            } catch {
              // ignore
            }
            try {
              await client.destroy();
            } catch {
              // ignore
            }
            activeRegClients.delete(telegramId);
            activeQrSessions.delete(telegramId);
            result = { status: 'success', sessionString, phone, customName };
          }
        } catch (e: unknown) {
          if (signal.aborted || errorName(e) === 'AbortError' || errorMessage(e).includes('aborted')) {
            throw new Error('USER_CANCELLED', { cause: e });
          }
          throw e;
        } finally {
          if (qrImageMessageId) {
            try {
              await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
            } catch {
              // ignore
            }
          }
        }

        return result;
      },
      beforeStore: (data: QrTaskResult) => data,
      afterLoad: (data: QrTaskResult) => data,
    });

    // --- Handle 2FA jika diperlukan ---
    if (qrResult.status === '2fa_needed') {
      await replyRich(
        ctx,
        `<h1 align="center">🔒 Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</h1><p>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</p>`,
        { reply_markup: cancelKeyboard }
      );

      const pwdResult = await conversation.waitFor(['message:text', 'callback_query:data']);
      const pwdCb = pwdResult.callbackQuery?.data;
      const pwdText = pwdResult.message?.text?.trim();

      if (pwdCb === 'cancel' || pwdCb === 'cancel_reg' || pwdCb === 'cancel_qr' || pwdText?.toLowerCase() === '/cancel') {
        if (twoFa.reject) {twoFa.reject(new Error('USER_CANCELLED'));}
        await cleanupClient(telegramId);
        await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali.</p>`);
        return;
      }

      const password = pwdText;
      if (!password) {
        await replyRich(ctx, `<p><b>❌ Password 2FA kosong.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali.</p>`);
        if (twoFa.reject) {twoFa.reject(new Error('EMPTY_PASSWORD'));}
        await cleanupClient(telegramId);
        return;
      }

      const pwdAuthResult = await conversation.external(async () => {
        const activeClient = activeRegClients.get(telegramId);
        if (!activeClient || !twoFa.resolve) {
          return { status: 'error', error: 'Sesi client 2FA tidak ditemukan.' };
        }

        try {
          twoFa.resolve(password);
          const sessionString = await activeClient.exportSession();
          let phone: string | null = null;
          let customName: string | undefined;
          try {
            const me = await activeClient.getMe();
            phone = me?.phoneNumber ? (me.phoneNumber.startsWith('+') ? me.phoneNumber : `+${me.phoneNumber}`) : null;
            customName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || undefined;
          } catch {
            // ignore
          }

          try {
            await activeClient.destroy();
          } catch {
            // ignore
          }
          activeRegClients.delete(telegramId);
          activeQrSessions.delete(telegramId);
          return { status: 'success', sessionString, phone, customName };
        } catch (err: unknown) {
          Logger.logUser(telegramId, `[2FA] Password salah: ${errorMessage(err)}`, 'WARN');
          return { status: 'wrong_password', error: errorMessage(err) };
        }
      });

      if (pwdAuthResult.status === 'wrong_password') {
        await replyRich(
          ctx,
          `<h1 align="center">❌ Password 2FA salah!</h1><p>Silakan ulangi proses dengan klik /daftar.</p>`
        );
        await cleanupClient(telegramId);
        return;
      }

      if (pwdAuthResult.status !== 'success') {
        throw new Error(pwdAuthResult.error || 'Autentikasi 2FA gagal');
      }

      qrResult.sessionString = pwdAuthResult.sessionString;
      qrResult.phone = pwdAuthResult.phone;
      qrResult.customName = pwdAuthResult.customName;
    }

    if (!qrResult.sessionString) {
      throw new Error('Gagal mendapatkan sesi string dari QR login');
    }
    // Salin ke const: penyempitan di atas hilang begitu nilainya dibaca lagi
    // dari dalam closure conversation.external().
    const finalSession = qrResult.sessionString;
    const finalPhone = qrResult.phone || '00000';

    // Simpan session string ke MongoDB
    await conversation.external(async () => {
      await saveUserbotSession(
        telegramId,
        finalPhone,
        finalSession
      );
      await userbotManager.startUserbot(telegramId, finalSession);
    });

    Logger.logUser(telegramId, 'Userbot berhasil terdaftar & aktif via QR Code (mtcute)', 'SUCCESS');

    await replyRich(
      ctx,
      `<h1 align="center">🎉 Selamat! Userbot Berhasil Aktif!</h1>` +
        `<p>Akun Telegram Anda telah terhubung dan siap digunakan.</p>` +
        `<blockquote>` +
        `<b>Nomor HP:</b> <code>${escapeHtml(qrResult.phone || 'Terhubung via QR')}</code><br>` +
        `<b>Status:</b> ✅ Aktif<br>` +
        `<b>Prefix default:</b> <code>.</code> (titik)` +
        `</blockquote>` +
        `<p>Coba kirimkan <code>.ping</code> di chat mana pun dari akun userbot Anda untuk menguji respon.</p>` +
        `<footer>Ketik /menu untuk membuka Menu Utama &amp; pengaturan userbot.</footer>`
    );
  } catch (error: unknown) {
    await cleanupClient(telegramId);
    if (errorMessage(error) === 'USER_CANCELLED') {
      return;
    }
    if (errorMessage(error) === 'TIMEOUT') {
      await replyRich(
        ctx,
        `<h1 align="center">⏱️ Waktu Scan QR Habis</h1><p>Waktu 2 menit telah habis. Silakan ulangi dengan klik /daftar.</p>`
      );
      return;
    }
    Logger.logUser(telegramId, `Error dalam QR Registration: ${errorMessage(error)}`, 'ERROR');
    await replyRich(
      ctx,
      `<h1 align="center">❌ Terjadi Kesalahan</h1><p>Gagal menghubungkan userbot: <code>${escapeHtml(errorMessage(error))}</code></p><p>Silakan coba lagi beberapa saat lagi dengan /daftar.</p>`
    );
  }
}
