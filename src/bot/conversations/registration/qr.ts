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
  ensureConnected,
  waitForInput,
} from './shared.js';
import { errorMessage, errorName, isRpcError } from '../../../utils/errors.js';
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
        `<blockquote>💡 <b>Catatan Keamanan:</b> Disarankan akun Telegram berusia minimal 6 bulan – 1 tahun demi menghindari limit/ban otomatis.</blockquote>` +
        `<footer>⏱️ Anda punya waktu <b>2 menit</b> untuk memindai.</footer>`,
      { reply_markup: cancelKeyboard }
    );

    const qrResult = await conversation.external({
      task: async (outsideCtx: Context) => {
        const client = getOrCreateClient(telegramId);
        activeRegClients.set(telegramId, client);
        await ensureConnected(client);

        let qrImageMessageId: number | null = null;

        const sessionState = activeQrSessions.get(telegramId);
        const signal = sessionState?.abortController?.signal || abortController.signal;

        let result: QrTaskResult;

        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 120000)
          );

          const signInPromise = client.signInQr({
            onUrlUpdated: async (url: string) => {
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
            abortSignal: signal,
          });

          const user = await Promise.race([signInPromise, timeoutPromise]);

          const sessionString = await client.exportSession();
          const phone = user?.phoneNumber
            ? (user.phoneNumber.startsWith('+') ? user.phoneNumber : `+${user.phoneNumber}`)
            : null;
          const customName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined;

          try {
            await client.destroy();
          } catch {
            // ignore
          }
          activeRegClients.delete(telegramId);
          activeQrSessions.delete(telegramId);
          result = { status: 'success', sessionString, phone, customName };
        } catch (e: unknown) {
          if (signal.aborted || errorName(e) === 'AbortError' || errorMessage(e).includes('aborted')) {
            throw new Error('USER_CANCELLED', { cause: e });
          }
          const errMsg = errorMessage(e);
          if (
            errMsg.includes('SESSION_PASSWORD_NEEDED') ||
            errorName(e) === 'SessionPasswordNeededError' ||
            isRpcError(e, 'SESSION_PASSWORD_NEEDED')
          ) {
            // JANGAN destroy client di sini! Biarkan di activeRegClients agar checkPassword dapat dipanggil
            result = { status: '2fa_needed' };
          } else {
            throw e;
          }
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

      let password: string;
      try {
        password = await waitForInput(conversation, ctx);
      } catch (pwdErr: unknown) {
        await cleanupClient(telegramId);
        if (errorMessage(pwdErr) === 'USER_CANCELLED') {return;}
        throw pwdErr;
      }

      const pwdAuthResult = await conversation.external(async () => {
        const activeClient = activeRegClients.get(telegramId);
        if (!activeClient) {
          return { status: 'error', error: 'Sesi client 2FA tidak ditemukan. Silakan ulangi dengan /daftar.' };
        }

        try {
          await ensureConnected(activeClient);
          await activeClient.checkPassword(password);
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
          const errText = errorMessage(err);
          if (errText.includes('PASSWORD_HASH_INVALID') || isRpcError(err, 'PASSWORD_HASH_INVALID')) {
            return { status: 'wrong_password', error: 'Password 2FA salah' };
          }
          return { status: 'error', error: errText };
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
