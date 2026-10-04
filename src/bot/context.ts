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

/**
 * `ctx.from` dideklarasikan non-opsional di sini, dan itu DIJAMIN saat runtime
 * oleh middleware pertama di `bot/index.ts` yang membuang update tanpa `from`
 * (channel post, poll, dsb.) sebelum handler mana pun berjalan. Bot ini memang
 * hanya melayani interaksi langsung dari user, jadi update seperti itu tidak
 * punya handler sama sekali.
 *
 * Tanpa jaminan tersebut, `strictNullChecks` menuntut ~110 pemeriksaan null
 * yang semuanya tidak mungkin terjadi — dan pemeriksaan basa-basi semacam itu
 * justru menyamarkan kasus null yang sungguhan.
 */
export type BotContext = ConversationFlavor<Context & SessionFlavor<BotSession>> & {
  from: NonNullable<Context['from']>;
};

/** Parameter pertama setiap conversation. */
export type BotConversation = Conversation<BotContext, BotContext>;
