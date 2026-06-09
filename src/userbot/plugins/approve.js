import { addApprovedUser, removeApprovedUser, getApprovedUsers } from '../../database/db.js';

export default {
  name: 'approve',
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (cmd === '.approve') {
      const replied = await message.getReplyMessage();
      if (!replied) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal:</b> Balas pesan pengguna yang ingin di-approve!</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }
      
      const targetId = Number(replied.senderId);
      if (!targetId) return;

      const success = await addApprovedUser(telegramId, targetId);
      if (success) {
        await message.edit({ 
          text: `<blockquote>✅ <b>Pengguna Diizinkan (Approved)!</b>\nPengguna dengan ID <code>${targetId}</code> tidak akan diblokir oleh Anti-PM.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
      }
    }
    
    else if (cmd === '.disapprove') {
      const replied = await message.getReplyMessage();
      if (!replied) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal:</b> Balas pesan pengguna yang ingin di-disapprove!</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }
      
      const targetId = Number(replied.senderId);
      if (!targetId) return;

      const success = await removeApprovedUser(telegramId, targetId);
      if (success) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Pengguna Dihapus (Disapproved)!</b>\nPengguna dengan ID <code>${targetId}</code> telah dihapus dari daftar aman Anti-PM.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
      }
    }
    
    else if (cmd === '.approved') {
      const list = getApprovedUsers(telegramId);
      if (list.length === 0) {
        await message.edit({ 
          text: `<blockquote>📝 <b>Daftar Approved Kosong.</b>\nBelum ada pengguna yang Anda masukkan ke daftar putih.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
      } else {
        const listText = list.map(id => `• <code>${id}</code>`).join('\n');
        await message.edit({ 
          text: `<blockquote>🛡️ <b>Daftar Pengguna Aman (Approved):</b>\n\n${listText}</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
      }
    }
  }
};
