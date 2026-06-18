import { block, code, escapeHtml, footer } from '../ui.js';

function normalizeChatId(chatId) {
  return typeof chatId === 'bigint' ? Number(chatId) : chatId;
}

async function sendRichMath(token, chatId, formula, replyToMsgId) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendRichMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: normalizeChatId(chatId),
      rich_message: {
        markdown: `$$${formula}$$`,
        skip_entity_detection: true,
      },
      reply_parameters: replyToMsgId ? { message_id: replyToMsgId } : undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Bot API HTTP ${response.status}`);
  }
  return data.result;
}

export default {
  name: 'latex',
  help: {
    title: 'LaTeX Rich Message (.latex)',
    description: 'Mengirim formula LaTeX sebagai Telegram Rich Message.',
    usage: '• `.latex E = mc^2`\n• `.math \\int_0^1 x^2 \\, dx = \\frac{1}{3}`',
    detail: 'Menggunakan Bot API sendRichMessage melalui custom inline bot token Anda.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text) return;
    const match = message.text.trim().match(/^\.(?:latex|math)(?:\s+([\s\S]+))?$/i);
    if (!match) return;

    const formula = (match[1] || '').trim();
    if (!formula) {
      await message.edit({
        text: block('LaTeX Rich Message', `Gunakan ${code('.latex E = mc^2')} atau ${code('.math \\int_0^1 x^2 \\, dx = \\frac{1}{3}')}`) + footer(settings),
        parseMode: 'html',
      });
      return;
    }

    try {
      if (!settings.inline_bot_token) throw new Error('Custom inline bot token belum diatur.');
      const replyTo = message.replyTo?.replyToTopId || message.replyTo?.replyToMsgId || message.id;
      await sendRichMath(settings.inline_bot_token, message.chat.id, formula, replyTo);
      try { await message.delete(); } catch (_) {}
    } catch (err) {
      await message.edit({ text: block('LaTeX gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    }
  },
};
