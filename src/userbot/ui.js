/**
 * Shared UI helpers for DeltaUserJS userbot plugins.
 * Output target: Telegram HTML / GramJS parseMode html.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '');
}

export function code(value) {
  return `<code>${escapeHtml(value)}</code>`;
}

export function bold(value) {
  return `<b>${escapeHtml(value)}</b>`;
}

export function block(title, body = '') {
  const safeBody = String(body || '').trim();
  return `<blockquote>${bold(title)}${safeBody ? `\n${safeBody}` : ''}</blockquote>`;
}

export function kv(rows = []) {
  return rows
    .filter(Boolean)
    .map(([key, value]) => `${escapeHtml(key).padEnd(12, ' ')} ${stripHtml(String(value ?? '-'))}`)
    .join('\n');
}

export function preTable(rows = []) {
  return `<pre>${escapeHtml(kv(rows))}</pre>`;
}

export function checklist(rows = []) {
  return rows
    .filter(Boolean)
    .map(([label, enabled]) => `${enabled ? '✓' : '—'} ${escapeHtml(label)}`)
    .join('\n');
}

export function success(title, detail = '') {
  return block(`✓ ${title}`, escapeHtml(detail));
}

export function error(title, detail = '') {
  return block(`Gagal · ${title}`, escapeHtml(detail));
}

export function info(title, rows = []) {
  return block(title, preTable(rows));
}

export function footer(settings) {
  return '';
}

export async function editOrReply(message, text, options = {}) {
  const payload = { text, parseMode: 'html', ...options };
  try {
    if (typeof message.edit === 'function') return await message.edit(payload);
  } catch (_) {}
  if (message?.reply) return message.reply(payload);
  return null;
}
