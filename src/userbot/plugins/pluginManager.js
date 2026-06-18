import { loadedPlugins, getPlugin, normalizePluginName } from '../pluginRegistry.js';
import { disablePlugin, enablePlugin, getDisabledPlugins } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

const COMMANDS = ['.plugins', '.disable', '.enable'];
const PROTECTED = new Set(['pluginmanager', 'admin']);

function pluginRows(disabledPlugins = []) {
  const disabled = new Set(disabledPlugins.map(normalizePluginName));
  return loadedPlugins
    .map(plugin => {
      const name = normalizePluginName(plugin.name);
      const active = disabled.has(name) ? '—' : '✓';
      const protectedFlag = PROTECTED.has(name) ? '✓' : '—';
      return `${name.padEnd(16, ' ')} ${active.padEnd(6, ' ')} ${protectedFlag}`;
    })
    .join('\n');
}

export default {
  name: 'pluginmanager',
  help: {
    title: 'Plugin Manager (.plugins)',
    description: 'Mengaktifkan atau menonaktifkan plugin per akun userbot.',
    usage: '• `.plugins`\n• `.disable <plugin>`\n• `.enable <plugin>`',
    detail: 'Plugin nonaktif tidak dijalankan untuk akun Anda. Plugin admin dan pluginmanager dilindungi.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;

    const args = message.text.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    if (!COMMANDS.includes(cmd)) return;

    const disabled = getDisabledPlugins(telegramId);

    if (cmd === '.plugins') {
      const body = `<pre>Plugin           Aktif  Protected\n${pluginRows(disabled)}</pre>`;
      await message.edit({ text: block('Plugin Studio', body) + footer(settings), parseMode: 'html' });
      return;
    }

    const pluginName = normalizePluginName(args[1]);
    if (!pluginName) {
      await message.edit({
        text: block('Format salah', `Gunakan ${code(`${cmd} nama_plugin`)}\nContoh: ${code(`${cmd} gcast`)}`) + footer(settings),
        parseMode: 'html',
      });
      return;
    }

    const plugin = getPlugin(pluginName);
    if (!plugin) {
      await message.edit({
        text: block('Plugin tidak ditemukan', `${code(pluginName)} tidak ada di registry.`) + footer(settings),
        parseMode: 'html',
      });
      return;
    }

    if (cmd === '.disable') {
      if (PROTECTED.has(plugin.name)) {
        await message.edit({
          text: block('Protected Plugin', `${code(plugin.name)} tidak bisa dinonaktifkan.`) + footer(settings),
          parseMode: 'html',
        });
        return;
      }
      await disablePlugin(telegramId, plugin.name);
      await message.edit({
        text: block('Plugin dinonaktifkan', `${code(plugin.name)} sekarang tidak akan dijalankan.`) + footer(settings),
        parseMode: 'html',
      });
      return;
    }

    if (cmd === '.enable') {
      await enablePlugin(telegramId, plugin.name);
      await message.edit({
        text: block('Plugin diaktifkan', `${code(plugin.name)} aktif kembali.`) + footer(settings),
        parseMode: 'html',
      });
    }
  },
};
