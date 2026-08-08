import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

export default {
  name: 'admin',
  help: {
    title: 'Admin Tools (.kick, .ban, .mute)',
    description: 'Fitur moderasi grup dengan cepat (Anda harus menjadi Admin).',
    usage: 'Balas pesan pengguna dengan `.kick`, `.ban`, `.mute`, atau `.unmute`.',
    detail: '• `.kick`: Mengeluarkan anggota.\n• `.ban`: Memblokir permanen.\n• `.mute`: Membisukan.\n• `.unmute`: Membuka bisu.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) {return;}
    
    const cmd = message.message.toLowerCase().trim();
    if (['.kick', '.ban', '.mute', '.unmute'].includes(cmd)) {
      const replied = await message.getReplyMessage();
      if (!replied) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Balas (reply) pesan pengguna untuk melakukan ${escapeHtml(cmd)}!</b></blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }

      const targetId = replied.senderId;
      if (!targetId) {
         await message.edit({ 
           text: `<blockquote>❌ Tidak dapat menemukan user ID dari pesan ini.</blockquote>`, 
           parseMode: 'html' 
         });
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
          await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights: banRights }));

          // Unban immediately after kick (Telegram requires this two-step for groups)
          const unbanRights = new Api.ChatBannedRights({ untilDate: 0, viewMessages: false, sendMessages: false });
          await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights: unbanRights }));

          await message.edit({ 
            text: `<blockquote>👢 <b>Berhasil mengeluarkan (kick) user:</b> <code>${escapeHtml(String(targetId))}</code></blockquote>`, 
            parseMode: 'html' 
          });

        } else if (cmd === '.ban') {
          await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights }));
          await message.edit({ 
            text: `<blockquote>🔨 <b>Berhasil memblokir (ban) user:</b> <code>${escapeHtml(String(targetId))}</code></blockquote>`, 
            parseMode: 'html' 
          });

        } else if (cmd === '.mute') {
          await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights }));
          await message.edit({ 
            text: `<blockquote>🔇 <b>Berhasil membisukan (mute) user:</b> <code>${escapeHtml(String(targetId))}</code></blockquote>`, 
            parseMode: 'html' 
          });

        } else if (cmd === '.unmute') {
          await client.invoke(new Api.channels.EditBanned({ channel: message.chatId, participant: targetId, bannedRights }));
          await message.edit({ 
            text: `<blockquote>🔊 <b>Bisu telah dicabut (unmute) untuk user:</b> <code>${escapeHtml(String(targetId))}</code></blockquote>`, 
            parseMode: 'html' 
          });
        }
      } catch (err) {
        Logger.logUser(telegramId, `Error in admin plugin (${cmd}): ${err.message}`, 'ERROR');
        await message.edit({
          text: `<blockquote>❌ <b>Gagal melakukan ${escapeHtml(cmd)}:</b>\n<i>${escapeHtml(err.message)}</i>\n\n(Pastikan Anda adalah Admin dengan hak yang cukup)</blockquote>`,
          parseMode: 'html'
        });
      }
    }
  }
};
