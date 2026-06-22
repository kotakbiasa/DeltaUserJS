import { Api } from 'teleproto';

export class MockTelegramClient {
  constructor(telegramId) {
    this.telegramId = Number(telegramId);
    this.handlers = [];
    this.connected = true;
    
    // Track outgoing calls for assertions
    this.sentMessages = [];
    this.editedMessages = [];
    this.deletedMessages = [];
    this.invokedCalls = [];
    this.markedAsRead = [];
  }

  addEventHandler(handler, eventType) {
    this.handlers.push({ handler, eventType });
  }

  removeEventHandler(handler) {
    this.handlers = this.handlers.filter(h => h.handler !== handler);
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  async getMe() {
    return {
      id: this.telegramId,
      username: `mock_userbot_${this.telegramId}`,
      firstName: `Mock Ubot ${this.telegramId}`,
    };
  }

  async getEntity(target) {
    let id = 99999;
    let username = 'mock_entity';
    let title = 'Mock Entity';
    
    if (typeof target === 'number') {
      id = target;
      username = `user_${id}`;
      title = `Mock Group ${id}`;
    } else if (typeof target === 'string') {
      username = target.replace('@', '');
      id = Math.abs(this.hashCode(username));
      title = `Mock Entity ${username}`;
    } else if (target && typeof target === 'object') {
      id = target.userId || target.channelId || target.chatId || 99999;
      username = `entity_${id}`;
      title = `Mock Object ${id}`;
    }

    if (this._entities && this._entities[id]) {
      return {
        id,
        username: this._entities[id].username || username,
        title,
        firstName: this._entities[id].firstName,
        lastName: `Last_${id}`,
      };
    }

    return {
      id,
      username,
      title,
      firstName: `First_${id}`,
      lastName: `Last_${id}`,
    };
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  async sendMessage(peerId, options) {
    const msgId = Math.floor(Math.random() * 1000000);
    let peerNum = 99999;
    if (peerId) {
      if (typeof peerId === 'number') peerNum = peerId;
      else peerNum = peerId.userId || peerId.channelId || peerId.chatId || 99999;
    }
    
    const sentMsg = {
      id: msgId,
      peerId: typeof peerId === 'number' ? { userId: peerId } : peerId,
      chatId: peerNum,
      message: options.message || '',
      replyTo: options.replyTo,
      out: true,
      senderId: this.telegramId,
      date: new Date(),
    };

    sentMsg.edit = async (editOpts) => {
      sentMsg.message = editOpts.text || editOpts.message || sentMsg.message;
      this.editedMessages.push({
        messageId: msgId,
        peerId: sentMsg.peerId,
        text: sentMsg.message,
        parseMode: editOpts.parseMode
      });
      return sentMsg;
    };

    sentMsg.getReplyMessage = async () => {
      if (!options.replyTo) return null;
      const replyMsgId = options.replyTo.replyToMsgId || options.replyTo;
      return this.sentMessages.find(m => m.id === replyMsgId) || null;
    };

    this.sentMessages.push(sentMsg);
    return sentMsg;
  }

  async deleteMessages(peerId, messageIds, options = {}) {
    this.deletedMessages.push({ peerId, messageIds, revoke: options.revoke });
    this.sentMessages = this.sentMessages.filter(m => !messageIds.includes(m.id));
    return true;
  }

  async invoke(rpcCall) {
    this.invokedCalls.push(rpcCall);
    
    // Mock responses for expected RPC methods
    if (rpcCall instanceof Api.messages.SetBotCallbackAnswer) {
      return { queryId: rpcCall.queryId, alert: rpcCall.alert, message: rpcCall.message };
    }
    if (rpcCall instanceof Api.users.GetFullUser) {
      const userId = rpcCall.id.userId || rpcCall.id;
      return {
        fullUser: { id: userId },
        user: { id: userId, username: `user_${userId}` }
      };
    }
    if (rpcCall instanceof Api.channels.GetFullChannel) {
      const channelId = rpcCall.channel.channelId || rpcCall.channel;
      return {
        fullChat: { id: channelId },
        chats: [{ id: channelId, title: `Channel_${channelId}` }]
      };
    }
    if (rpcCall instanceof Api.channels.EditBanned) {
      return { nModified: 1 };
    }
    if (rpcCall instanceof Api.channels.EditAdmin) {
      return { nModified: 1 };
    }
    if (rpcCall instanceof Api.messages.UpdatePinnedMessage) {
      return { nModified: 1 };
    }
    return {};
  }

  async markAsRead(peerId) {
    this.markedAsRead.push(peerId);
    return true;
  }

  async getMessages(peerId, options = {}) {
    const peerNum = typeof peerId === 'number' ? peerId : (peerId?.userId || peerId?.channelId || peerId?.chatId || 99999);
    let filtered = this.sentMessages.filter(m => m.chatId === peerNum);
    if (options.ids) {
      filtered = filtered.filter(m => options.ids.includes(m.id));
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    return filtered;
  }

  // --- E2E Simulation Hooks ---

  async simulateNewMessage({ senderId, chatId, text, replyToMsgId, out = false, action = null }) {
    const msgId = Math.floor(Math.random() * 1000000);
    const peerId = { userId: senderId };
    
    const msg = {
      id: msgId,
      senderId,
      peerId,
      chatId,
      message: text,
      out,
      action,
      date: new Date(),
      replyTo: replyToMsgId ? { replyToMsgId } : null,
    };

    msg.edit = async (editOpts) => {
      msg.message = editOpts.text || editOpts.message || msg.message;
      this.editedMessages.push({
        messageId: msgId,
        peerId,
        text: msg.message,
        parseMode: editOpts.parseMode
      });
      return msg;
    };

    msg.getReplyMessage = async () => {
      if (!replyToMsgId) return null;
      // Also search in incoming simulated messages
      const found = this.sentMessages.find(m => m.id === replyToMsgId) || (this._simulatedMessages && this._simulatedMessages.find(m => m.id === replyToMsgId));
      if (found) return found;
      return {
        id: replyToMsgId,
        senderId: 333001, // fallback to a non-self ID instead of senderId to prevent self-vote loop
        chatId: chatId,
        message: 'replied message body',
        out: false
      };
    };
    
    if (!this._simulatedMessages) this._simulatedMessages = [];
    this._simulatedMessages.push(msg);

    const event = { message: msg };

    for (const { handler, eventType } of this.handlers) {
      const isNewMessage = eventType?.constructor?.name === 'NewMessage' || 
                           (eventType && typeof eventType === 'object' && eventType.constructor.name.includes('NewMessage'));
      if (isNewMessage) {
        await handler(event);
      }
    }
    return msg;
  }

  async simulateCallbackQuery({ queryId, data, peer, msgId }) {
    const update = { queryId, data, peer, msgId };
    const event = { update };

    for (const { handler, eventType } of this.handlers) {
      const isRaw = eventType?.constructor?.name === 'Raw' ||
                    (eventType && typeof eventType === 'object' && eventType.constructor.name.includes('Raw'));
      if (isRaw) {
        await handler(event);
      }
    }
  }

  async simulateIncomingJoin({ senderId, chatId, firstName = 'New', username = 'new_member' }) {
    if (!this._entities) this._entities = {};
    this._entities[senderId] = { id: senderId, firstName, username };
    // MessageActionChatAddUser or MessageActionChatJoinedByLink
    const action = new Api.MessageActionChatAddUser({
      users: [senderId]
    });
    return this.simulateNewMessage({
      senderId,
      chatId,
      text: '',
      action,
      out: false
    });
  }

  async simulateIncomingLeave({ senderId, chatId }) {
    const action = new Api.MessageActionChatDeleteUser({
      userId: senderId
    });
    return this.simulateNewMessage({
      senderId,
      chatId,
      text: '',
      action,
      out: false
    });
  }
}
