import fs from 'fs';
import { block, escapeHtml, footer } from '../ui.js';

function line(key, value) {
  return `${key.padEnd(12, ' ')} ${escapeHtml(value ?? '-')}`;
}

function userTags(user) {
  return [
    user.premium && 'Premium',
    user.bot && 'Bot',
    user.verified && 'Verified',
    user.scam && 'Scam',
    user.fake && 'Fake',
  ].filter(Boolean).join(', ') || 'Normal';
}

async function resolveTarget(client, message, arg) {
  const replied = message.replyToMessage;
  if (replied) return client.getEntity(replied.sender?.id);
  if (arg) return client.getEntity(arg.toLowerCase() === 'me' ? 'me' : arg);
  return message.isPrivate ? client.getEntity('me') : client.getEntity(message.chat.id);
}

export default {
  name: 'info',
  help: {
    title: 'Whois / Info (.info)',
    description: 'Menampilkan info user atau grup.',
    usage: '• `.info`\n• `.info <username>`\n• reply target lalu `.info`',
    detail: 'Menampilkan foto profil jika tersedia, ID, username, bio/deskripsi, dan status.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text) return;
    const args = message.text.trim().split(/\s+/);
    if (args[0].toLowerCase() !== '.info') return;

    await message.edit({ text: block('Info', 'Mengambil data target...') + footer(settings), parseMode: 'html' });

    try {
      const target = await resolveTarget(client, message, args[1]);
      let photoBuffer = null;
      try { photoBuffer = await client.downloadProfilePhoto(target); } catch (_) {}

      let caption = '';
      if (target.className === 'User' || target.className === 'UserEmpty') {
        const full = await client.call({ _: 'users.getFullUser', id: target });
        const user = full.users[0];
        const fullUser = full.fullUser;
        const rows = [
          line('Nama', [user.firstName, user.lastName].filter(Boolean).join(' ') || '-'),
          line('Username', user.username ? `@${user.username}` : 'Tidak disetel'),
          line('User ID', user.id),
          line('Bio', fullUser.about || 'Tidak ada'),
          line('Status', userTags(user)),
        ];
        caption = block('User Information', `<pre>${rows.join('\n')}</pre>`) + footer(settings);
      } else {
        let rows = [];
        try {
          const full = await client.call({ _: 'channels.getFullChannel', channel: target });
          const chat = full.chats[0];
          const fullChat = full.fullChat;
          rows = [
            line('Nama', chat.title),
            line('Username', chat.username ? `@${chat.username}` : 'Private'),
            line('Group ID', `-100${chat.id}`),
            line('Member', fullChat.participantsCount || chat.participantsCount || '?'),
            line('Deskripsi', fullChat.about || 'Tidak ada'),
          ];
        } catch (_) {
          rows = [line('Nama', target.title), line('ID', `-${target.id}`)];
        }
        caption = block('Group Information', `<pre>${rows.join('\n')}</pre>`) + footer(settings);
      }

      if (photoBuffer?.length) {
        const tmpPath = `/tmp/info_${Date.now()}.jpg`;
        fs.writeFileSync(tmpPath, photoBuffer);
        await client.sendMedia(message.chat.id, tmpPath, { caption: caption, parseMode: 'html', replyTo: message.id });
        await message.delete();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      } else {
        await message.edit({ text: caption, parseMode: 'html' });
      }
    } catch (err) {
      await message.edit({ text: block('Info gagal', escapeHtml(err.message || 'Target tidak ditemukan.')) + footer(settings), parseMode: 'html' });
    }
  },
};
