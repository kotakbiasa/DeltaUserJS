import { InlineKeyboard } from 'grammy';
import type { BotContext, BotConversation } from '../../context.js';
import { replyRich } from '../../../utils/richMessage.js';
import { TelegramClient } from '@mtcute/node';
import { MemoryStorage } from '@mtcute/core';
import config from '../../../config.js';

export const cancelKeyboard = new InlineKeyboard().text('❌ Batal', 'cancel_reg');

// Global map to track active registration clients
export const activeRegClients = new Map<number, TelegramClient>(); // userId -> mtcute TelegramClient

// Global map to track active QR login sessions with AbortController
export const activeQrSessions = new Map<
  number,
  {
    abortController: AbortController;
    chatId: number;
    qrMessageId?: number;
  }
>();

type TelegramDeleteApi = {
  deleteMessage: (chatId: number, messageId: number) => Promise<unknown>;
};

export async function abortActiveQr(telegramId: number, api?: TelegramDeleteApi) {
  const session = activeQrSessions.get(telegramId);
  if (session) {
    try {
      session.abortController.abort();
    } catch {
      // ignore
    }
    if (session.qrMessageId && api) {
      try {
        await api.deleteMessage(session.chatId, session.qrMessageId);
      } catch {
        // ignore
      }
    }
    activeQrSessions.delete(telegramId);
  }
}

// Global map untuk menyimpan state OTP sementara antar replay Grammy
// Kunci: telegramId, Nilai: { phoneCodeHash, isCodeViaApp }
export const pendingOtpState = new Map<
  number,
  {
    phoneCodeHash: string;
    isCodeViaApp?: boolean;
  }
>();

/**
 * Helper: Buat mtcute TelegramClient baru dan simpan di activeRegClients
 */
export function getOrCreateClient(telegramId: number, _phoneNumber?: string): TelegramClient {
  let client = activeRegClients.get(telegramId);
  if (client) {return client;}

  const storage = new MemoryStorage();
  client = new TelegramClient({
    apiId: config.apiId,
    apiHash: config.apiHash,
    storage,
    initConnectionOptions: {
      deviceModel: 'Chrome 147',
      systemVersion: 'Android 11',
      appVersion: '2.2 K',
      langCode: 'id',
      systemLangCode: 'id-ID',
    },
  });
  activeRegClients.set(telegramId, client);
  return client;
}

/**
 * Helper: Pastikan client terhubung
 */
export async function ensureConnected(client: TelegramClient) {
  try {
    await client.connect();
  } catch (err: unknown) {
    if (!String(err).includes('already connected')) {
      throw err;
    }
  }
}

/**
 * Helper: Bersihkan client dari map dan disconnect
 */
export async function cleanupClient(telegramId: number) {
  const client = activeRegClients.get(telegramId);
  activeRegClients.delete(telegramId);
  pendingOtpState.delete(telegramId);
  if (client) {
    try {
      await client.destroy();
    } catch {
      // ignore
    }
  }
}

/**
 * Helper to wait for either text input or cancellation button
 */
export async function waitForInput(conversation: BotConversation, ctx: BotContext): Promise<string> {
  const result = await conversation.waitFor(['message:text', 'callback_query:data']);

  const cbData = result.callbackQuery?.data;
  const textMsg = result.message?.text?.trim().toLowerCase();

  if (cbData === 'cancel' || cbData === 'cancel_reg' || cbData === 'cancel_qr' || textMsg === '/cancel') {
    if (result.callbackQuery) {
      try {
        await result.answerCallbackQuery('Pendaftaran dibatalkan.');
      } catch {
        // ignore
      }
      try {
        await result.deleteMessage();
      } catch {
        // ignore
      }
    }
    await replyRich(
      ctx,
      `<p><b>❌ Aksi dibatalkan.</b><br>Pendaftaran dibatalkan. Ketik /menu untuk kembali ke Menu Utama.</p>`
    );
    throw new Error('USER_CANCELLED');
  }

  if (!result.message?.text) {
    throw new Error('USER_CANCELLED');
  }

  try {
    await result.react('👍');
  } catch {
    // ignore
  }

  return result.message.text.trim();
}
