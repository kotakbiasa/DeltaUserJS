import { InputFile } from 'grammy';
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

/**
 * Conversation handler for QR Code Registration via mtcute
 */
export async function qrRegistrationConversation(conversation: any, ctx: any) {
  const telegramId = ctx.from.id;
  const chatId = ctx.chat.id;

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

    let twoFaDeferredPassword: ((pwd: string) => void) | null = null;
    let twoFaReject: ((err: any) => void) | null = null;

    const qrResult = await conversation.external({
      task: async (outsideCtx: any) => {
        const client = getOrCreateClient(telegramId);
        activeRegClients.set(telegramId, client);

        let qrImageMessageId: number | null = null;
        let isScanned = false;

        const sessionState = activeQrSessions.get(telegramId);
        const signal = sessionState?.abortController?.signal || abortController.signal;

        const loginPromise = client.start({
          qrCodeHandler: async (url: string) => {
            if (signal.aborted) return;
            try {
              const qrBuffer = await qrcode.toBuffer(url, { scale: 8 });

              if (qrImageMessageId) {
                try {
                  await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
                } catch {
                  // ignore
                }
              }

              if (signal.aborted) return;

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
            } catch (qrErr: any) {
              if (!signal.aborted) {
                Logger.logUser(telegramId, `Error generating/sending QR: ${qrErr.message}`, 'ERROR');
              }
            }
          },
          password: () => {
            isScanned = true;
            return new Promise<string>((resolve, reject) => {
              twoFaDeferredPassword = resolve;
              twoFaReject = reject;
            });
          },
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 120000)
        );

        let result: { status: string; sessionString?: string; phone?: string | null; customName?: string };

        try {
          // If 2FA triggers, start() hangs until password() resolves
          // We race against timeout or 2FA signal
          await Promise.race([
            loginPromise,
            timeoutPromise,
            new Promise((resolve) => {
              const check2Fa = setInterval(() => {
                if (twoFaDeferredPassword) {
                  clearInterval(check2Fa);
                  resolve('2fa_needed');
                }
              }, 300);
            }),
          ]);

          if (twoFaDeferredPassword) {
            isScanned = true;
            result = { status: '2fa_needed' };
          } else {
            isScanned = true;
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
        } catch (e: any) {
          if (signal.aborted || e.name === 'AbortError' || e.message?.includes('aborted')) {
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
      beforeStore: (data: any) => data,
      afterLoad: (data: any) => data,
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
        if (twoFaReject) twoFaReject(new Error('USER_CANCELLED'));
        await cleanupClient(telegramId);
        await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali.</p>`);
        return;
      }

      const password = pwdText;

      const pwdAuthResult = await conversation.external(async () => {
        const activeClient = activeRegClients.get(telegramId);
        if (!activeClient || !twoFaDeferredPassword) {
          return { status: 'error', error: 'Sesi client 2FA tidak ditemukan.' };
        }

        try {
          twoFaDeferredPassword(password);
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
        } catch (err: any) {
          Logger.logUser(telegramId, `[2FA] Password salah: ${err.message}`, 'WARN');
          return { status: 'wrong_password', error: err.message };
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

    // Simpan session string ke MongoDB
    await conversation.external(async () => {
      await saveUserbotSession(
        telegramId,
        qrResult.phone || '00000',
        qrResult.sessionString
      );
      await userbotManager.startUserbot(telegramId, qrResult.sessionString);
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
  } catch (error: any) {
    await cleanupClient(telegramId);
    if (error.message === 'USER_CANCELLED') {
      return;
    }
    if (error.message === 'TIMEOUT') {
      await replyRich(
        ctx,
        `<h1 align="center">⏱️ Waktu Scan QR Habis</h1><p>Waktu 2 menit telah habis. Silakan ulangi dengan klik /daftar.</p>`
      );
      return;
    }
    Logger.logUser(telegramId, `Error dalam QR Registration: ${error.message}`, 'ERROR');
    await replyRich(
      ctx,
      `<h1 align="center">❌ Terjadi Kesalahan</h1><p>Gagal menghubungkan userbot: <code>${escapeHtml(error.message)}</code></p><p>Silakan coba lagi beberapa saat lagi dengan /daftar.</p>`
    );
  }
}
