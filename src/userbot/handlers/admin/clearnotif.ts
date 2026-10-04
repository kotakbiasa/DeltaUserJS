import { escapeHtml } from '../../../utils/richMessage.js';
import { sleep } from '../../../utils/async.js';
import type { CompatClient, LegacyPeer } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';

/** mtcute hanya menyediakan iterator dialog; getDialogs() milik GramJS. */
async function collectDialogs(client: CompatClient) {
  const out = [];
  for await (const dialog of client.iterDialogs()) {
    out.push(dialog);
  }
  return out;
}

export default {
  name: 'clearnotif',
  version: '1.0.0',
  description: 'Membersihkan notifikasi angka tag/mention dan reaksi yang menumpuk.',
  help: {
    title: 'Clear Notifications',
    description: 'Membersihkan semua tag (mention) dan reaksi yang menumpuk agar notifikasi chat kembali bersih.',
    usage: '`.clear_@` - Bersihkan mention chat ini\n`.clear_all_@` - Bersihkan semua mention\n`.clear_reacts` - Bersihkan reaksi chat ini\n`.clear_all_reacts` - Bersihkan semua reaksi',
    detail: 'Berguna saat notifikasi angka tag/mention dan reaksi menumpuk terlalu banyak. Perintah ini akan menandai semuanya sudah dibaca.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, _settings: UserbotSettings, _telegramId: number) {
    if (!message.out || !message.message) {return;}

    const cmd = message.message.split(' ')[0].toLowerCase();
    const validCommands = ['.clear_@', '.clear_all_@', '.clear_reacts', '.clear_all_reacts'];

    if (!validCommands.includes(cmd)) {return;}

    try {
      // Hanya dua method TL yang dipakai di sini; menyempitkan tipenya membuat
      // skema argumennya ikut diperiksa compiler.
      type ReadMethod = 'messages.readMentions' | 'messages.readReactions';
      const callApi = async (method: ReadMethod, peer: LegacyPeer) => {
        if (typeof client.call === 'function') {
          return await client.call({ _: method, peer: await client.resolvePeer(peer) });
        }
        if (typeof client.invoke === 'function') {
          return await client.invoke({ _: method, peer });
        }
      };

      if (cmd === '.clear_@') {
        await message.delete().catch(() => { /* ignore */ });
        await callApi('messages.readMentions', toPeer(message.chatId));
      }

      else if (cmd === '.clear_reacts') {
        await message.delete().catch(() => { /* ignore */ });
        await callApi('messages.readReactions', toPeer(message.chatId));
      }

      else if (cmd === '.clear_all_@') {
        let counter = 0;
        await message.edit({ text: '⏳ <b>Menyapu bersih semua mention (tag)...</b>', parseMode: 'html' });

        const dialogs = await collectDialogs(client);
        for (const dialog of dialogs) {
          if (dialog.unreadMentionsCount > 0) {
            await callApi('messages.readMentions', toPeer(dialog.peer.id));
            counter++;

            if (counter % 5 === 0) {
              await message.edit({ text: `⏳ <b>Menyapu bersih semua mention (tag)...</b>\n\n✅ <b>Dibersihkan:</b> <code>${escapeHtml(String(counter))}</code> chat`, parseMode: 'html' }).catch(() => { /* ignore */ });
              await sleep(1500); 
            }
          }
        }
        await message.edit({ text: `<blockquote>🧹 <b>Selesai!</b> ${escapeHtml(String(counter))} grup/chat dengan mention telah dibersihkan.</blockquote>`, parseMode: 'html' });
      }

      else if (cmd === '.clear_all_reacts') {
        let counter = 0;
        await message.edit({ text: '⏳ <b>Menyapu bersih semua reaksi...</b>', parseMode: 'html' });

        const dialogs = await collectDialogs(client);
        for (const dialog of dialogs) {
          if (dialog.isUnread || dialog.unreadCount > 0) {
            try {
              await callApi('messages.readReactions', toPeer(dialog.peer.id));
              counter++;

              if (counter % 5 === 0) {
                await message.edit({ text: `⏳ <b>Menyapu bersih semua reaksi...</b>\n\n✅ <b>Dibersihkan:</b> <code>${escapeHtml(String(counter))}</code> chat`, parseMode: 'html' }).catch(() => { /* ignore */ });
                await sleep(1500);
              }
            } catch {
              // ignore
            }
          }
        }
        await message.edit({ text: `<blockquote>🧹 <b>Selesai!</b> ${escapeHtml(String(counter))} grup/chat dengan reaksi telah dibersihkan.</blockquote>`, parseMode: 'html' });
      }

    } catch (err) {
      await message.edit({ text: `<blockquote>❌ <b>Terjadi kesalahan:</b> ${escapeHtml(err.message)}</blockquote>`, parseMode: 'html' });
    }
  }
};
