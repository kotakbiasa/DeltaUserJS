import { escapeHtml } from '../../../utils/richMessage.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from '../../../utils/logger.js';
import type { CompatClient } from '../../engine/compatClient.js';

export default {
  name: 'info',
  help: {
    title: 'Whois / Info (.info)',
    description: 'Menarik data lengkap dari pengguna atau grup (termasuk Foto Profil).',
    usage: '• `.info` (Melihat info diri sendiri, atau grup jika di grup)\n• `.info <username>` (Melihat info username)\n• Balas pesan orang lalu ketik `.info` (Melihat info orang tersebut)',
    detail: 'Menampilkan foto profil utama, bio, status akun, dan data detail lainnya dengan tampilan elegan.'
  },
  async execute(client: CompatClient, message: any, settings: any, telegramId: number) {
    if (!message.out || !message.message) {return;}
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (cmd !== '.info') {return;}

    await message.edit({ 
      text: `<blockquote>🔍 <b>Mengekstrak informasi target...</b></blockquote>`, 
      parseMode: 'html' 
    });

    let targetEntity: any;
    let _isGroup = false;

    try {
      const repliedMsg = await message.getReplyMessage();
      if (repliedMsg) {
        targetEntity = await client.getEntity(repliedMsg.senderId);
      } else if (args[1]) {
        if (args[1].toLowerCase() === 'me') {
          targetEntity = await client.getEntity('me');
        } else {
          targetEntity = await client.getEntity(args[1]);
        }
      } else {
        if (message.isPrivate) {
          targetEntity = await client.getEntity('me');
        } else {
          targetEntity = await client.getEntity(message.chatId);
          _isGroup = true;
        }
      }

      // 1. Ambil Foto Profil Target
      let profilePhotoBuffer: any = null;
      try {
        profilePhotoBuffer = await client.downloadProfilePhoto(targetEntity.id || targetEntity);
      } catch (e: any) {
        Logger.logUser(telegramId, `Gagal download foto profil: ${e.message}`, 'WARN');
      }

      // 2. Ambil Full Info (Bio, dll)
      let captionText = ``;
      const targetId = targetEntity.id ?? targetEntity;
      const isUser = targetEntity.className === 'User' || targetEntity.className === 'UserEmpty' || (!_isGroup && !targetEntity.title);

      if (isUser) {
        let pName = targetEntity.firstName || 'Tanpa Nama';
        let pUser = targetEntity.username ? `@${targetEntity.username}` : 'Tidak disetel';
        let pId = String(targetId);
        let pBio = 'Tidak ada deskripsi / bio';
        const tags: string[] = [];
        let photoCount = 0;

        try {
          const u: any = await client.getFullUser(targetId);
          pName = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || pName;
          pUser = u.username ? `@${u.username}` : pUser;
          pId = String(u.id);
          pBio = u.bio || pBio;
          if (u.isPremium) { tags.push('💎 Premium'); }
          if (u.isBot) { tags.push('🤖 Bot'); }
          if (u.isVerified) { tags.push('✅ Verified'); }
          if (u.isScam) { tags.push('⚠️ Scam'); }
          if (u.isFake) { tags.push('🎭 Fake'); }
        } catch (e: any) {
          Logger.logUser(telegramId, `Gagal getFullUser: ${e.message}`, 'WARN');
        }

        try {
          const userPhotos: any = await client.getProfilePhotos(targetId, { limit: 1 });
          photoCount = userPhotos.total || userPhotos.length || 0;
        } catch (_e) { /* ignore */ }

        captionText = `<blockquote>👤 <b>USER INFORMATION</b>\n` +
                      `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
                      `📛 <b>Nama:</b> ${escapeHtml(pName)}\n` +
                      `👤 <b>Username:</b> ${escapeHtml(pUser)}\n` +
                      `🆔 <b>User ID:</b> <code>${escapeHtml(pId)}</code>\n` +
                      `📸 <b>Foto Profil:</b> ${photoCount}\n` +
                      `🔖 <b>Status:</b> ${tags.length > 0 ? tags.join(' · ') : 'Normal User'}\n` +
                      `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
                      `📝 <b>Bio:</b>\n<i>${escapeHtml(pBio)}</i></blockquote>`;
      } else {
        // Group Info (Megagroup/Channel or Basic Chat)
        try {
          const fullInfo: any = await client.getFullChat(targetId);
          const cName = fullInfo.title || targetEntity.title || 'Group';
          const cUser = fullInfo.username ? `@${fullInfo.username}` : 'Private Group';
          const cId = String(fullInfo.id || targetEntity.id);
          const cBio = fullInfo.description || 'Tidak ada deskripsi grup';
          const cMembers = fullInfo.membersCount || '?';

          captionText = `<blockquote>👥 <b>GROUP INFORMATION</b>\n` +
                        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
                        `📌 <b>Nama Grup:</b> ${escapeHtml(cName)}\n` +
                        `🔗 <b>Username:</b> ${escapeHtml(cUser)}\n` +
                        `🆔 <b>Group ID:</b> <code>${escapeHtml(cId)}</code>\n` +
                        `👥 <b>Total Member:</b> ${cMembers}\n` +
                        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
                        `📝 <b>Deskripsi:</b>\n<i>${escapeHtml(cBio)}</i></blockquote>`;
        } catch (_chanErr) {
          const cName = targetEntity.title || 'Basic Group';
          const cId = String(targetEntity.id || targetId);
          captionText = `<blockquote>👥 <b>BASIC GROUP INFO</b>\n` +
                        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
                        `📌 <b>Nama:</b> ${escapeHtml(cName)}\n` +
                        `🆔 <b>ID:</b> <code>-${escapeHtml(cId)}</code>\n` +
                        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</blockquote>`;
        }
      }

      if (profilePhotoBuffer && profilePhotoBuffer.length > 0) {
        const tmpPath = path.join(os.tmpdir(), `info_${Date.now()}.jpg`);
        fs.writeFileSync(tmpPath, profilePhotoBuffer);
        
        await client.sendFile(message.peerId || message.chatId, {
          caption: captionText,
          file: tmpPath,
          parseMode: 'html',
          replyTo: message.replyToMsgId
        });
        
        await message.delete().catch(() => {});
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      } else {
        await message.edit({ text: captionText, parseMode: 'html' });
      }

    } catch (err) {
      Logger.logUser(telegramId, `Info Error: ${err}`, 'ERROR');
      let errMsg = err.message;
      if (errMsg.includes('Cannot read properties of undefined')) {
        errMsg = 'Username/ID tidak ditemukan.';
      }
      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal menarik data:</b>\n<i>${errMsg}</i></blockquote>`, 
        parseMode: 'html' 
      });
    }
  }
};
