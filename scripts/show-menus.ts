// Tampilkan isi lengkap semua panel
import { dbCache } from '../src/infrastructure/dbCore.js';
import * as d from '../src/bot/ui/keyboards/dashboard.js';

dbCache.set(1025855210, {
  telegram_id: 1025855210, phone: '628123456789', session_string: 'abc',
  is_active: 1, anti_pm: 1, auto_reply: 0, afk_reason: 'Sedang tidur',
  expired_at: null, custom_name: 'OcanBot', inline_bot_username: 'inlinebot_test',
  vars: { PREFIX: '.' }, disabled_plugins: [],
} as any);

const ctx = { from: { id: 1025855210, first_name: 'Ocan' }, me: { first_name: 'PanelDeltaUbot', username: 'PanelDeltaUbot' }, chat: { type: 'private', id: 1 } } as any;

const panels: [string, string][] = [
  ['🏠 MAIN (panelMain)', (d as any).panelMain(ctx)],
  ['🎛️ PANEL MENU (panelMenuList)', (d as any).panelMenuList(ctx)],
  ['🤖 USERBOT (panelUserbot)', (d as any).panelUserbot(ctx)],
  ['🧩 PLUGIN (panelPlugins)', (d as any).panelPlugins(ctx)],
  ['⚙️ SETTINGS (panelSettings)', (d as any).panelSettings(ctx)],
  ['🚀 REGISTER (panelRegister)', (d as any).panelRegister(ctx)],
  ['💎 SUBSCRIPTION (panelSubscription)', (d as any).panelSubscription(ctx)],
  ['👑 ADMIN (panelAdmin)', (d as any).panelAdmin(ctx)],
  ['📊 STATS (panelStats)', (d as any).panelStats(ctx)],
  ['❓ QUICK HELP (panelQuickHelp)', (d as any).panelQuickHelp(ctx)],
  ['💰 DONASI (panelDonate)', (d as any).panelDonate(ctx)],
  ['🩺 HEALTH (panelHealth)', (d as any).panelHealth('🟢 Connected (DeltaUbotJS)')],
];

for (const [label, html] of panels) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(label);
  console.log('='.repeat(60));
  console.log(html);
  console.log();
}

// Keyboards
const kbs: [string, any][] = [
  ['KEYBOARD MAIN', (d as any).keyboardMain(ctx)],
  ['KEYBOARD USERBOT', (d as any).keyboardUserbot(ctx)],
  ['KEYBOARD SETTINGS', (d as any).keyboardSettings(ctx)],
  ['KEYBOARD ADMIN', (d as any).keyboardAdmin(ctx)],
  ['KEYBOARD SUBSCRIPTION', (d as any).keyboardSubscription(ctx)],
];
console.log(`\n${'='.repeat(60)}`);
console.log('KEYBOARDS (inline_keyboard JSON)');
console.log('='.repeat(60));
for (const [label, kb] of kbs) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(kb.inline_keyboard, null, 1));
}
