// Debug tag mismatch
import { dbCache } from '../src/infrastructure/dbCore.js';
import * as d from '../src/bot/ui/keyboards/dashboard.js';

dbCache.set(1025855210, {
  telegram_id: 1025855210, phone: '628123456789', session_string: 'abc',
  is_active: 1, anti_pm: 1, auto_reply: 0, afk_reason: 'Sedang tidur',
  expired_at: null, custom_name: 'OcanBot', inline_bot_username: 'inlinebot_test',
  vars: { PREFIX: '.' }, disabled_plugins: [],
} as any);

const ctx = { from: { id: 1025855210, first_name: 'Ocan' }, me: { first_name: 'Bot', username: 'Bot' }, chat: { type: 'private', id: 1 } } as any;

const html = (d as any).panelSettings(ctx);

// Hitung open vs close per tag
const opens: Record<string, number> = {};
const closes: Record<string, number> = {};
for (const m of html.matchAll(/<([a-z][a-z0-9]*)[ >]/g)) opens[m[1]] = (opens[m[1]] || 0) + 1;
for (const m of html.matchAll(/<\/([a-z][a-z0-9]*)>/g)) closes[m[1]] = (closes[m[1]] || 0) + 1;
const all = new Set([...Object.keys(opens), ...Object.keys(closes)]);
for (const t of all) {
  if ((opens[t] || 0) !== (closes[t] || 0)) {
    console.log(`MISMATCH <${t}>: open=${opens[t] || 0} close=${closes[t] || 0}`);
  }
}
console.log('\n--- HTML ---');
console.log(html);
