import { getChatSettings, updateChatSettings, updateUserbotFeature } from '../../../infrastructure/database.js';

export default {
  name: 'settings',
  help: {
    title: 'Chat Settings',
    description: 'Mengatur prefix, bahasa, logging, dan nama kustom userbot.',
    usage: '• `.setprefix <char>`\n• `.setlang en/id`\n• `.logging on/off`\n• `.setname <nama>`',
    detail: 'Setelan ini terisolasi per grup/chat.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;

    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();

    const chatId = message.chatId;
    const chatSettings = getChatSettings(telegramId, chatId);

    if (cmd === '.setprefix') {
      if (args.length < 2) return;
      const newPrefix = args[1];
      if (newPrefix.length !== 1 || /\s/.test(newPrefix)) {
        await message.edit({ text: `❌ <b>Gagal:</b> Prefix harus berupa 1 karakter unik tanpa spasi!`, parseMode: 'html' });
        return;
      }
      await updateChatSettings(telegramId, chatId, 'prefix', newPrefix);
      await message.edit({ text: `✅ <b>Berhasil:</b> Prefix chat ini diubah menjadi: <code>${newPrefix}</code>`, parseMode: 'html' });
    }

    else if (cmd === '.setlang') {
      if (args.length < 2) return;
      const lang = args[1].toLowerCase();
      if (lang !== 'en' && lang !== 'id') {
        await message.edit({ text: `❌ <b>Gagal:</b> Bahasa tidak valid! Hanya mendukung <code>en</code> atau <code>id</code>.`, parseMode: 'html' });
        return;
      }
      await updateChatSettings(telegramId, chatId, 'lang', lang);
      await message.edit({ text: `✅ <b>Berhasil:</b> Bahasa chat ini diubah menjadi: <code>${lang}</code>`, parseMode: 'html' });
    }

    else if (cmd === '.logging') {
      if (args.length < 2) return;
      const val = args[1].toLowerCase() === 'on';
      await updateChatSettings(telegramId, chatId, 'logging', val);
      await message.edit({ text: `✅ <b>Berhasil:</b> Logging chat ini diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
    }

    else if (cmd === '.setname') {
      if (args.length < 2) return;
      const name = args.slice(1).join(' ');
      await updateUserbotFeature(telegramId, 'custom_name', name);
      await message.edit({ text: `✅ <b>Berhasil:</b> Nama kustom userbot Anda diubah menjadi: <b>${name}</b>`, parseMode: 'html' });
    }

    else if (cmd === '.addadmin') {
      if (args.length < 2) return;
      const targetId = Number(args[1]);
      if (isNaN(targetId)) return;
      let admins = chatSettings.admins || [];
      admins = Array.from(admins);
      if (!admins.includes(targetId)) {
        admins.push(targetId);
        await updateChatSettings(telegramId, chatId, 'admins', admins);
      }
      await message.edit({ text: `✅ User <code>${targetId}</code> ditambahkan sebagai admin grup.`, parseMode: 'html' });
    }
  }
};
