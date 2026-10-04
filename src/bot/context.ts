/**
 * Tipe context bersama untuk seluruh handler bot.
 *
 * Bot memasang `session()` dan `conversations()`, jadi `Context` polos dari
 * grammY tidak cukup: handler membaca `ctx.session` dan `ctx.conversation`.
 */
import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor, Conversation } from '@grammyjs/conversations';

/** Isi session saat ini bebas-bentuk (initial: () => ({})). */
export type BotSession = Record<string, unknown>;

export type BotContext = ConversationFlavor<Context & SessionFlavor<BotSession>>;

/** Parameter pertama setiap conversation. */
export type BotConversation = Conversation<BotContext, BotContext>;
