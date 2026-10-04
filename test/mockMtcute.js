import { Api } from './mockApi.js';

// Monotonic message-ID generator. Random IDs (Math.random) can collide across
// the suite, making getReplyMessage/editedMessages lookups by ID nondeterministic.
let __msgIdCounter = 1000;
function nextMsgId() {
  return ++__msgIdCounter;
}

export class MockMtcuteClient {
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
    // Panggilan API mtcute level tinggi (bukan TL mentah) supaya test bisa
    // memeriksa BENTUK argumennya, bukan cuma efek sampingnya.
    this.adminEdits = [];
    this.sentFiles = [];
    this.resolvedPeers = [];
    // Anggota yang dikembalikan iterChatMembers(); bisa ditimpa per test.
    this.chatMembers = null;
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
    const msgId = nextMsgId();
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

  // --- API anggota gaya mtcute (parameter objek) ---
  // Sebelumnya mock tidak punya method ini sama sekali, sehingga handler
  // jatuh ke cabang client.call() dan bug pemanggilan posisional di produksi
  // tidak pernah terlihat oleh test.
  _peerNum(peer) {
    if (typeof peer === 'number') return peer;
    if (typeof peer === 'string') return Number(peer) || peer;
    return peer?.userId ?? peer?.channelId ?? peer?.chatId ?? peer?.id ?? peer;
  }

  async _editBanned(chatId, userId, rights) {
    return await this.invoke({
      _: 'channels.editBanned',
      channel: this._peerNum(chatId),
      participant: this._peerNum(userId),
      bannedRights: { _: 'chatBannedRights', untilDate: 0, ...rights },
    });
  }

  async kickChatMember({ chatId, userId }) {
    await this._editBanned(chatId, userId, { viewMessages: true });
    return await this._editBanned(chatId, userId, { viewMessages: false });
  }

  async banChatMember({ chatId, participantId, untilDate }) {
    return await this._editBanned(chatId, participantId, {
      viewMessages: true,
      untilDate: this._untilSeconds(untilDate),
    });
  }

  async unbanChatMember({ chatId, participantId }) {
    return await this._editBanned(chatId, participantId, { viewMessages: false });
  }

  // mtcute memaknai `until` numerik sebagai unix timestamp DETIK (Date untuk
  // bentuk objek). Mock lama memperlakukannya sebagai milidetik, sehingga mute
  // berdurasi apa pun tampak sudah kedaluwarsa.
  _untilSeconds(until) {
    if (!until) return 0;
    if (until instanceof Date) return Math.floor(until.getTime() / 1000);
    const n = Number(until);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
  }

  async restrictChatMember({ chatId, userId, restrictions = {}, until }) {
    return await this._editBanned(chatId, userId, {
      ...restrictions,
      untilDate: this._untilSeconds(until),
    });
  }

  async invoke(rpcCall) {
    let call = rpcCall;
    if (rpcCall && typeof rpcCall === 'object' && !(rpcCall instanceof Api.channels.EditBanned)) {
      if (rpcCall._ === 'channels.editBanned' || rpcCall.className === 'EditBanned') {
        call = new Api.channels.EditBanned({
          channel: rpcCall.channel,
          participant: rpcCall.participant,
          bannedRights: rpcCall.bannedRights instanceof Api.ChatBannedRights
            ? rpcCall.bannedRights
            : new Api.ChatBannedRights(rpcCall.bannedRights || {}),
        });
      }
    }
    this.invokedCalls.push(call);
    
    // Mock responses for expected RPC methods
    if (call instanceof Api.messages.SetBotCallbackAnswer) {
      return { queryId: call.queryId, alert: call.alert, message: call.message };
    }
    if (call instanceof Api.users.GetFullUser) {
      const userId = call.id?.userId || call.id;
      return {
        fullUser: { id: userId },
        user: { id: userId, username: `user_${userId}` }
      };
    }
    if (call instanceof Api.channels.GetFullChannel) {
      const channelId = call.channel?.channelId || call.channel;
      return {
        fullChat: { id: channelId },
        chats: [{ id: channelId, title: `Channel_${channelId}` }]
      };
    }
    if (call instanceof Api.channels.EditBanned) {
      return { nModified: 1 };
    }
    if (call instanceof Api.channels.EditAdmin) {
      return { nModified: 1 };
    }
    if (call instanceof Api.messages.UpdatePinnedMessage) {
      return { nModified: 1 };
    }
    return {};
  }

  async call(rpcCall) {
    return await this.invoke(rpcCall);
  }

  async markAsRead(peerId) {
    this.markedAsRead.push(peerId);
    return true;
  }

  // --- Permukaan mtcute yang dulu TIDAK ADA di mock ---
  // Ketiadaannya membuat handler diam-diam jatuh ke cabang fallback
  // client.call(), sehingga jalur utama (yang dipakai di produksi) tidak
  // pernah diuji sama sekali.

