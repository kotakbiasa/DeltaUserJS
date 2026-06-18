import { block, footer } from '../ui.js';

export default {
  name: 'purgeme',
  help: {
    title: 'Purge Me (.purgeme)',
    description: 'Menghapus pesan keluar milik Anda secara massal.',
    usage: '• `.purgeme <1-100>`\n• reply pesan lalu `.purgeme`',
    detail: 'Jika reply pesan, semua pesan Anda dari pesan tersebut sampai command akan dihapus.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !String(message.text || '').toLowerCase().startsWith('.purgeme')) return;

    const count = Number(message.text.trim().split(/\s+/)[1]);
    const replied = message.replyToMessage;
    if (!replied && (!count || count < 1 || count > 100)) {
      await message.edit({ text: block('Format salah', 'Gunakan .purgeme <1-100> atau reply pesan lalu .purgeme.') + footer(settings), parseMode: 'html' });
      return;
    }

    await message.edit({ text: block('Purge Me', 'Membersihkan pesan...') + footer(settings), parseMode: 'html' });

    let ids = [];
    if (replied) {
      const chunk = await client.getMessages(message.chat.id, { minId: replied.id - 1, maxId: message.id + 1, limit: 500 });
      ids = chunk.filter(msg => msg.out).map(msg => msg.id);
    } else {
      const chunk = await client.getMessages(message.chat.id, { fromUser: 'me', limit: count + 1 });
      ids = chunk.map(msg => msg.id);
      if (ids.length < count + 1) {
        const fallback = await client.getMessages(message.chat.id, { limit: (count + 1) * 10 });
        ids = fallback.filter(msg => msg.out).map(msg => msg.id).slice(0, count + 1);
      }
    }

    if (!ids.length) {
      await message.edit({ text: block('Purge Me', 'Tidak ada pesan yang bisa dihapus.') + footer(settings), parseMode: 'html' });
      return;
    }

    await client.deleteMessages(message.chat.id, ids, { revoke: true });
    const done = await client.sendText(message.chat.id, {
      message: block('Purge selesai', `<pre>Terhapus    ${Math.max(0, ids.length - 1)}</pre>`) + footer(settings),
      parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id,
    });
    setTimeout(() => done.delete({ revoke: true }).catch(() => {}), 3000);
  },
};
