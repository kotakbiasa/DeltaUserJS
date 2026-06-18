import { helpRegistry } from '../pluginRegistry.js';

function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') return 'AntiPM';
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function markdownToHtml(text = '') {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/_(.*?)_/g, '<i>$1</i>');
}

function helpMenuText(settings) {
  const customName = escapeHtml(settings?.custom_name || 'DeltaUbotJS');
  const modules = Object.keys(helpRegistry).sort();
  const rows = modules.map(name => `· <b>${formatModuleName(name)}</b> <code>(${name})</code>`).join('\n') || 'Belum ada modul.';
  
  return `<b>📖 Module Library</b>\n` +
         `<blockquote>${customName}\nLibrary command userbot Anda.</blockquote>\n\n` +
         `${rows}\n\n` +
         `<b>Total Modul:</b> <code>${modules.length}</code>\n` +
         `<b>Panduan:</b> <code>.help nama_modul</code>`;
}

function moduleDetail(moduleName, settings) {
  const customName = escapeHtml(settings?.custom_name || 'DeltaUbotJS');
  const mod = helpRegistry[moduleName];
  if (!mod) return `<b>📦 Modul Tidak Ditemukan</b>\n<blockquote>Modul <code>${escapeHtml(moduleName)}</code> tidak ada di dalam sistem.</blockquote>`;
  
  return `<b>📦 ${escapeHtml(mod.title || formatModuleName(moduleName))}</b>\n` +
         `<blockquote>${customName} · Detail Modul</blockquote>\n\n` +
         `<b>Deskripsi</b>\n${markdownToHtml(mod.description)}\n\n` +
         `<b>Penggunaan</b>\n${markdownToHtml(mod.usage)}\n\n` +
         `<b>Detail Tambahan</b>\n${markdownToHtml(mod.detail)}\n\n` +
         `<b>Kembali:</b> <code>.help</code>`;
}


async function sendInlineHelp(client, message, settings, query = 'help') {
  const botUsername = settings.inline_bot_username;
  if (!botUsername) throw new Error('custom inline bot belum diset');
  const results = await client.inlineQuery(botUsername, query);
  if (!results?.length) throw new Error('inline result kosong');

  const replyId = message.replyTo?.replyToTopId || message.replyToMsgId;
  await results[0].click(message.chat.id, replyId);
  try { await message.delete(); } catch (_) {}
}

export default {
  name: 'help',
  help: {
    title: 'Help Menu',
    description: 'Menampilkan library modul dan detail penggunaan command.',
    usage: '• `.help`\n• `.help <nama_modul>`',
    detail: 'Jika custom inline bot tersedia, `.help` memakai inline rich library; jika tidak, memakai fallback HTML modern.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !String(message.text || '').toLowerCase().startsWith('.help')) return;

const parts = message.text.trim().split(/\s+/);
    if (parts.length === 1) {
      
      try {
        await sendInlineHelp(client, message, settings, 'help');
        return;
      } catch (err) {
        console.log('Inline help fallback:', err.message);
        await message.edit({ text: helpMenuText(settings), parseMode: 'html' });
        return;
      }
    }

    const moduleName = String(parts[1] || '').toLowerCase();
const text = moduleDetail(moduleName, settings);

    

    try {
      await sendInlineHelp(client, message, settings, `help ${moduleName}`);
      return;
    } catch (err) {
      console.log('Inline module help fallback:', err.message);
      await message.edit({ text, parseMode: 'html' });
      return;
    }
  },
};
