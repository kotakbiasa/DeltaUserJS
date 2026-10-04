import type { MessageEditOptions, UserbotMessageLike, UserbotEntityLike } from '../types.js';

/**
 * Compatibility adapter wrapping an mtcute Message into DeltaUserJS UserbotMessageLike.
 * This ensures existing plugins run seamlessly on mtcute without requiring individual rewrites.
 */
export function createUserbotMessageAdapter(rawMsg: any, client: any): UserbotMessageLike {
  let messageText = rawMsg.text || '';

  const adapter: UserbotMessageLike = {
    out: Boolean(rawMsg.isOutgoing),
    get message() {
      return messageText;
    },
    set message(val: string | undefined) {
      messageText = val || '';
      try {
        rawMsg.text = messageText;
      } catch {
        // ignore if read-only property
      }
    },
    id: rawMsg.id,
    chatId: rawMsg.chat?.id,
    peerId: rawMsg.chat?.id,
    senderId: rawMsg.sender?.id,
    replyToMsgId: rawMsg.replyToMessageId,
    replyTo: rawMsg.replyToMessageId ? { replyToMsgId: rawMsg.replyToMessageId } : undefined,
    isPrivate: rawMsg.chat?.type === 'private' || rawMsg.chat?.type === 'user',
    isGroup: rawMsg.chat?.type === 'group' || rawMsg.chat?.type === 'supergroup',
    isChannel: rawMsg.chat?.type === 'channel',
    date: rawMsg.date ? Math.floor(new Date(rawMsg.date).getTime() / 1000) : Math.floor(Date.now() / 1000),
    entities: rawMsg.entities,
    media: rawMsg.media,

    async edit(options: MessageEditOptions) {
      const text = typeof options === 'string' ? options : (options?.text ?? options?.message ?? '');
      messageText = text;
      return await client.editMessage({
        chat: rawMsg.chat.id,
        id: rawMsg.id,
        text,
        parseMode: (options?.parseMode as any) || 'html',
        linkPreview: options?.linkPreview,
      });
    },

    async reply(options: any) {
      const text = typeof options === 'string' ? options : (options?.message ?? options?.text ?? '');
      return await client.sendText(rawMsg.chat.id, text, {
        replyTo: rawMsg.id,
        parseMode: (options?.parseMode as any) || 'html',
      });
    },

    async delete() {
      return await client.deleteMessages(rawMsg.chat.id, [rawMsg.id]);
    },

    async copy(entity: any) {
      return await client.forwardMessages({
        fromChat: rawMsg.chat.id,
        toChat: entity,
        messages: [rawMsg.id],
      });
    },

    async getReplyMessage(): Promise<UserbotMessageLike | null> {
      if (rawMsg.replyToMessage) {
        return createUserbotMessageAdapter(rawMsg.replyToMessage, client);
      }
      if (rawMsg.replyToMessageId) {
        try {
          const found = await client.getMessage(rawMsg.chat.id, rawMsg.replyToMessageId);
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
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        username: s.username,
        title: s.title,
        premium: Boolean(s.isPremium),
        bot: Boolean(s.isBot),
        className: s.type === 'user' ? 'User' : 'Channel',
      };
    },

    async getChat(): Promise<UserbotEntityLike | null> {
      const c = rawMsg.chat;
      if (!c) {return null;}
      return {
        id: c.id,
        title: c.title,
        username: c.username,
        className: c.type === 'channel' || c.type === 'supergroup' ? 'Channel' : 'Chat',
      };
    },

    async downloadMedia(): Promise<Buffer | string | undefined> {
      try {
        if (typeof client.downloadAsBuffer === 'function') {
          return await client.downloadAsBuffer(rawMsg);
        }
      } catch {
        return undefined;
      }
      return undefined;
    },
  };

  return adapter;
}
