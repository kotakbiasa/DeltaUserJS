import { getBroadcastBlacklist } from '../../database/db.js';
import { block, footer } from '../ui.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  name: 'gcast',
  help: {
    title: 'Global Broadcast (.gcast)',
    description: 'Mengirim pesan ke semua grup yang Anda ikuti.',
    usage: '• `.gcast <teks>`\n• reply pesan lalu `.gcast`',
    detail: 'Broadcast melewati grup blacklist dan memakai delay aman antar pesan.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;
    const text = message.text.trim();
    if (!text.toLowerCase().startsWith('.gcast')) return;

    const broadcastText = text.slice('.gcast'.length).trim();
    const replied = message.replyToMessage;
    if (!broadcastText && !replied) {
      await message.edit({ text: block('Broadcast kosong', 'Isi teks broadcast atau reply pesan target.') + footer(settings), parseMode: 'html' });
      return;
    }

    await message.edit({ text: block('Global Broadcast', 'Mengumpulkan daftar grup...') + footer(settings), parseMode: 'html' });

    const dialogs = await client.getDialogs();
    const groups = dialogs.filter(dialog => dialog.isGroup);
    const blacklist = new Set(getBroadcastBlacklist(telegramId).map(String));
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    await message.edit({
      text: block('Global Broadcast', `<pre>Target      ${groups.length}\nStatus      Mengirim...</pre>`) + footer(settings),
      parseMode: 'html',
    });

    for (const group of groups) {
      if (blacklist.has(String(group.id))) {
        skipped++;
        continue;
      }

      try {
        if (replied) {
          await client.sendText(group.id, {
            message: broadcastText || replied.message,
            file: replied.media,
          });
        } else {
          await client.sendText(group.id, broadcastText);
        }
        sent++;
        await sleep(2000);
      } catch (_) {
        failed++;
      }
    }

    await message.edit({
      text: block('Broadcast selesai', `<pre>Terkirim    ${sent}\nBlacklist   ${skipped}\nGagal       ${failed}</pre>`) + footer(settings),
      parseMode: 'html',
    });
  },
};
