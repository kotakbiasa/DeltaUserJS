import fs from 'fs';
import crypto from 'crypto';
import { block, escapeHtml, footer } from '../ui.js';

const COLORS = ['White', 'Black', 'Gray', 'Blue', 'Green', 'Red', '#1F1F1F', '#2E3440', '#0f172a'];

async function carbonImage(code, backgroundColor) {
  const response = await fetch('https://carbonara.solopov.dev/api/cook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, backgroundColor }),
  });
  if (!response.ok) throw new Error(`Carbonara HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export default {
  name: 'beautify',
  help: {
    title: 'Code to Image (Carbon)',
    description: 'Mengubah teks/kode menjadi gambar Carbon.',
    usage: '• `.carbon [kode]`\n• `.rcarbon [kode]`\n• `.ccarbon [warna] [kode]`\n• Bisa reply pesan.',
    detail: 'Menggunakan API Carbonara publik tanpa browser.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text) return;

    const text = message.text.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    if (!['.carbon', '.rcarbon', '.ccarbon'].includes(cmd)) return;

    await message.edit({ text: block('Carbon', 'Membuat gambar kode...') + footer(settings), parseMode: 'html' });

    let color = '#2E3440';
    let code = '';
    const replied = message.replyToMessage;

    if (cmd === '.rcarbon') color = COLORS[Math.floor(Math.random() * COLORS.length)];
    if (cmd === '.ccarbon') color = args[1] || color;

    if (replied?.message) {
      code = replied.message;
    } else if (cmd === '.ccarbon') {
      const match = text.match(/^\.ccarbon\s+\S+\s+([\s\S]+)$/i);
      code = match ? match[1].trimEnd() : '';
    } else {
      const match = text.match(/^\.[rc]?carbon\s+([\s\S]+)$/i);
      code = match ? match[1].trimEnd() : '';
    }

    if (!code) {
      await message.edit({ text: block('Carbon kosong', 'Berikan teks/kode atau reply pesan berisi teks.') + footer(settings), parseMode: 'html' });
      return;
    }

    const tmpPath = `/tmp/carbon_${crypto.randomBytes(5).toString('hex')}.png`;
    try {
      fs.writeFileSync(tmpPath, await carbonImage(code, color));
      await client.sendText(message.chat.id, {
        message: block('Carbonised', `<pre>Theme       ${escapeHtml(color)}</pre>`) + footer(settings),
        file: tmpPath,
        parseMode: 'html',
        replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id,
      });
      await message.delete();
    } catch (err) {
      await message.edit({ text: block('Carbon gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    } finally {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    }
  },
};
