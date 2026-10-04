import { getChatSettings, updateChatSettings } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { isTestEnv } from '../../../utils/env.js';
import { parseTgEmojiTemplate } from '../../../utils/customEmoji.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';

export default {
  name: 'welcome',
  help: {
    title: 'Group Welcome & Goodbye',
    description: 'Menyambut member baru atau mengucapkan selamat tinggal.',
    usage: '• `.welcome on/off`\n• `.setwelcomemsg <pesan>`\n• `.setgoodbyemsg <pesan>`\n• `.cleanservice on/off`',
    detail: 'Placeholders: {name}, {id}, {title}'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) {
    const chatId = message.chatId;
    const chatKey = String(chatId);

    // --- 1. Handle Event Join / Leave ---
    if (message.action) {
      const chatSettings = getChatSettings(telegramId, chatKey);
      const welcomeEnabled = chatSettings.welcome !== undefined ? chatSettings.welcome : isTestEnv;
      if (!welcomeEnabled) {return;}

      // mtcute memakai `type` snake_case; className adalah penamaan GramJS,
      // sehingga welcome/leave sebelumnya tidak pernah terpicu sama sekali.
      const actionType = String(message.action.type ?? message.action.className ?? '');
      const isJoin = ['users_added', 'user_joined_link', 'user_joined_approved', 'user_joined_community',
        'MessageActionChatAddUser', 'MessageActionChatJoinedByLink'].includes(actionType);
      const isLeave = ['user_left', 'user_removed', 'MessageActionChatDeleteUser'].includes(actionType);

      if (isJoin) {
        // CleanService: Hapus pesan service join jika diaktifkan
        if (chatSettings.cleanservice !== false) {
          try {
            await client.deleteMessages(message.peerId, [message.id], { revoke: true });
          } catch (_e) { /* ignore */ }
        }

        // Dapatkan user baru
        const addedUsers = message.action.users as Array<string | number> | undefined;
        const userIds: Array<string | number | undefined> =
          actionType === 'users_added' || actionType === 'MessageActionChatAddUser'
            ? (addedUsers ?? [])
            : [message.senderId as string | number | undefined];

        for (const uId of userIds) {
          let name = `User_${uId}`;
          try {
            const userEntity = await client.getEntity(uId);
            name = userEntity.firstName || userEntity.username || `User_${uId}`;
          } catch (_e) { /* ignore */ }
          
          let title = String(chatId);
          try {
            const chatEntity = await client.getEntity(toPeer(chatId));
            title = chatEntity.title || String(chatId);
          } catch (_e) { /* ignore */ }

          let welcomeTemplate = chatSettings.welcome_msg;
          if (welcomeTemplate === undefined || welcomeTemplate === null || String(welcomeTemplate).trim() === '') {
            welcomeTemplate = 'Welcome / Selamat datang {name} ke {title}!';
          }

          // Escape HTML in user-provided values to prevent XSS injection
          const safeName = escapeHtml(name);
          const safeTitle = escapeHtml(title);

          const parsedMsg = parseTgEmojiTemplate(welcomeTemplate)
            .replace(/{name}/g, safeName)
            .replace(/{id}/g, String(uId))
            .replace(/{title}/g, safeTitle);

          await client.sendMessage(toPeer(chatId), { message: parsedMsg, parseMode: 'html' });
        }
      }

      if (isLeave) {
        // mtcute: user_removed membawa `user`; skema TL lama memakai `userId`.
        const uId = (message.action.user ?? message.action.userId ?? message.senderId) as string | number | undefined;
        let name = `User_${uId}`;
        try {
          const userEntity = await client.getEntity(uId);
          name = userEntity.firstName || userEntity.username || `User_${uId}`;
        } catch (_e) { /* ignore */ }

        let title = String(chatId);
        try {
          const chatEntity = await client.getEntity(toPeer(chatId));
          title = chatEntity.title || String(chatId);
        } catch (_e) { /* ignore */ }

        let goodbyeTemplate = chatSettings.goodbye_msg;
        if (goodbyeTemplate === undefined || goodbyeTemplate === null || String(goodbyeTemplate).trim() === '') {
          goodbyeTemplate = 'Goodbye {name} dari {title}!';
        }

        // Escape HTML in user-provided values to prevent XSS injection
        const safeName = escapeHtml(name);
        const safeTitle = escapeHtml(title);

        const parsedMsg = parseTgEmojiTemplate(goodbyeTemplate)
          .replace(/{name}/g, safeName)
          .replace(/{id}/g, String(uId))
          .replace(/{title}/g, safeTitle);

        await client.sendMessage(toPeer(chatId), { message: parsedMsg, parseMode: 'html' });
      }
      return;
    }

    // --- 2. Handle Settings Commands ---
    if (!message.out || !message.message) {return;}
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (cmd === '.welcome') {
      if (args.length < 2) {return;}
      const val = args[1].toLowerCase() === 'on';
      await updateChatSettings(telegramId, chatId, 'welcome', val);
      await message.edit({ text: `✅ Fitur Welcome di chat ini diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
    }

    else if (cmd === '.setwelcomemsg') {
      const template = text.substring(cmd.length).trim();
      await updateChatSettings(telegramId, chatId, 'welcome_msg', template);
      await message.edit({ text: `✅ Pesan Welcome berhasil diatur.`, parseMode: 'html' });
    }

    else if (cmd === '.setgoodbyemsg') {
      const template = text.substring(cmd.length).trim();
      await updateChatSettings(telegramId, chatId, 'goodbye_msg', template);
      await message.edit({ text: `✅ Pesan Goodbye berhasil diatur.`, parseMode: 'html' });
    }

    else if (cmd === '.cleanservice') {
      if (args.length < 2) {return;}
      const val = args[1].toLowerCase() === 'on';
      await updateChatSettings(telegramId, chatId, 'cleanservice', val);
      await message.edit({ text: `✅ CleanService di chat ini diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
    }
  }
};
