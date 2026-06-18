import { block, escapeHtml, footer } from '../ui.js';

function topicId(message) {
  if (!message.replyTo) return null;
  return message.replyTo.replyToTopId || message.replyTo.replyToMsgId || null;
}

function row(key, value) {
  return `${key.padEnd(12, ' ')} ${escapeHtml(value ?? '-')}`;
}

export default {
  name: 'id',
  help: {
    title: 'Info ID (.id)',
    description: 'Mendapatkan ID chat, topic, akun sendiri, atau target reply.',
    usage: '• `.id`\n• Reply pesan orang lalu ketik `.id`',
    detail: 'Jika digunakan sebagai reply, output juga memuat ID dan nama target.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || String(message.text || '').trim().toLowerCase() !== '.id') return;

    const replied = message.replyToMessage;
    const rows = [row('Chat', message.chat.id)];
    const topId = topicId(message);
    if (topId) rows.push(row('Topic', topId));

    if (replied) {
      const sender = await replied.getSender();
      const fullName = sender ? `${sender.firstName || ''}${sender.lastName ? ` ${sender.lastName}` : ''}`.trim() : 'Tidak dikenal';
      rows.push(row('Target ID', replied.sender?.id));
      rows.push(row('Target', fullName || 'Tidak dikenal'));
    } else {
      rows.push(row('Your ID', telegramId));
    }

    await message.edit({
      text: block(replied ? 'Info Chat & Target' : 'Info Chat', `<pre>${rows.join('\n')}</pre>`) + footer(settings),
      parseMode: 'html',
    });
  },
};
