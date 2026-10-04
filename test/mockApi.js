/**
 * Mock Telegram API TL Classes for E2E Testing without mtcute dependency
 */

export class EditBanned {
  constructor(params) {
    this._ = 'channels.editBanned';
    this.className = 'EditBanned';
    Object.assign(this, params);
  }
}

export class EditAdmin {
  constructor(params) {
    this._ = 'channels.editAdmin';
    this.className = 'EditAdmin';
    Object.assign(this, params);
  }
}

export class GetFullChannel {
  constructor(params) {
    this._ = 'channels.getFullChannel';
    this.className = 'GetFullChannel';
    Object.assign(this, params);
  }
}

export class GetFullUser {
  constructor(params) {
    this._ = 'users.getFullUser';
    this.className = 'GetFullUser';
    Object.assign(this, params);
  }
}

export class SetBotCallbackAnswer {
  constructor(params) {
    this._ = 'messages.setBotCallbackAnswer';
    this.className = 'SetBotCallbackAnswer';
    Object.assign(this, params);
  }
}

export class UpdatePinnedMessage {
  constructor(params) {
    this._ = 'messages.updatePinnedMessage';
    this.className = 'UpdatePinnedMessage';
    Object.assign(this, params);
  }
}

export class ChatBannedRights {
  constructor(params) {
    this._ = 'chatBannedRights';
    this.className = 'ChatBannedRights';
    Object.assign(this, params);
  }
}

export class MessageActionChatAddUser {
  constructor(params) {
    this._ = 'messageActionChatAddUser';
    this.className = 'MessageActionChatAddUser';
    Object.assign(this, params);
  }
}

export class MessageActionChatDeleteUser {
  constructor(params) {
    this._ = 'messageActionChatDeleteUser';
    this.className = 'MessageActionChatDeleteUser';
    Object.assign(this, params);
  }
}

export const Api = {
  channels: {
    EditBanned,
    EditAdmin,
    GetFullChannel,
  },
  users: {
    GetFullUser,
  },
  messages: {
    SetBotCallbackAnswer,
    UpdatePinnedMessage,
  },
  ChatBannedRights,
  MessageActionChatAddUser,
  MessageActionChatDeleteUser,
};