  async resolvePeer(peer) {
    const id = this._peerNum(peer);
    this.resolvedPeers.push({ kind: 'peer', input: peer, id });
    if (typeof id === 'number' && id < 0) {
      return { _: 'inputPeerChannel', channelId: Math.abs(id), accessHash: 0 };
    }
    return { _: 'inputPeerUser', userId: id, accessHash: 0 };
  }

  async resolveUser(peer) {
    const id = this._peerNum(peer);
    this.resolvedPeers.push({ kind: 'user', input: peer, id });
    return { _: 'inputUser', userId: id, accessHash: 0 };
  }

  async resolveChannel(peer) {
    const id = this._peerNum(peer);
    this.resolvedPeers.push({ kind: 'channel', input: peer, id });
    return { _: 'inputChannel', channelId: Math.abs(Number(id)) || id, accessHash: 0 };
  }

  async editAdminRights({ chatId, userId, rights, rank }) {
    this.adminEdits.push({
      chatId: this._peerNum(chatId),
      userId: this._peerNum(userId),
      rights,
      rank,
    });
    return true;
  }

  async getChat(peer) {
    const id = this._peerNum(peer);
    return {
      id,
      title: `Mock Chat ${id}`,
      chatType: Number(id) < 0 ? 'supergroup' : 'group',
      className: Number(id) < 0 ? 'Channel' : 'Chat',
      megagroup: true,
    };
  }

  async *iterChatMembers(peer, options = {}) {
    const limit = options.limit ?? 200;
    const members = this.chatMembers ?? [
      { user: { id: 501, username: 'anggota_satu', isBot: false, firstName: 'Satu' } },
      { user: { id: 502, username: 'anggota_dua', isBot: false, firstName: 'Dua' } },
      { user: { id: 503, username: 'bot_palsu', isBot: true, firstName: 'Bot' } },
    ];
    let n = 0;
    for (const m of members) {
      if (n++ >= limit) return;
      yield m;
    }
  }

  async sendFile(peerId, options = {}) {
    this.sentFiles.push({ peerId: this._peerNum(peerId), ...options });
    return { id: nextMsgId(), peerId };
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

  async simulateNewMessage({ senderId, chatId, text, replyToMsgId, out = false, action = null, chatClass = null, replySenderId = null, chatType = null }) {
    const msgId = nextMsgId();
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

    // Adapter mtcute meneruskan chatType ('group'/'supergroup'/'channel').
    // Default null agar perilaku test lama tidak berubah.
    if (chatType) { msg.chatType = chatType; }

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

    // Chat tempat pesan berada. Tanpa ini `message.getChat()` undefined dan
    // seluruh handler moderasi berhenti di "hanya bisa dipakai di dalam grup",
    // jadi logikanya tidak pernah teruji.
    msg.getChat = async () => ({
      id: chatId,
      title: `Mock Chat ${chatId}`,
      className: chatClass || (chatId < 0 ? 'Channel' : 'Chat'),
      megagroup: true,
      chatType: 'supergroup',
    });

    msg.getSender = async () => ({
      id: senderId,
      username: `user_${senderId}`,
      firstName: `User${senderId}`,
    });

    msg.getReplyMessage = async () => {
      if (!replyToMsgId) return null;
      // Also search in incoming simulated messages
      const found = this.sentMessages.find(m => m.id === replyToMsgId) || (this._simulatedMessages && this._simulatedMessages.find(m => m.id === replyToMsgId));
      if (found) return found;
      const fallbackSender = replySenderId ?? 333001; // non-self ID: hindari self-vote loop
      return {
        id: replyToMsgId,
        senderId: fallbackSender,
        chatId: chatId,
        message: 'replied message body',
        out: false,
        getSender: async () => ({
          id: fallbackSender,
          username: `user_${fallbackSender}`,
          firstName: `User${fallbackSender}`,
        }),
        getChat: async () => ({
          id: chatId,
          className: chatClass || (chatId < 0 ? 'Channel' : 'Chat'),
          megagroup: true,
        }),
      };
    };
    
    if (!this._simulatedMessages) this._simulatedMessages = [];
    this._simulatedMessages.push(msg);

    const event = { message: msg };

    for (const { handler, eventType } of this.handlers) {
      const isNewMessage = !eventType ||
                           eventType === 'NewMessage' ||
                           eventType?.constructor?.name === 'NewMessage' || 
                           (eventType && typeof eventType === 'object' && eventType.constructor?.name?.includes('NewMessage'));
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
      const isRaw = !eventType ||
                    eventType === 'Raw' ||
                    eventType?.constructor?.name === 'Raw' ||
                    (eventType && typeof eventType === 'object' && eventType.constructor?.name?.includes('Raw'));
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
