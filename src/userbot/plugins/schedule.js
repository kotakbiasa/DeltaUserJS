import { deleteSchedule, getSchedules, saveSchedule, getChatSettings } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

const timers = new Map();

function userStore(id) {
  if (!timers.has(id)) timers.set(id, new Map());
  return timers.get(id);
}

function chatKey(message) {
  return String(message.chat.id || message.chat.id || message.chat.id?.userId || '');
}

function clearTimer(telegramId, key, type) {
  const store = userStore(telegramId);
  const timerKey = `${type}:${key}`;
  const timer = store.get(timerKey);
  if (!timer) return;
  clearInterval(timer);
  clearTimeout(timer);
  store.delete(timerKey);
}

async function sendScheduled(client, key, text) {
  await client.sendText(Number(key), text);
}

function startLoop(client, telegramId, key, minutes, text) {
  clearTimer(telegramId, key, 'loop');
  sendScheduled(client, key, text).catch(err => console.error('Loop schedule error:', err.message));
  const interval = setInterval(() => sendScheduled(client, key, text).catch(err => console.error('Loop schedule error:', err.message)), minutes * 60 * 1000);
  userStore(telegramId).set(`loop:${key}`, interval);
}

function msUntil(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function startDaily(client, telegramId, key, hhmm, text) {
  clearTimer(telegramId, key, 'daily');
  const timeout = setTimeout(async () => {
    await sendScheduled(client, key, text).catch(err => console.error('Daily schedule error:', err.message));
    const interval = setInterval(() => sendScheduled(client, key, text).catch(err => console.error('Daily schedule error:', err.message)), 24 * 60 * 60 * 1000);
    userStore(telegramId).set(`daily:${key}`, interval);
  }, msUntil(hhmm));
  userStore(telegramId).set(`daily:${key}`, timeout);
}

function clearAll(telegramId) {
  const store = userStore(telegramId);
  for (const timer of store.values()) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  store.clear();
}

function render(items) {
  if (!items.length) return 'Tidak ada schedule aktif.';
  return items.map((item, index) => {
    const label = item.type === 'daily' ? `daily ${item.value}` : `loop ${item.value}m`;
    const msg = item.message.length > 40 ? `${item.message.slice(0, 40)}...` : item.message;
    return `${index + 1}. ${item.chatKey} · ${label}\n   ${escapeHtml(msg)}`;
  }).join('\n');
}

export default {
  name: 'schedule',
  help: {
    title: 'Schedule / Auto Post',
    description: 'Mengirim pesan otomatis berulang dan restore setelah restart.',
    usage: '• `.loop <menit> <pesan>`\n• `.every <menit> <pesan>`\n• `.schedule HH:MM <pesan>`\n• `.rmloop`\n• `.rmschedule`\n• `.schedules`',
    detail: 'Loop dan daily schedule disimpan di database lalu dipulihkan saat userbot start.'
  },
  async onStart(client, telegramId) {
    clearAll(telegramId);
    const items = getSchedules(telegramId);
    for (const item of items) {
      if (item.type === 'loop') startLoop(client, telegramId, item.chatKey, Number(item.value), item.message);
      if (item.type === 'daily') startDaily(client, telegramId, item.chatKey, item.value, item.message);
    }
    if (items.length) console.log(`Restored ${items.length} schedule(s) for [${telegramId}].`);
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;
    
    const key = chatKey(message);
    const chatConfig = getChatSettings(telegramId, key);
    const prefix = chatConfig.prefix || '.';
    
    const text = message.text.trim();
    if (!text.startsWith(prefix)) return;

    const rawArgs = text.slice(prefix.length).split(/\s+/);
    const cmd = rawArgs[0].toLowerCase();
    if (!['loop', 'every', 'rmloop', 'listloop', 'schedules', 'schedule', 'rmschedule'].includes(cmd)) return;

    // Use original text splitting to preserve spacing in payload
    // Extract everything after the command
    const prefixCmd = prefix + cmd;

    if (cmd === 'loop' || cmd === 'every') {
      const minutes = Number(rawArgs[1]);
      const payload = text.slice(prefixCmd.length + String(rawArgs[1] || '').length + 2).trim();
      if (!minutes || minutes < 1 || !payload) {
        await message.edit({ text: block('Tidak Valid', `Gunakan ${code(`${prefixCmd} <menit> <pesan>`)}`) + footer(settings), parseMode: 'html' });
        return;
      }
      startLoop(client, telegramId, key, minutes, payload);
      await saveSchedule(telegramId, key, 'loop', minutes, payload);
      await message.edit({ text: block('Loop Aktif', `<pre>Interval    ${minutes} menit\nChat        ${escapeHtml(key)}</pre>`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'schedule') {
      const time = rawArgs[1];
      const payload = text.slice(prefixCmd.length + String(time || '').length + 2).trim();
      if (!/^\d{1,2}:\d{2}$/.test(time || '') || !payload) {
        await message.edit({ text: block('Tidak Valid', `Gunakan ${code(`${prefixCmd} HH:MM pesan`)}`) + footer(settings), parseMode: 'html' });
        return;
      }
      const [hh, mm] = time.split(':').map(Number);
      if (hh > 23 || mm > 59) {
        await message.edit({ text: block('Jam tidak valid', 'Format 00:00 sampai 23:59.') + footer(settings), parseMode: 'html' });
        return;
      }
      const hhmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      startDaily(client, telegramId, key, hhmm, payload);
      await saveSchedule(telegramId, key, 'daily', hhmm, payload);
      await message.edit({ text: block('Daily schedule aktif', `<pre>Jam         ${hhmm}\nChat        ${escapeHtml(key)}</pre>`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'rmloop') {
      const store = userStore(telegramId);
      const hasLoop = store.has(`loop:${key}`);
      if (!hasLoop) {
        await message.edit({ text: block('Tidak ada loop', `Tidak ada loop aktif di chat ini.`) + footer(settings), parseMode: 'html' });
        return;
      }
      clearTimer(telegramId, key, 'loop');
      await deleteSchedule(telegramId, key, 'loop');
      await message.edit({ text: block('Loop Dihentikan', `Chat: ${code(key)}`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'rmschedule') {
      clearTimer(telegramId, key, 'daily');
      await deleteSchedule(telegramId, key, 'daily');
      await message.edit({ text: block('Daily schedule dihentikan', `Chat: ${code(key)}`) + footer(settings), parseMode: 'html' });
      return;
    }

    await message.edit({ text: block('Daftar Loop Aktif', `<pre>${render(getSchedules(telegramId))}</pre>`) + footer(settings), parseMode: 'html' });
  },
};
