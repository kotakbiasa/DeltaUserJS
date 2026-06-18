import { block, code, escapeHtml, footer } from '../ui.js';

function normalizeChatId(chatId) {
  return typeof chatId === 'bigint' ? Number(chatId) : chatId;
}

function topicId(message) {
  return message.replyTo?.replyToTopId || message.replyTo?.replyToMsgId || undefined;
}

function replyId(message) {
  return message.replyTo?.replyToTopId || message.replyTo?.replyToMsgId || message.id;
}

function example(type, input) {
  const formula = input || 'E = mc^2';
  if (type === 'latex') {
    return `# Rich Message · LaTeX\n\nInline: $x^2 + y^2 = z^2$\n\nBlock:\n\n$$${formula}$$\n\n\`\`\`math\n${formula}\n\`\`\``;
  }
  if (type === 'table') {
    return `# Rich Message · Table\n\n| Fitur | Contoh | Status |\n|:------|:------:|-------:|\n| Inline Math | $x^2 + y^2$ | ✓ |\n| Block Math | $$E = mc^2$$ | ✓ |\n| Table | Markdown table | ✓ |\n\n> Dikirim lewat \`sendRichMessage\`.`;
  }
  if (type === 'details') {
    return `# Rich Message · Details\n\n<details open><summary>Formula</summary>\n\n$$${formula}$$\n\n- Markdown\n- HTML\n- Inline math\n\n</details>`;
  }
  return `# Rich Message Demo\n\nTelegram Rich Message mendukung **Markdown**, <u>HTML</u>, tabel, details, dan LaTeX.\n\nInline: $x^2 + y^2$\n\nBlock:\n\n$$E = mc^2$$\n\n---\n\n- \`.richapi latex <formula>\`\n- \`.richapi table\`\n- \`.richapi details\``;
}

async function sendRich(token, message, markdown) {
  const body = {
    chat_id: normalizeChatId(message.chat.id),
    rich_message: { markdown, skip_entity_detection: true },
    reply_parameters: { message_id: replyId(message) },
  };
  const threadId = topicId(message);
  if (threadId) body.message_thread_id = threadId;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendRichMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.description || `Bot API HTTP ${res.status}`);
  return data.result;
}

function help(settings) {
  return block('Rich API Test', [
    'Modul demo Bot API sendRichMessage.',
    '',
    `${code('.richapi')} — demo umum`,
    `${code('.richapi latex E = mc^2')} — demo LaTeX`,
    `${code('.richapi table')} — demo tabel`,
    `${code('.richapi details')} — demo details`,
    '',
    'Custom inline bot token harus sudah diatur.',
  ].join('\n')) + footer(settings);
}

export default {
  name: 'richapi',
  help: {
    title: 'Rich API Test (.richapi)',
    description: 'Mengirim contoh native Telegram Rich Message.',
    usage: '• `.richapi`\n• `.richapi latex E = mc^2`\n• `.richapi table`\n• `.richapi details`',
    detail: 'Menggunakan endpoint Bot API `sendRichMessage` dengan payload `rich_message.markdown`.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text) return;
    const match = message.text.trim().match(/^\.richapi(?:\s+(help|latex|table|details))?(?:\s+([\s\S]+))?$/i);
    if (!match) return;

    const type = (match[1] || 'demo').toLowerCase();
    const input = (match[2] || '').trim();
    if (type === 'help') {
      await message.edit({ text: help(settings), parseMode: 'html' });
      return;
    }

    try {
      if (!settings.inline_bot_token) throw new Error('Custom inline bot token belum diatur.');
      await sendRich(settings.inline_bot_token, message, example(type, input));
      try { await message.delete(); } catch (_) {}
    } catch (err) {
      await message.edit({ text: block('Rich API gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    }
  },
};
