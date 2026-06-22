import { helpRegistry } from '../../engine/pluginRegistry.js';

/**
 * Format nama modul agar rapi
 */
function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') return 'AntiPM';
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Helper: Teks menu utama help (Fallback jika inline bot gagal)
 */
function buildHelpMenuText(settings) {
  const plugins = Object.keys(helpRegistry);
  let text = `📖 <b>MENU BANTUAN USERBOT</b>\n\n` +
    `<blockquote>` +
    `<b>Daftar Modul:</b>\n`;
    
  const formattedPlugins = plugins.map(p => formatModuleName(p));
  text += `<code>` + formattedPlugins.join('</code>, <code>') + `</code>\n` +
    `</blockquote>\n` +
    `Ketik <code>.help &lt;nama_modul&gt;</code> untuk melihat detail modul.\n\n` +
    ``;

  return text;
}

/**
 * Konversi Markdown sederhana ke HTML
 */
function markdownToHtml(text) {
  if (!text) return text;
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/_(.*?)_/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

/**
 * Helper: Teks detail modul
 */
function buildModuleDetailText(moduleName, settings) {
  const mod = helpRegistry[moduleName];
  if (!mod) return null;

  return (
    `📦 <b>MODUL: ${mod.title}</b>\n\n` +
    `<details><summary><b>Deskripsi Modul</b></summary>\n${markdownToHtml(mod.description)}\n</details>\n` +
    `<details><summary><b>Penggunaan Modul</b></summary>\n${markdownToHtml(mod.usage)}\n</details>\n` +
    `<details><summary><b>Detail Tambahan</b></summary>\n${markdownToHtml(mod.detail)}\n</details>\n\n` +
    `Ketik <code>.help</code> untuk kembali ke daftar modul.\n\n` +
    ``
  );
}

/**
 * Helper: Dapatkan replyTo untuk forum topic
 */
function getReplyToForTopic(message) {
  if (message.replyTo) {
    return message.replyTo.replyToTopId || message.replyTo.replyToMsgId || message.id;
  }
  return message.id;
}

export default {
  name: 'help',
  help: {
    title: 'Help Menu',
    description: 'Menampilkan panduan penggunaan dan daftar modul yang tersedia di userbot Anda.',
    usage: 'Ketik `.help` untuk menu utama atau `.help <nama_modul>` untuk detail spesifik.',
    detail: '• `.help` akan memunculkan menu inline jika Anda sudah mengatur Custom Inline Bot.\n• Jika belum, menu text biasa akan dimunculkan.'
  },

  /**
   * Handler untuk pesan .help dan .help <modul>
   */
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase().startsWith('.help')) {
      try {
        const parts = message.message.trim().split(' ');
        const replyToMsgId = getReplyToForTopic(message);
        
        if (parts.length === 1) {
          // --- .help → Coba panggil Master Bot via Inline Query ---
          try {
            // Cek apakah user memiliki custom inline bot
            const botUsername = settings.inline_bot_username || global.MASTER_BOT_USERNAME || 'DeltaUbot_bot';

            const results = await Promise.race([
              client.inlineQuery(botUsername, 'help_ubot'),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout (3s): Inline bot tidak merespon. Pastikan Inline Mode aktif di @BotFather.")), 3000))
            ]);
            
            if (results && results.length > 0) {
              // Kirim hasil inline query menggunakan method .click()
              await results[0].click(message.peerId, replyToMsgId);
              // Hapus pesan .help asli agar rapi
              try { await message.delete(); } catch (e) {}
              return;
            } else {
              throw new Error("No inline result from bot (Inline mode mungkin belum diaktifkan di @BotFather)");
            }
          } catch (inlineErr) {
            console.log("Inline help fallback:", inlineErr.message);
            // Fallback: Tampilkan menu teks biasa jika inline gagal
            const text = buildHelpMenuText(settings);
            await message.edit({ text, parseMode: 'html' });
          }

        } else {
          // --- .help <nama_modul> → Tampilkan detail modul ---
          const moduleName = parts[1].toLowerCase();
          const targetModule = helpRegistry[moduleName];

          if (targetModule) {
            const text = buildModuleDetailText(moduleName, settings);
            await message.edit({ text, parseMode: 'html' });
          } else {
            // Modul tidak ditemukan
            const available = Object.keys(helpRegistry).join(', ');
            const safeName = parts[1].replace(/</g, '&lt;').replace(/>/g, '&gt;');
            await message.edit({ 
              text: `<blockquote>❌ Modul "<b>${safeName}</b>" tidak ditemukan!</blockquote>\n\nModul tersedia: <code>${available}</code>\n\nKetik <code>.help</code> untuk melihat daftar modul.`,
              parseMode: 'html'
            });
          }
        }
      } catch (err) {
        console.error('Error in help plugin:', err);
        try {
          await message.edit({ text: `❌ Terjadi kesalahan saat memproses bantuan: ${err.message}` });
        } catch (e) {}
      }
    }
  }
};
