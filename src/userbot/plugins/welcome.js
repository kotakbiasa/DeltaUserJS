import { getChatSettings, updateChatSettings } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

function chatKey(message) {
  return String(message.chat.id || message.chat.id || '');
}

function renderTemplate(template, user, chatTitleOrId) {
  const firstName = user?.firstName || user?.first_name || 'User';
  const userId = user?.id || '';
  const mention = userId ? `<a href="tg://user?id=${userId}">${escapeHtml(firstName)}</a>` : escapeHtml(firstName);
  return String(template || '')
    .replaceAll('{mention}', mention)
    .replaceAll('{name}', escapeHtml(firstName))
    .replaceAll('{id}', escapeHtml(userId))
    .replaceAll('{title}', escapeHtml(String(chatTitleOrId)));
}

function actionUsers(message) {
  const action = message.action;
  if (!action) return [];
  if (Array.isArray(action.users)) return action.users;
  if (action.userId) return [action.userId];
  return [];
}

export default {
  name: 'welcome',
  help: {
    title: 'Welcome / Goodbye (.welcome)',
    description: 'Mengatur welcome, goodbye, dan clean service message grup.',
    usage: '• `.welcome on/off`\n• `.setwelcomemsg teks`\n• `.goodbye on/off`\n• `.setgoodbyemsg teks`\n• `.cleanservice on/off`',
    detail: 'Placeholder: `{mention}`, `{name}`, `{id}`, `{title}`.'
  },
  async execute(client, message, settings, telegramId) {
    const key = chatKey(message);
    if (!key || message.isPrivate) return;

    if (message.isOutgoing && message.text) {
      const chatConfig = getChatSettings(telegramId, key);
      const prefix = chatConfig.prefix || '.';
      
      const text = message.text.trim();
      if (!text.startsWith(prefix)) return;

      const args = text.slice(prefix.length).split(/\s+/);
      const cmd = args[0].toLowerCase();
      
      if (!['welcome', 'setwelcomemsg', 'goodbye', 'setgoodbyemsg', 'cleanservice'].includes(cmd)) return;

      if (['welcome', 'goodbye', 'cleanservice'].includes(cmd)) {
        const value = args[1]?.toLowerCase();
        if (!['on', 'off'].includes(value)) {
          await message.edit({ text: block('Format salah', `Gunakan ${code(`${prefix}${cmd} on`)} atau ${code(`${prefix}${cmd} off`)}`) + footer(settings), parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id });
          return;
        }
        const settingKey = cmd === 'welcome' ? 'welcome_enabled' : cmd === 'goodbye' ? 'goodbye_enabled' : 'clean_service';
        await updateChatSettings(telegramId, key, settingKey, value === 'on' ? 1 : 0);
        await message.edit({ text: block('Group Automation', `${cmd}: ${value === 'on' ? 'aktif' : 'nonaktif'}`) + footer(settings), parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id });
        return;
      }

      const template = text.slice(prefix.length + cmd.length).trim();
      const settingKey = cmd === 'setwelcomemsg' ? 'welcome_text' : 'goodbye_text';
      
      if (!template) {
        // Fall back to default if empty
        await updateChatSettings(telegramId, key, settingKey, '');
        await message.edit({ text: block('Template direset', `Template ${cmd.replace('set', '').replace('msg', '')} direset ke default.`) + footer(settings), parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id });
        return;
      }
      
      await updateChatSettings(telegramId, key, settingKey, template);
      await message.edit({ text: block('Template disimpan', escapeHtml(template)) + footer(settings), parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id });
      return;
    }

    if (!message.action) return;
    const chatSettings = getChatSettings(telegramId, key);
    const actionName = message.action.className || message.action.constructor?.name || '';
    const joined = actionName.includes('ChatAddUser') || actionName.includes('ChatJoinedByLink');
    const left = actionName.includes('ChatDeleteUser');

    if (chatSettings.clean_service === 1) {
      try { await client.deleteMessages(message.chat.id || key, [message.id], { revoke: true }); } catch (_) {}
    }

    const titleStr = String(message.chat.id || key);

    if (joined && chatSettings.welcome_enabled === 1) {
      const users = actionUsers(message);
      for (const userId of users.length ? users : [message.sender.id]) {
        try {
          const user = await client.getEntity(userId);
          const welcomeTpl = chatSettings.welcome_text || 'Welcome! Selamat datang {name}!';
          await client.sendText(message.chat.id || key, renderTemplate(welcomeTpl, user, titleStr), { parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id });
        } catch (_) {}
      }
    }

    if (left && chatSettings.goodbye_enabled === 1) {
      try {
        const userId = message.action.userId || message.sender.id;
        const user = await client.getEntity(userId);
        const goodbyeTpl = chatSettings.goodbye_text || 'Goodbye! Selamat tinggal {name}!';
        await client.sendText(message.chat.id || key, renderTemplate(goodbyeTpl, user, titleStr), { parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id });
      } catch (_) {}
    }
  },
};
