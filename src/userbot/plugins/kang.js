import { Api } from 'telegram';
import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';

const EMOJIS = [
    "☕", "🤡", "🙂", "🤔", "🔪", "😂", "💀", "🔥", "❤️", "✨",
    "💯", "👍", "🎉", "😎", "😭", "🥺", "😱", "🤯", "😴", "🤪",
    "🥰", "😈", "👻", "🎭", "🎨", "🎮", "🎵", "⚡", "💎", "🌟",
    "🌙", "☀️", "🌈", "⭐", "💫", "🍕", "🍔", "🍿", "🎂", "🍰",
    "🍩", "🍪", "🐱", "🐶", "🐺", "🦊", "🐼", "🐯", "🦁", "💪",
    "🙏", "👏", "✌️", "🤝", "👊", "🤘"
];

export default {
  name: 'kang',
  help: {
    title: 'Sticker Kanger (.kang)',
    description: 'Mencuri (kang) sticker dan menambahkannya ke pack Anda secara instan menggunakan Raw API Telegram.',
    usage: 'Balas sebuah sticker/foto dengan `.kang [emoji]`.',
    detail: 'Modul ini akan mendownload media yang Anda balas, menyesuaikan ukurannya, lalu membuat/menambahkan stiker ke pack pribadi Anda secara kilat tanpa harus ngobrol dengan bot @Stickers.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase().startsWith('.kang')) {
      const parts = message.message.split(' ');
      const customEmoji = parts[1];
      const emoji = customEmoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      
      const replyMsg = await message.getReplyMessage();
      if (!replyMsg || !replyMsg.media || (!replyMsg.media.document && !replyMsg.media.photo)) {
        await message.edit({ text: '❌ Balas ke sebuah sticker atau foto untuk melakukan kang!' });
        return;
      }
      
      try {
        let mediaMessages = [replyMsg];
        
        // Cek jika ini adalah bagian dari media group (album)
        if (replyMsg.groupedId) {
          await message.edit({ text: '<code>Menganalisis album foto...</code>', parseMode: 'html' });
          const history = await client.getMessages(message.chatId, { limit: 20, offsetId: replyMsg.id + 10 });
          mediaMessages = history.filter(m => m.groupedId && m.groupedId.toString() === replyMsg.groupedId.toString());
          mediaMessages.sort((a, b) => a.id - b.id); // Urutkan dari terlama
        }

        const me = await client.getMe();
        const total = mediaMessages.length;
        let successCount = 0;
        let lastShortName = null;

        for (let i = 0; i < total; i++) {
          const currentMsg = mediaMessages[i];
          if (!currentMsg.media || (!currentMsg.media.document && !currentMsg.media.photo)) {
            continue;
          }

          await message.edit({ text: `<code>[${i+1}/${total}] Meng-kang stiker target...</code>`, parseMode: 'html' });
          
          // Download media
          const buffer = await client.downloadMedia(currentMsg.media, { workers: 1 });
          if (!buffer) continue;

          let tmpPath = path.join(process.cwd(), `kang_${Date.now()}`);
          let isWebp = false;
          let sentMsgId = null;
          
          try {
            if (currentMsg.media.document && currentMsg.media.document.mimeType === 'image/webp') {
              tmpPath += '.webp';
              fs.writeFileSync(tmpPath, buffer);
              isWebp = true;
            } else {
              tmpPath += '.png';
              fs.writeFileSync(tmpPath, buffer);
              try {
                const image = await Jimp.read(tmpPath);
                image.scaleToFit({ w: 512, h: 512 });
                await image.write(tmpPath);
              } catch (e) {
                console.log('Jimp error:', e.message);
              }
            }

            await message.edit({ text: `<code>[${i+1}/${total}] Sedang memproses media...</code>`, parseMode: 'html' });
            
            // Upload ke Saved Messages ("me") untuk mendapatkan InputDocument
            const sentMsg = await client.sendFile('me', { file: tmpPath, forceDocument: true });
            if (!sentMsg || !sentMsg.media || !sentMsg.media.document) {
              continue;
            }
            sentMsgId = sentMsg.id;

            const doc = sentMsg.media.document;
            const inputDocument = new Api.InputDocument({
              id: doc.id,
              accessHash: doc.accessHash,
              fileReference: doc.fileReference
            });

            const packSuffix = me.username ? `_by_${me.username}` : `_by_user_${me.id}`;
            const shortName = `kang_${me.id}_1${packSuffix}`.toLowerCase();
            const title = `${me.firstName || 'User'}'s Kang Pack`;
            lastShortName = shortName;
            
            let createNew = false;
            let stickerSet = null;

            try {
              const setInfo = await client.invoke(
                new Api.messages.GetStickerSet({
                  stickerset: new Api.InputStickerSetShortName({ shortName: shortName }),
                  hash: 0
                })
              );
              stickerSet = setInfo.set;
            } catch (e) {
              if (e.message.includes('STICKERSET_INVALID') || e.message.includes('invalid')) {
                createNew = true;
              } else {
                throw e;
              }
            }

            const stickerItem = new Api.InputStickerSetItem({
              document: inputDocument,
              emoji: emoji
            });

            await message.edit({ text: `<code>[${i+1}/${total}] Menyimpan ke pack pribadi...</code>`, parseMode: 'html' });

            if (createNew) {
              await client.invoke(
                new Api.stickers.CreateStickerSet({
                  userId: new Api.InputUserSelf(),
                  title: title,
                  shortName: shortName,
                  stickers: [stickerItem]
                })
              );
            } else {
              await client.invoke(
                new Api.stickers.AddStickerToSet({
                  stickerset: new Api.InputStickerSetID({
                    id: stickerSet.id,
                    accessHash: stickerSet.accessHash
                  }),
                  sticker: stickerItem
                })
              );
            }

            successCount++;
            
            // Kasih jeda sedikit agar tidak flood API Telegram
            if (i < total - 1) await new Promise(r => setTimeout(r, 1000));
          } finally {
            // Cleanup
            if (sentMsgId) {
              try { await client.deleteMessages('me', [sentMsgId], { revoke: true }); } catch (e) {}
            }
            try {
              if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
              }
            } catch (e) {}
          }
        }
        
        if (successCount > 0) {
          await message.edit({ 
            text: `✅ <b>Berhasil meng-kang ${successCount} stiker!</b>\n\n<a href="https://t.me/addstickers/${lastShortName}">Lihat Pack Anda</a>`,
            parseMode: 'html',
            linkPreview: true
          });
        } else {
          await message.edit({ 
            text: `❌ <b>Gagal! Tidak ada media yang berhasil di-kang.</b>`,
            parseMode: 'html'
          });
        }
        
      } catch (err) {
        console.error('Error in kang plugin:', err);
        await message.edit({ 
          text: `❌ <b>Gagal Kang!</b>\n<code>${err.message}</code>`,
          parseMode: 'html'
        });
      }
    }
  }
};
