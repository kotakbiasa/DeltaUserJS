import { InputFile } from 'grammy';
import { replyRich } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import qrcode from 'qrcode';
import config from '../../../config.js';
import { saveUserbotSession } from '../../../infrastructure/database.js';
import userbotManager from '../../../userbot/engine/manager.js';
import { isApproved, hasAcceptedTerms } from '../../state/approvedUsers.js';
import {
  cancelKeyboard,
  activeRegClients,
  activeQrSessions,
  abortActiveQr,
  cleanupClient,
} from './shared.js';

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

  if (telegramId !== Number(config.ownerId) && !isApproved(telegramId)) {
    await replyRich(ctx, `<p>🔒 Pendaftaran userbot membutuhkan persetujuan owner.<br>Silakan ajukan <b>🎁 Request Coba Gratis</b> di menu utama terlebih dahulu.</p>`);
    return;
  }

  if (!hasAcceptedTerms(telegramId)) {
    await replyRich(ctx, `<p>⚠️ Anda harus menyetujui <b>Syarat &amp; Ketentuan Layanan</b> terlebih dahulu sebelum menghubungkan akun.<br>Ketik <code>/daftar</code> atau buka menu untuk menyetujui.</p>`);
    return;
  }

  try {
    const abortController = new AbortController();
    activeQrSessions.set(telegramId, {
      abortController,
      chatId,
    });

    await replyRich(ctx, `<h1 align="center">🔍 Pendaftaran via Scan QR Code</h1>` +
      `<table bordered striped><caption>📋 Langkah</caption>` +
      `<tr><th>#</th><th>Aksi</th></tr>` +
      `<tr><td align="center">1</td><td>QR Code muncul di bawah</td></tr>` +
      `<tr><td align="center">2</td><td>Buka Telegram → Settings → Devices</td></tr>` +
      `<tr><td align="center">3</td><td>Scan QR → userbot aktif 🎉</td></tr>` +
      `</table>` +
      `<footer>⏱️ Anda punya waktu <b>2 menit</b> untuk memindai.</footer>`, { reply_markup: cancelKeyboard, });

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

        const sessionState = activeQrSessions.get(telegramId);
        const signal = sessionState?.abortController?.signal || abortController.signal;

        // QR login with timeout and abortSignal
        const loginPromise = client.signInUserWithQrCode(
          {
            apiId: config.apiId,
            apiHash: config.apiHash,
          },
          {
            abortSignal: signal,
            qrCode: async (token) => {
              if (signal.aborted) {return;}
              try {
                const url = `tg://login?token=${token.token.toString('base64url')}`;
                const qrBuffer = await qrcode.toBuffer(url, { scale: 8 });

                // Hapus QR code sebelumnya
                if (qrImageMessageId) {
                  try {
                    await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
                  } catch (_e) { /* ignore: may be already deleted */ }
                }

                if (signal.aborted) {return;}

                const qrMsg = await outsideCtx.api.sendPhoto(chatId, new InputFile(qrBuffer), {
                  caption: '📷 <b>SCAN QR CODE INI</b>\n\n' +
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
              } catch (qrErr) {
                if (!signal.aborted) {
                  Logger.logUser(telegramId, `Error generating/sending QR: ${qrErr.message}`, 'ERROR');
                }
              }
            },
            onError: (err) => {
              if (!isScanned && !signal.aborted) {
                Logger.logUser(telegramId, `QR Sign-in Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
              }
            }
          }
        );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 120000)
        );

        let result;
        try {
          await Promise.race([loginPromise, timeoutPromise]);
          isScanned = true;
          result = { status: 'success' };
        } catch (e) {
          if (signal.aborted || e.name === 'AbortError' || e.message?.includes('aborted')) {
            throw new Error('USER_CANCELLED', { cause: e });
          }
          if (e.message?.includes('Account has 2FA enabled') || e.message === 'SESSION_PASSWORD_NEEDED') {
            isScanned = true;
            result = { status: '2fa_needed' };
          } else {
            throw e;
          }
        } finally {
          // Bersihkan QR image
          if (qrImageMessageId) {
            try {
              await outsideCtx.api.deleteMessage(chatId, qrImageMessageId);
            } catch (_e) { /* ignore */ }
          }
        }

        if (result.status === '2fa_needed') {
          return { status: '2fa_needed' };
        }

        // Berhasil login tanpa 2FA - simpan session & profil
        const sessionString = client.session.save();
        let phone: string | null = null;
        let customName: string | undefined;
        try {
          const me: any = await client.getMe();
          phone = me?.phone ? (me.phone.startsWith('+') ? me.phone : `+${me.phone}`) : null;
          customName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || undefined;
        } catch (_) { /* ignore */ }

        // Disconnect client setelah session disimpan
        try {
          await client.disconnect();
        } catch (_e) { /* ignore */ }
        activeRegClients.delete(telegramId);
        activeQrSessions.delete(telegramId);

        return { status: 'success', sessionString, phone, customName };
      },
      // Data dari external() harus serializable - sessionString adalah string
      beforeStore: (data) => data,
      afterLoad: (data) => data,
    });

    // --- Handle 2FA jika diperlukan ---
    if (qrResult.status === '2fa_needed') {
      await replyRich(ctx, `<h1 align="center">🔒 Akun Anda menggunakan Verifikasi 2 Langkah (2FA).</h1><p>Silakan ketik <b>Password 2FA</b> Anda di bawah ini.</p>`, { reply_markup: cancelKeyboard, });

      const pwdResult = await conversation.waitFor(['message:text', 'callback_query:data']);
      const pwdCb = pwdResult.callbackQuery?.data;
      const pwdText = pwdResult.message?.text?.trim();

      if (pwdCb === 'cancel' || pwdCb === 'cancel_reg' || pwdCb === 'cancel_qr' || pwdText?.toLowerCase() === '/cancel') {
        cleanupClient(telegramId);
        await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali.</p>`);
        return;
      }

      const password = pwdText;

      const pwdAuthResult = await conversation.external(async () => {
        const activeClient = activeRegClients.get(telegramId);
        if (!activeClient) {return { status: 'error', error: 'Client hilang.' };}

        try {
          await activeClient.signInWithPassword({ apiId: config.apiId, apiHash: config.apiHash }, { password: async () => password });
          const sess = activeClient.session.save();
          let phone: string | null = null;
          let customName: string | undefined;
          try {
            const me: any = await activeClient.getMe();
            phone = me?.phone ? (me.phone.startsWith('+') ? me.phone : `+${me.phone}`) : null;
            customName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || undefined;
          } catch (_) { /* ignore */ }

          try { await activeClient.disconnect(); } catch (_e) { /* ignore */ }
          activeRegClients.delete(telegramId);
          activeQrSessions.delete(telegramId);
          return { status: 'success', sessionString: sess, phone, customName };
        } catch (err) {
          try { await activeClient.disconnect(); } catch (_e) { /* ignore */ }
          activeRegClients.delete(telegramId);
          activeQrSessions.delete(telegramId);
          return { status: 'error', error: err.message };
        }
      });

      if (pwdAuthResult.status !== 'success') {
        await replyRich(ctx, `❌ <b>Gagal login 2FA:</b><br><p>${pwdAuthResult.error}</p><br>Silakan ulangi dengan klik /daftar.`);
        return;
      }
      qrResult.sessionString = pwdAuthResult.sessionString;
      if (pwdAuthResult.phone) {qrResult.phone = pwdAuthResult.phone;}
      if (pwdAuthResult.customName) {qrResult.customName = pwdAuthResult.customName;}
    }

    // Save to Database
    await saveUserbotSession(telegramId, qrResult.phone || null, qrResult.sessionString);
    if (qrResult.customName) {
      const { updateUserbotFeature } = await import('../../../infrastructure/database.js');
      await updateUserbotFeature(telegramId, 'custom_name', qrResult.customName);
    }

    await replyRich(ctx, `<h1 align="center">✨ Pendaftaran Berhasil!</h1><p>⏳ Mengaktifkan userbot Anda...</p>`, {  });

    // Start userbot in manager
    await conversation.external(async () => {
      await userbotManager.startUserbot(telegramId, qrResult.sessionString);
    });

    await replyRich(ctx, `<h1 align="center">🟢 Userbot AKTIF!</h1>` +
      `<table bordered striped><caption>🎉 Akun Berhasil Didaftarkan</caption>` +
      `<tr><th>Item</th><th>Detail</th></tr>` +
      `<tr><td>Metode</td><td align="center">🔍 QR Code</td></tr>` +
      `<tr><td>Status</td><td align="center">🟢 Aktif</td></tr>` +
      (qrResult.phone ? `<tr><td>Nomor HP</td><td align="center"><code>${qrResult.phone}</code></td></tr>` : '') +
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
                        error.name === 'AbortError' ||
                        error.message?.includes('aborted') ||
                        error.message?.includes('disconnected') ||
                        error.message?.includes('disconnect') ||
                        error.message?.includes('Closed') ||
                        error.message?.includes('connection');

    if (!isCancelled) {
      if (error.message === 'TIMEOUT') {
        await replyRich(ctx, `<p>⏰ <b>Waktu pendaftaran habis (2 menit tanpa pemindaian).</b><br><br>Silakan ulangi <code>/daftar</code>.</p>`);
      } else {
        Logger.logUser(telegramId, `Error in QR registration conversation: ${error.message}`, 'ERROR');
        await replyRich(ctx, `❌ <b>Login QR Code gagal:</b><br><p>${error.message}</p><br>Silakan ulangi <code>/daftar</code>.`);
      }
    }
  } finally {
    await abortActiveQr(telegramId, ctx.api);
    await cleanupClient(telegramId);
  }
}
