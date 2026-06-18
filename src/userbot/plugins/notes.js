import fs from 'fs/promises';
import path from 'path';
import { block, code, escapeHtml, footer } from '../ui.js';

const notesFile = path.join(process.cwd(), 'notes.json');
let notesDb = {};
let saving = false;

try {
  notesDb = JSON.parse(await fs.readFile(notesFile, 'utf8'));
} catch (_) {
  notesDb = {};
}

async function saveNotes() {
  if (saving) return;
  saving = true;
  try { await fs.writeFile(notesFile, JSON.stringify(notesDb, null, 2)); }
  finally { saving = false; }
}

function userNotes(telegramId) {
  const key = String(telegramId);
  if (!notesDb[key]) notesDb[key] = {};
  return notesDb[key];
}

export default {
  name: 'notes',
  help: {
    title: 'Quick Notes (.save, .get, .notes)',
    description: 'Menyimpan dan mengambil catatan cepat.',
    usage: '• `.save <nama> <teks>`\n• reply teks `.save <nama>`\n• `.get <nama>`\n• `.notes`\n• `.delnote <nama>`',
    detail: 'Catatan disimpan lokal per akun userbot.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;
    const text = message.text.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    const name = args[1]?.toLowerCase();
    if (!['.save', '.get', '.notes', '.delnote'].includes(cmd)) return;

    const notes = userNotes(telegramId);

    if (cmd === '.notes') {
      const names = Object.keys(notes).sort();
      const body = names.length ? names.map(n => `• ${escapeHtml(n)}`).join('\n') : 'Belum ada note.';
      await message.edit({ text: block('Quick Notes', body) + footer(settings), parseMode: 'html' });
      return;
    }

    if (!name) {
      await message.edit({ text: block('Nama note kosong', `Contoh: ${code('.save todo beli kopi')}`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === '.save') {
      const replied = message.replyToMessage;
      const content = args.slice(2).join(' ').trim() || replied?.message || '';
      if (!content) {
        await message.edit({ text: block('Isi note kosong', 'Tulis teks atau reply pesan berisi teks.') + footer(settings), parseMode: 'html' });
        return;
      }
      notes[name] = content;
      await saveNotes();
      await message.edit({ text: block('Note disimpan', `Ambil dengan ${code(`.get ${name}`)}.`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === '.get') {
      if (!notes[name]) {
        await message.edit({ text: block('Note tidak ditemukan', code(name)) + footer(settings), parseMode: 'html' });
        return;
      }
      await message.edit({ text: notes[name] });
      return;
    }

    if (!notes[name]) {
      await message.edit({ text: block('Note tidak ditemukan', code(name)) + footer(settings), parseMode: 'html' });
      return;
    }
    delete notes[name];
    await saveNotes();
    await message.edit({ text: block('Note dihapus', code(name)) + footer(settings), parseMode: 'html' });
  },
};
