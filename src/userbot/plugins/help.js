import { helpRegistry } from '../pluginRegistry.js';

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
function buildHelpMenuText() {
  const plugins = Object.keys(helpRegistry);
  const pluginCount = plugins.length;
  const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const uptimeMin = Math.round(process.uptime() / 60);

  let text = `D E L T A   U B O T   J S\n` +
    `───────────────────────\n` +
    `MENU BANTUAN USERBOT\n\n` +
    `───────────────────────\n` +
    `<b>Daftar Modul:</b>\n`;
    
  const formattedPlugins = plugins.map(p => formatModuleName(p));
  text += `<code>` + formattedPlugins.join('</code>, <code>') + `</code>\n\n`;
  text += `Ketik <code>.help &lt;nama_modul&gt;</code> untuk melihat detail modul.`;

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
function buildModuleDetailText(moduleName) {
  const mod = helpRegistry[moduleName];
  if (!mod) return null;

  return (
    `D E L T A   U B O T   J S\n` +
    `───────────────────────\n` +
    `<b>${mod.title}</b>\n\n` +
    `Deskripsi: ${markdownToHtml(mod.description)}\n` +
    `Penggunaan: ${markdownToHtml(mod.usage)}\n\n` +
    `Detail Fitur:\n${markdownToHtml(mod.detail)}\n\n` +
    `───────────────────────\n` +
    `Ketik <code>.help</code> untuk kembali ke daftar modul.`
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
            const botUsername = global.MASTER_BOT_USERNAME;
            if (!botUsername) throw new Error("Bot username not loaded");

            const results = await client.inlineQuery(botUsername, 'help');
            
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
            const text = buildHelpMenuText();
            await message.edit({ text, parseMode: 'html' });
          }

        } else {
          // --- .help <nama_modul> → Tampilkan detail modul ---
          const moduleName = parts[1].toLowerCase();
          const targetModule = helpRegistry[moduleName];

          if (targetModule) {
            const text = buildModuleDetailText(moduleName);
            await message.edit({ text, parseMode: 'html' });
          } else {
            // Modul tidak ditemukan
            const available = Object.keys(helpRegistry).join(', ');
            const safeName = parts[1].replace(/</g, '&lt;').replace(/>/g, '&gt;');
            await message.edit({ 
              text: `Modul "<b>${safeName}</b>" tidak ditemukan!\n\nModul tersedia: <code>${available}</code>\n\nKetik <code>.help</code> untuk melihat daftar modul.`,
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
