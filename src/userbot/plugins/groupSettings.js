import { getChatSettings, updateChatSettings, updateUserbotFeature } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

function chatKey(message) {
  return String(message.chat.id || message.chat.id || '');
}

function render(settings = {}) {
  const keys = Object.keys(settings).sort();
  if (!keys.length) return 'Belum ada setting khusus untuk chat ini.';
  return `<pre>${keys.map(key => `${key.padEnd(12, ' ')} ${escapeHtml(settings[key])}`).join('\n')}</pre>`;
}

export default {
  name: 'groupsettings',
  help: {
    title: 'Group Settings (.chatsettings)',
    description: 'Melihat dan mengatur konfigurasi per grup.',
    usage: '• `.chatsettings`\n• `.setprefix .`\n• `.logging on/off`\n• `.setlang id/en`',
    detail: 'Setting per grup disimpan terpisah untuk fitur lanjutan.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text || message.isPrivate) return;

    const key = chatKey(message);
    const chatConfig = getChatSettings(telegramId, key);
    const prefix = chatConfig.prefix || '.';

    const text = message.text.trim();
    if (!text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (!['chatsettings', 'setprefix', 'logging', 'setlog', 'setlogchannel', 'setlang'].includes(cmd)) return;

    if (cmd === 'chatsettings') {
      await message.edit({ text: block('Chat Settings', render(getChatSettings(telegramId, key))) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'setprefix') {
      const newPrefix = args[1];
      if (!newPrefix || newPrefix.length > 1 || newPrefix.match(/^[a-zA-Z0-9]$/)) {
        await message.edit({ text: block('Tidak Valid', `Contoh: ${code(`${prefix}setprefix .`)}`) + footer(settings), parseMode: 'html' });
        return;
      }
      await updateChatSettings(telegramId, key, 'prefix', newPrefix);
      await message.edit({ text: block('Prefix disimpan', `Prefix chat: ${code(newPrefix)}`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'logging' || cmd === 'setlog') {
      const value = args[1]?.toLowerCase();
      if (!['on', 'off'].includes(value)) {
        await message.edit({ text: block('Format salah', `Gunakan ${code(`${prefix}logging on`)} atau ${code(`${prefix}logging off`)}`) + footer(settings), parseMode: 'html' });
        return;
      }
      await updateChatSettings(telegramId, key, 'logging', value === 'on');
      // For backwards compat in other plugins that might use log_enabled = 1
      await updateChatSettings(telegramId, key, 'log_enabled', value === 'on' ? 1 : 0);
      await message.edit({ text: block('Log setting', `Log chat ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}.`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'setlogchannel') {
      const channelId = Number(args[1]);
      if (!channelId) return;
      await updateChatSettings(telegramId, key, 'log_channel', channelId);
      await message.edit({ text: block('Log Channel', `Channel log diatur ke ${code(channelId)}`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'setlang') {
      const lang = args[1]?.toLowerCase();
      if (!['id', 'en'].includes(lang)) {
        await message.edit({ text: block('Invalid', `Pilih ${code('id')} atau ${code('en')}.`) + footer(settings), parseMode: 'html' });
        return;
      }
      await updateChatSettings(telegramId, key, 'lang', lang);
      await message.edit({ text: block('Bahasa disimpan', `Bahasa chat: ${code(lang)}`) + footer(settings), parseMode: 'html' });
    }
  },
};
