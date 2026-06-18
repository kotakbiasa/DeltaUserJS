import { getChatSettings } from '../../database/db.js';
import { block, footer } from '../ui.js';

export default {
  name: 'vc',
  help: {
    title: 'Voice Chat (.joinvc)',
    description: 'Masuk dan keluar dari obrolan suara (Group Call) di grup/channel.',
    usage: '`.joinvc` | `.leavevc`',
    detail: 'Plugin untuk membuat userbot masuk ke dalam Voice Chat sebagai pendengar (Muted). Berguna untuk membuat akun AFK di VC 24 jam.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;

    const key = String(message.chat.id || message.chat.id || '');
    const chatConfig = getChatSettings(telegramId, key);
    const prefix = chatConfig.prefix || '.';

    const text = message.text.trim().toLowerCase();
    
    if (text === `${prefix}joinvc`) {
      await message.edit({ text: block('Voice Chat', '⏳ Mencari Voice Chat yang aktif di grup ini...') + footer(settings), parseMode: 'html' });
      try {
        const peer = await client.getInputEntity(message.chat.id || message.chat.id);
        let fullChat;
        
        try {
          fullChat = await client.call({ _: 'channels.getFullChannel', channel: peer });
        } catch (e) {
          fullChat = await client.call({ _: 'messages.getFullChat', chatId: peer });
        }

        const groupCall = fullChat?.fullChat?.call;
        if (!groupCall) {
          return await message.edit({ text: block('Voice Chat', '❌ Tidak ada Voice Chat yang sedang aktif di grup ini.\nSilakan mulai VC terlebih dahulu.') + footer(settings), parseMode: 'html' });
        }

        const joinAs = await client.getInputEntity(await client.getMyUser());
        await client.call({ _: 'phone.joinGroupCall', call: groupCall,
          joinAs,
          muted: true,
          videoStopped: true,
          params: { _: 'dataJSON', data: JSON.stringify({ ssrc: Math.floor(Math.random() * 4294967295) } }) });

        await message.edit({ text: block('Voice Chat', '✅ Berhasil bergabung ke Voice Chat (Status: Muted).') + footer(settings), parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: block('Voice Chat', `❌ Gagal bergabung ke Voice Chat:\n<code>${err.message}</code>`) + footer(settings), parseMode: 'html' });
      }
      return;
    }

    if (text === `${prefix}leavevc`) {
      await message.edit({ text: block('Voice Chat', '⏳ Mengeluarkan dari Voice Chat...') + footer(settings), parseMode: 'html' });
      try {
        const peer = await client.getInputEntity(message.chat.id || message.chat.id);
        let fullChat;
        
        try {
          fullChat = await client.call({ _: 'channels.getFullChannel', channel: peer });
        } catch (e) {
          fullChat = await client.call({ _: 'messages.getFullChat', chatId: peer });
        }

        const groupCall = fullChat?.fullChat?.call;
        if (!groupCall) {
          return await message.edit({ text: block('Voice Chat', '❌ Tidak ada Voice Chat yang sedang aktif di grup ini.') + footer(settings), parseMode: 'html' });
        }

        await client.call({ _: 'phone.leaveGroupCall', call: groupCall,
          source: 0 });

        await message.edit({ text: block('Voice Chat', '✅ Berhasil keluar dari Voice Chat.') + footer(settings), parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: block('Voice Chat', `❌ Gagal keluar dari Voice Chat:\n<code>${err.message}</code>`) + footer(settings), parseMode: 'html' });
      }
      return;
    }
  }
};
