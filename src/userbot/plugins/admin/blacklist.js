import { addBroadcastBlacklist, removeBroadcastBlacklist, getBroadcastBlacklist } from '../../../core/database.js';

export default {
  name: 'blacklist',
  help: {
    title: 'Gcast Blacklist (.addbl)',
    description: 'Mengelola daftar grup yang akan diabaikan saat Anda melakukan Global Broadcast (Gcast).',
    usage: '• `.addbl` (Di dalam grup yg ingin di-blacklist)\n• `.rmbl` (Di dalam grup yg ingin dihapus dari blacklist)\n• `.listbl` (Melihat daftar ID grup yang di-blacklist)',
    detail: 'Grup yang masuk blacklist tidak akan pernah menerima pesan dari perintah `.gcast`.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (cmd === '.addbl') {
      const chatId = String(message.chatId);
      if (message.isPrivate) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal:</b> Perintah ini hanya bisa digunakan di dalam grup!</blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }
      
      const success = await addBroadcastBlacklist(telegramId, chatId);
      if (success) {
        await message.edit({ 
          text: `<blockquote>✅ <b>Grup Ditambahkan ke Blacklist!</b>\nGrup ini tidak akan menerima pesan Broadcast Anda lagi.</blockquote>`, 
          parseMode: 'html' 
        });
      }
    }
    
    else if (cmd === '.rmbl') {
      const chatId = String(message.chatId);
      if (message.isPrivate) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal:</b> Perintah ini hanya bisa digunakan di dalam grup!</blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }

      const success = await removeBroadcastBlacklist(telegramId, chatId);
      if (success) {
        await message.edit({ 
          text: `<blockquote>🗑 <b>Grup Dihapus dari Blacklist!</b>\nGrup ini akan kembali menerima pesan Broadcast Anda.</blockquote>`, 
          parseMode: 'html' 
        });
      }
    }
    
    else if (cmd === '.listbl') {
      const list = getBroadcastBlacklist(telegramId);
      if (list.length === 0) {
        await message.edit({ 
          text: `<blockquote>📝 <b>Daftar Blacklist Kosong.</b>\nSemua grup saat ini akan menerima pesan Broadcast Anda.</blockquote>`, 
          parseMode: 'html' 
        });
      } else {
        const listText = list.map(id => `• <code>${id}</code>`).join('\n');
        await message.edit({ 
          text: `<blockquote>🛡️ <b>Daftar Grup Blacklist (Diabaikan oleh Gcast):</b>\n\n${listText}</blockquote>`, 
          parseMode: 'html' 
        });
      }
    }
  }
};
