// Verifikasi render semua panel dashboard — jalankan via tsx
import { dbCache } from '../src/infrastructure/dbCore.js';
import * as d from '../src/bot/ui/keyboards/dashboard.js';

// Seed cache dengan data owner
dbCache.set(1025855210, {
  telegram_id: 1025855210,
  phone: '628123456789',
  session_string: 'abc',
  is_active: 1,
  anti_pm: 1,
  auto_reply: 0,
  afk_reason: 'Sedang tidur',
  expired_at: null,
  custom_name: 'OcanBot',
  inline_bot_username: 'inlinebot_test',
  vars: { PREFIX: '.' },
  disabled_plugins: [],
} as any);

const makeCtx = () => ({
  from: { id: 1025855210, first_name: 'Ocan', username: 'ocan' },
  me: { first_name: 'PanelDeltaUbot', username: 'PanelDeltaUbot', id: 123 },
  chat: { type: 'private', id: 1025855210 },
} as any);

const ctx = makeCtx();

// Tag balance check
const tagBalance = (html: string) => {
  const opens = (html.match(/<([a-z][a-z0-9]*)[ >]/g) || []).length;
  const closes = (html.match(/<\/[a-z][a-z0-9]*>/g) || []).length;
  return { opens, closes, balanced: Math.abs(opens - closes) <= 1 };
};

const panels = [
  'panelMain', 'panelMenuList', 'panelUserbot', 'panelPlugins', 'panelSettings',
  'panelRegister', 'panelSubscription', 'panelAccessDenied', 'panelAdmin',
  'panelStats', 'panelQuickHelp', 'panelDonate', 'panelHealth',
];

for (const name of panels) {
  try {
    const html = name === 'panelHealth'
      ? (d as any)[name]('🟢 Connected (DeltaUbotJS)')
      : (d as any)[name](ctx);
    const { opens, closes, balanced } = tagBalance(html);
    const spoilerOk = html.split('<tg-spoiler>').length - 1 === html.split('</tg-spoiler>').length - 1;
    const status = balanced && spoilerOk ? 'OK' : 'WARN';
    console.log(`${name.padEnd(22)} ${status.padEnd(5)} len=${String(html.length).padEnd(5)} tags:${opens}/${closes} spoiler:${spoilerOk ? 'ok' : 'ERR'}`);
  } catch (e: any) {
    console.log(`${name.padEnd(22)} ERROR ${String(e?.message || e).slice(0, 90)}`);
  }
}

// Keyboard checks
const kbs = ['keyboardMain', 'keyboardPanelMenu', 'keyboardUserbot', 'keyboardSettings', 'keyboardAdmin', 'keyboardSubscription', 'keyboardRegister', 'keyboardDangerDelete'];
for (const name of kbs) {
  try {
    const kb = (d as any)[name](ctx);
    const buttons = kb.inline_keyboard.flat();
    const styled = buttons.filter((b: any) => b.style).length;
    console.log(`${name.padEnd(22)} OK    buttons=${buttons.length} styled=${styled}`);
  } catch (e: any) {
    console.log(`${name.padEnd(22)} ERROR ${String(e?.message || e).slice(0, 90)}`);
  }
}
