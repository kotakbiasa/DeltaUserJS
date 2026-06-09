import fs from 'fs';
import crypto from 'crypto';

const COLOR_LIST = [
  "White", "Black", "Gray", "Blue", "Green", "Red", "#1F1F1F", "#2E3440", "#0f172a"
];

export default {
  name: 'beautify',
  help: {
    title: 'Code to Image (Carbon)',
    description: 'Mengubah teks atau kode sumber menjadi gambar screenshot (Carbon) yang sangat elegan.',
    usage: '• `.carbon [kode]` (Gambar warna gelap elegan)\n• `.rcarbon [kode]` (Gambar dengan warna random)\n• `.ccarbon [warna] [kode]` (Contoh: `.ccarbon #FF0000 halo`)\n• Anda juga bisa me-reply sebuah pesan.',
    detail: 'Modul ini menggunakan API Carbonara publik secara langsung tanpa membuka browser virtual, menjadikannya sangat ringan dan cepat.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (!['.carbon', '.rcarbon', '.ccarbon'].includes(cmd)) return;

    await message.edit({ 
      text: `<blockquote>🎨 <b>Processing Carbon...</b></blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
      parseMode: 'html' 
    });

    try {
      let code = '';
      let color = '#2E3440'; // Default dark theme background

      const replied = await message.getReplyMessage();
      
      if (cmd === '.carbon' || cmd === '.rcarbon') {
        if (cmd === '.rcarbon') {
          color = COLOR_LIST[Math.floor(Math.random() * COLOR_LIST.length)];
        }

        if (replied && replied.message) {
          code = replied.message;
        } else {
          code = text.substring(cmd.length).trim();
        }
      } else if (cmd === '.ccarbon') {
        if (replied && replied.message) {
          color = args[1] || '#2E3440';
          code = replied.message;
        } else {
          color = args[1] || '#2E3440';
          // Potong nama perintah dan argument warna
          code = text.substring(cmd.length + color.length + 1).trim();
        }
      }

      if (!code) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal:</b> Harap berikan teks kode atau balas (reply) ke pesan yang berisi teks!</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }

      // Memanggil API Carbonara
      const payload = {
        code: code,
        backgroundColor: color
      };

      const response = await fetch("https://carbonara.solopov.dev/api/cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API error: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(buffer);
      
      const tmpPath = `/tmp/carbon_${crypto.randomBytes(4).toString('hex')}.png`;
      fs.writeFileSync(tmpPath, imageBuffer);

      const captionText = `<blockquote>🎨 <b>Carbonised</b></blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`;

      await client.sendMessage(message.peerId, {
        message: captionText,
        file: tmpPath,
        parseMode: 'html',
        replyTo: message.replyToMsgId
      });
      
      await message.delete();
      
      // Hapus file setelah sukses dikirim
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }

    } catch (err) {
      console.error('Carbon Error:', err);
      await message.edit({ 
        text: `<blockquote>❌ <b>Carbon Failed:</b>\n<i>${err.message}</i></blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
        parseMode: 'html' 
      });
    }
  }
};
