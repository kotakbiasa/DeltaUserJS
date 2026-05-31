import { Api } from 'telegram';

export default {
  name: 'admin',
  help: {
    title: 'Admin Tools (.kick, .ban, .mute)',
    description: 'Fitur moderasi grup dengan cepat (Anda harus menjadi Admin).',
    usage: 'Balas pesan pengguna dengan `.kick`, `.ban`, `.mute`, atau `.unmute`.',
    detail: '• `.kick`: Mengeluarkan anggota.\n• `.ban`: Memblokir permanen.\n• `.mute`: Membisukan.\n• `.unmute`: Membuka bisu.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const cmd = message.message.toLowerCase().trim();
    if (['.kick', '.ban', '.mute', '.unmute'].includes(cmd)) {
      const replied = await message.getReplyMessage();
      if (!replied) {
        await message.edit({ text: `❌ <b>Balas (reply) pesan pengguna untuk melakukan ${cmd}!</b>`, parseMode: 'html' });
        return;
      }
      
      const targetId = replied.senderId;
      if (!targetId) {
         await message.edit({ text: '❌ Tidak dapat menemukan user ID dari pesan ini.', parseMode: 'html' });
         return;
      }
      
      try {
        let viewMessages = undefined;
        let sendMessages = undefined;

        if (cmd === '.kick') {
           viewMessages = true;
        } else if (cmd === '.ban') {
           viewMessages = true;
        } else if (cmd === '.mute') {
           sendMessages = true;
        } else if (cmd === '.unmute') {
           sendMessages = false;
        }

        const bannedRights = new Api.ChatBannedRights({
          untilDate: 0,
          viewMessages: viewMessages,
          sendMessages: sendMessages
        });

        if (cmd === '.kick') {
          const banRights = new Api.ChatBannedRights({ untilDate: 0, viewMessages: true });
          const unbanRights = new Api.ChatBannedRights({ untilDate: 0, viewMessages: false, sendMessages: false });
          try {
             await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights: banRights }));
             await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights: unbanRights }));
          } catch(e) {
             await client.invoke(new Api.messages.DeleteChatUser({ chatId: message.chatId, userId: targetId }));
          }
          await message.edit({ text: `👢 <b>Berhasil mengeluarkan (kick)</b> pengguna tersebut.`, parseMode: 'html' });
        } else {
          try {
             await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights }));
          } catch(e) {
             throw e;
          }
          const textMsg = cmd === '.ban' ? '🔨 <b>Berhasil memblokir (ban)</b>' : (cmd === '.mute' ? '🤐 <b>Berhasil membisukan (mute)</b>' : '🔊 <b>Berhasil membuka bisu (unmute)</b>');
          await message.edit({ text: `${textMsg} pengguna tersebut.`, parseMode: 'html' });
        }
      } catch (err) {
        console.error('Error in admin tools:', err);
        await message.edit({ text: `❌ <b>Gagal:</b> Anda bukan admin atau bot tidak memiliki izin yang cukup.\n<code>${err.message}</code>`, parseMode: 'html' });
      }
    }
  }
};
