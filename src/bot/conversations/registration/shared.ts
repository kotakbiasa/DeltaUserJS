import { InlineKeyboard } from 'grammy';
import { replyRich } from '../../../utils/richMessage.js';
import { TelegramClient, Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import config from '../../../config.js';

declare module 'teleproto' {
  interface TelegramClient {
    signIn(opts: {
      phoneNumber: string;
      phoneCodeHash: string;
      phoneCode: string;
      password?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }): Promise<{ user: any }>;
    signInWithPassword(
      api: { apiId: number; apiHash: string },
      opts: { password: () => Promise<string> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<{ user: any }>;
  }
}

export const cancelKeyboard = new InlineKeyboard().text('❌ Batal', 'cancel_reg');

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
    if (result instanceof Api.auth.AuthorizationSignUpRequired) {
      throw new Error('NOMOR_BELUM_TERDAFTAR: Nomor ini belum terdaftar di Telegram. Silakan buat akun Telegram terlebih dahulu di aplikasi resmi.');
    }
    return result.user;
  }
};

// Global map to track active registration clients
export const activeRegClients = new Map(); // userId -> GramJS TelegramClient

// Global map to track active QR login sessions with AbortController
export const activeQrSessions = new Map<number, {
  abortController: AbortController;
  chatId: number;
  qrMessageId?: number;
}>();

/**
 * Abort active QR login process instantly and remove QR images from chat
 */
type TelegramDeleteApi = {
  deleteMessage: (chatId: number, messageId: number) => Promise<unknown>;
};

export async function abortActiveQr(telegramId: number, api?: TelegramDeleteApi) {
  const session = activeQrSessions.get(telegramId);
  if (session) {
    try { session.abortController.abort(); } catch (_) { /* ignore */ }
    if (session.qrMessageId && api) {
      try { await api.deleteMessage(session.chatId, session.qrMessageId); } catch (_) { /* ignore */ }
    }
    activeQrSessions.delete(telegramId);
  }
}

// Global map untuk menyimpan state OTP sementara antar replay Grammy
// Kunci: telegramId, Nilai: { phoneCodeHash, isCodeViaApp }
export const pendingOtpState = new Map();

/**
 * Helper: Buat GramJS client baru dan simpan di activeRegClients
 * Dipanggil DILUAR external() agar client selalu tersedia di runtime.
 */
export function getOrCreateClient(telegramId, phoneNumber) {
  let client = activeRegClients.get(telegramId);
  if (client) {return client;}

  const session = new StringSession('');
  // Preset DC 5 untuk nomor Indonesia dengan port 443 (standar MTProto TLS)
  if (phoneNumber && phoneNumber.startsWith('+62')) {
    session.setDC(5, '91.108.56.121', 443);
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
export async function ensureConnected(client) {
  if (!client.connected) {
    await client.connect();
  }
}

/**
 * Helper: Bersihkan client dari map dan disconnect
 */
export async function cleanupClient(telegramId) {
  const client = activeRegClients.get(telegramId);
  activeRegClients.delete(telegramId);
  pendingOtpState.delete(telegramId);
  if (client) {
    try {
      await client.disconnect();
    } catch (_e) { /* ignore: already disconnected */ }
  }
}

/**
 * Helper to wait for either text input or cancellation button
 * Grammy v2: waitFor() dengan array filter query = OR logic.
 * ['message:text', 'callback_query:data'] artinya cocokkan SALAH SATU.
 */
export async function waitForInput(conversation, ctx) {
  const result = await conversation.waitFor(['message:text', 'callback_query:data']);

  const cbData = result.callbackQuery?.data;
  const textMsg = result.message?.text?.trim().toLowerCase();

  if (cbData === 'cancel' || cbData === 'cancel_reg' || cbData === 'cancel_qr' || textMsg === '/cancel') {
    if (result.callbackQuery) {
      try { await result.answerCallbackQuery('Pendaftaran dibatalkan.'); } catch (_) { /* ignore */ }
      try { await result.deleteMessage(); } catch (_) { /* ignore */ }
    }
    await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali ke Menu Utama.</p>`);
    throw new Error('USER_CANCELLED');
  }

  if (!result.message?.text) {
    throw new Error('USER_CANCELLED');
  }

  // Berikan reaksi 👍 pada pesan yang dikirim pengguna sebagai indikasi bot memprosesnya
  try {
    await result.react('👍');
  } catch (_e) { /* ignore: reaction may fail */ }

  return result.message.text.trim();
}
