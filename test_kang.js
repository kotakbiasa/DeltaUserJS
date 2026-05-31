import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { TelegramClient } from 'telegram';

// dummy test just to check syntax
console.log(new Api.stickers.CreateStickerSet({
  userId: new Api.InputUserSelf(),
  title: "Test",
  shortName: "test_pack",
  stickers: []
}));
