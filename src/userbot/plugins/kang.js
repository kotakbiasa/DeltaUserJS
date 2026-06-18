import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';
import { block, escapeHtml, footer } from '../ui.js';

const EMOJIS = ['☕', '🤡', '🙂', '🤔', '🔪', '😂', '💀', '🔥', '❤️', '✨', '💯', '👍', '🎉', '😎', '😭', '🥺', '😱', '🤯', '😴', '🤪', '🥰', '😈', '👻', '🎭', '🎨', '🎮', '🎵', '⚡', '💎', '🌟'];

function cleanup(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
}

async function mediaBatch(client, message) {
  const reply = message.replyToMessage;
  if (!reply?.media || (!reply.media.document && !reply.media.photo)) return [];
  if (!reply.groupedId) return [reply];
  const history = await client.getMessages(message.chat.id, { limit: 20, offsetId: reply.id + 10 });
  return history
    .filter(item => item.groupedId && item.groupedId.toString() === reply.groupedId.toString())
    .sort((a, b) => a.id - b.id);
}

async function writeStickerSource(client, media, fileBase) {
  const buffer = await client.downloadMedia(media, { workers: 1 });
  if (!buffer) return null;

  if (media.document?.mimeType === 'image/webp') {
    const filePath = `${fileBase}.webp`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  const filePath = `${fileBase}.png`;
  fs.writeFileSync(filePath, buffer);
  try {
    const image = await Jimp.read(filePath);
    image.scaleToFit({ w: 512, h: 512 });
    await image.write(filePath);
  } catch (err) {
    console.log('Kang resize skipped:', err.message);
  }
  return filePath;
}

async function ensurePack(client, me, inputDocument, emoji) {
  const suffix = me.username ? `_by_${me.username}` : `_by_user_${me.id}`;
  const shortName = `kang_${me.id}_1${suffix}`.toLowerCase();
  const title = `${me.firstName || 'User'}'s Kang Pack`;
  const stickerItem = { _: 'inputStickerSetItem', document: inputDocument, emoji };

  try {
    const setInfo = await client.call({ _: 'messages.getStickerSet', stickerset: { _: 'inputStickerSetShortName', shortName },
      hash: 0, });
    await client.call({ _: 'stickers.addStickerToSet',
      stickerset: { _: 'inputStickerSetID', id: setInfo.set.id, accessHash: setInfo.set.accessHash },
      sticker: stickerItem,
    });
  } catch (err) {
    if (!String(err.message).toUpperCase().includes('STICKERSET_INVALID') && !String(err.message).toLowerCase().includes('invalid')) throw err;
    await client.call({ _: 'stickers.createStickerSet', userId: { _: 'inputUserSelf' },
      title,
      shortName,
      stickers: [stickerItem], });
  }

  return shortName;
}

export default {
  name: 'kang',
  help: {
    title: 'Sticker Kanger (.kang)',
    description: 'Menambahkan sticker/foto reply ke pack pribadi.',
    usage: 'Reply sticker/foto lalu `.kang [emoji]`',
    detail: 'Album foto juga diproses berurutan. Media sementara dibersihkan otomatis.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text?.toLowerCase().startsWith('.kang')) return;

    const emoji = message.text.trim().split(/\s+/)[1] || EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const items = await mediaBatch(client, message);
    if (!items.length) {
      await message.edit({ text: block('Kang', 'Reply sticker atau foto yang ingin ditambahkan ke pack.') + footer(settings), parseMode: 'html' });
      return;
    }

    let success = 0;
    let shortName = null;
    try {
      const me = await client.getMyUser();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.media || (!item.media.document && !item.media.photo)) continue;
        await message.edit({ text: block('Kang', `<pre>Proses      ${i + 1}/${items.length}</pre>`) + footer(settings), parseMode: 'html' });

        let tmpPath = null;
        let savedId = null;
        try {
          tmpPath = await writeStickerSource(client, item.media, path.join(process.cwd(), `kang_${Date.now()}_${i}`));
          if (!tmpPath) continue;

          const saved = await client.sendFile('me', { file: tmpPath, forceDocument: true }); // me chat doesn't need replyTo
          if (!saved?.media?.document) continue;
          savedId = saved.id;

          const doc = saved.media.document;
          const inputDocument = { _: 'inputDocument', id: doc.id, accessHash: doc.accessHash, fileReference: doc.fileReference };
          shortName = await ensurePack(client, me, inputDocument, emoji);
          success++;
          if (i < items.length - 1) await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
          if (savedId) { try { await client.deleteMessages('me', [savedId], { revoke: true }); } catch (_) {} }
          cleanup(tmpPath);
        }
      }

      if (!success) {
        await message.edit({ text: block('Kang gagal', 'Tidak ada media yang berhasil ditambahkan.') + footer(settings), parseMode: 'html' });
        return;
      }
      await message.edit({
        text: block('Kang selesai', `<pre>Stiker      ${success}\nPack        https://t.me/addstickers/${escapeHtml(shortName)}</pre>`) + footer(settings),
        parseMode: 'html',
      });
    } catch (err) {
      console.error('Error in kang plugin:', err);
      await message.edit({ text: block('Kang gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    }
  },
};
