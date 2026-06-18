import { block, escapeHtml, footer } from '../ui.js';

export default {
  name: 'stalk',
  help: {
    title: 'Deep Stalking (.stalk)',
    description: 'Menganalisis riwayat pesan target di chat saat ini.',
    usage: '• `.stalk <@username atau ID>`\n• reply target lalu `.stalk`',
    detail: 'Mengambil hingga 100 pesan terakhir target di chat ini.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text) return;
    const args = message.text.trim().split(/\s+/);
    if (args[0].toLowerCase() !== '.stalk') return;

    const replied = message.replyToMessage;
    const target = replied?.senderId ? Number(replied.sender?.id) : args[1];
    if (!target) {
      await message.edit({ text: block('Target kosong', 'Berikan username/ID atau reply pesan target.') + footer(settings), parseMode: 'html' });
      return;
    }

    await message.edit({ text: block('Stalk', 'Mengambil riwayat pesan target...') + footer(settings), parseMode: 'html' });

    try {
      let entity = null;
      try { entity = await client.getEntity(target); } catch (_) {}
      const history = await client.getMessages(message.chat.id, { fromUser: target, limit: 100 });

      if (!history?.length) {
        await message.edit({ text: block('Tidak ada jejak', 'Target tidak ditemukan dalam 100 pesan terakhir atau pesan sudah terhapus.') + footer(settings), parseMode: 'html' });
        return;
      }

      const name = entity ? `${entity.firstName || ''}${entity.lastName ? ` ${entity.lastName}` : ''}`.trim() : 'Pengguna';
      const id = entity?.id || target;
      const firstSeen = history.at(-1)?.date ? new Date(history.at(-1).date * 1000).toLocaleString() : '-';
      const snippets = history
        .filter(item => item.message?.trim())
        .slice(0, 3)
        .map(item => {
          const text = item.message.trim().slice(0, 70);
          const date = new Date(item.date * 1000).toLocaleDateString();
          return `• ${escapeHtml(text)}${item.message.length > 70 ? '...' : ''} (${date})`;
        })
        .join('\n') || '• Hanya media/sticker atau pesan kosong.';

      await message.edit({
        text: block('Stalk Report', `<pre>Target      ${escapeHtml(name)}\nID          ${escapeHtml(id)}\nPesan       ${history.length}\nAwal        ${escapeHtml(firstSeen)}</pre>\n${snippets}`) + footer(settings),
        parseMode: 'html',
      });
    } catch (err) {
      await message.edit({ text: block('Stalk gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    }
  },
};
