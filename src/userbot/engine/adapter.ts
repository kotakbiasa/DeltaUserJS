import type { EntityLike, MessageEditOptions, UserbotMessageLike, UserbotEntityLike } from '../types.js';
import type { CompatClient } from './compatClient.js';
import { toPeer } from './compatClient.js';
import type { Message } from '@mtcute/core';

/**
 * Compatibility adapter wrapping an mtcute Message into DeltaUserJS UserbotMessageLike.
 * This ensures existing plugins run seamlessly on mtcute without requiring individual rewrites.
 */
export function createUserbotMessageAdapter(rawMsg: Message, client: CompatClient): UserbotMessageLike {
  let messageText = rawMsg.text || '';

  const adapter: UserbotMessageLike = {
    out: Boolean(rawMsg.isOutgoing),
    get message() {
      return messageText;
    },
    set message(val: string | undefined) {
      // `Message.text` mtcute read-only; teks yang diubah plugin disimpan di
      // state adapter saja (itu yang dibaca ulang lewat getter di atas).
      messageText = val || '';
    },
    id: rawMsg.id,
    chatId: rawMsg.chat?.id,
    peerId: rawMsg.chat?.id,
    senderId: rawMsg.sender?.id,
    // mtcute: info balasan ada di `replyToMessage` (RepliedMessageInfo), tidak
    // ada field `replyToMessageId`. Versi lama membaca nama yang tidak pernah
    // ada, jadi replyToMsgId/replyTo selalu undefined.
    replyToMsgId: rawMsg.replyToMessage?.id ?? undefined,
    replyTo: rawMsg.replyToMessage?.id
      ? {
        replyToMsgId: rawMsg.replyToMessage.id,
        replyToTopId: rawMsg.replyToMessage.threadId ?? undefined,
      }
      : undefined,
    // `Peer.type` hanya 'user' | 'chat'; jenis grup ada di `chatType`.
    // Perbandingan lama ('private'/'group'/'channel') tidak pernah cocok,
    // sehingga ketiga flag ini selalu false.
    isPrivate: rawMsg.chat?.type === 'user',
    isGroup: rawMsg.chat?.type === 'chat'
      && (rawMsg.chat.chatType === 'group' || rawMsg.chat.chatType === 'supergroup' || rawMsg.chat.chatType === 'gigagroup'),
    isChannel: rawMsg.chat?.type === 'chat' && rawMsg.chat.chatType === 'channel',
    date: rawMsg.date ? Math.floor(new Date(rawMsg.date).getTime() / 1000) : Math.floor(Date.now() / 1000),
    // Bentuknya beda (class MessageEntity vs objek polos), tapi pembaca lama
    // hanya mengakses offset/length/className secara defensif.
    entities: [...(rawMsg.entities ?? [])] as UserbotMessageLike['entities'],
    media: rawMsg.media as unknown as UserbotMessageLike['media'],

    async edit(options: MessageEditOptions) {
      const text = typeof options === 'string' ? options : String(options?.text ?? options?.message ?? '');
      messageText = text;
      return await client.editMessage({
        chat: rawMsg.chat.id,
        id: rawMsg.id,
        text,
        parseMode: options?.parseMode || 'html',
        linkPreview: options?.linkPreview,
      });
    },

    async reply(options: { message?: string; text?: string; parseMode?: string } & Record<string, unknown>) {
      const text = typeof options === 'string' ? options : (options?.message ?? options?.text ?? '');
      return await client.sendText(rawMsg.chat.id, text, {
        replyTo: rawMsg.id,
        parseMode: options?.parseMode || 'html',
      });
    },

    async delete() {
      return await client.deleteMessages(rawMsg.chat.id, [rawMsg.id]);
    },

    async copy(entity: EntityLike) {
      // mtcute: forwardMessages() menerima objek Message; untuk ID pakai
      // forwardMessagesById(). Nama field lama (fromChat/toChat) tidak ada,
      // jadi pemanggilan versi sebelumnya selalu gagal.
      return await client.forwardMessagesById({
        fromChatId: rawMsg.chat.id,
        toChatId: toPeer(entity),
        messages: [rawMsg.id],
      });
    },

    async getReplyMessage(): Promise<UserbotMessageLike | null> {
      // RepliedMessageInfo bukan Message — isinya hanya metadata, jadi pesan
      // aslinya tetap harus diambil lewat ID.
      const replyId = rawMsg.replyToMessage?.id;
      if (replyId) {
        try {
          const [found] = await client.getMessages(rawMsg.chat.id, [replyId]);
          return found ? createUserbotMessageAdapter(found, client) : null;
        } catch {
          return null;
        }
      }
      return null;
    },

    async getSender(): Promise<UserbotEntityLike | null> {
      const s = rawMsg.sender;
      if (!s) {return null;}
      // Peer = User | Chat: nama orang hanya ada di User, judul hanya di Chat.
      const asUser = s as { firstName?: string; lastName?: string };
      const asChat = s as { title?: string };
      return {
        id: s.id,
        firstName: asUser.firstName,
        lastName: asUser.lastName,
        username: s.username,
        title: asChat.title,
        premium: Boolean((s as { isPremium?: boolean }).isPremium),
        bot: Boolean((s as { isBot?: boolean }).isBot),
        className: s.type === 'user' ? 'User' : 'Channel',
      };
    },

    async getChat(): Promise<UserbotEntityLike | null> {
      const c = rawMsg.chat;
      if (!c) {return null;}
      return {
        id: c.id,
        title: (c as { title?: string }).title,
        username: c.username,
        // Peer mtcute: `type` cuma 'user'|'chat'; jenis grup ada di `chatType`.
        // Perbandingan lama ('channel'/'supergroup') tidak pernah benar.
        className: c.type === 'chat' && (c.chatType === 'channel' || c.chatType === 'supergroup') ? 'Channel' : 'Chat',
      };
    },

    async downloadMedia(): Promise<Buffer | string | undefined> {
      try {
        // downloadAsBuffer() butuh lokasi file (media), bukan objek Message;
        // mengoper pesannya selalu gagal dan unduhan media tak pernah jalan.
        const media = rawMsg.media;
        if (!media || typeof client.downloadAsBuffer !== 'function') {return undefined;}
        return Buffer.from(await client.downloadAsBuffer(media as Parameters<CompatClient['downloadAsBuffer']>[0]));
      } catch {
        return undefined;
      }
      return undefined;
    },
  };

  return adapter;
}
