import fs from 'fs';
import path from 'path';

const notesFile = path.join(process.cwd(), 'notes.json');
let notesDb = {};
try {
  if (fs.existsSync(notesFile)) {
    notesDb = JSON.parse(fs.readFileSync(notesFile, 'utf8'));
  }
} catch (e) {}

function saveNotes() {
  fs.writeFileSync(notesFile, JSON.stringify(notesDb, null, 2));
}

export default {
  name: 'notes',
  help: {
    title: 'Quick Notes (.save, .get, .notes)',
    description: 'Menyimpan teks atau catatan penting untuk dipanggil kembali dengan cepat.',
    usage: '• `.save <nama>`\n• `.get <nama>`\n• `.notes` (Melihat daftar)\n• `.delnote <nama>`',
    detail: 'Bisa juga dengan membalas pesan teks dan mengetik `.save <nama_note>`.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    const noteName = args[1]?.toLowerCase();
    
    if (!notesDb[telegramId]) notesDb[telegramId] = {};
    
    if (cmd === '.save' && noteName) {
      let noteContent = args.slice(2).join(' ');
      const replied = await message.getReplyMessage();
      
      if (!noteContent && replied && replied.message) {
        noteContent = replied.message;
      }
      
      if (!noteContent) {
        await message.edit({ text: '❌ <b>Format salah.</b>\nGunakan: <code>.save nama teks</code> atau reply teks dengan <code>.save nama</code>', parseMode: 'html' });
        return;
      }
      
      notesDb[telegramId][noteName] = noteContent;
      saveNotes();
      
      await message.edit({ text: `✅ <b>Note disimpan!</b>\nGunakan <code>.get ${noteName}</code> untuk mengambilnya.`, parseMode: 'html' });
    }
    else if (cmd === '.get' && noteName) {
      const content = notesDb[telegramId][noteName];
      if (content) {
        await message.edit({ text: content });
      } else {
        await message.edit({ text: `❌ Note <code>${noteName}</code> tidak ditemukan.`, parseMode: 'html' });
      }
    }
    else if (cmd === '.notes') {
      const myNotes = Object.keys(notesDb[telegramId]);
      if (myNotes.length === 0) {
        await message.edit({ text: '📝 <b>Anda belum menyimpan note apapun.</b>', parseMode: 'html' });
      } else {
        await message.edit({ text: `📝 <b>Daftar Notes Anda:</b>\n\n` + myNotes.map(n => `• <code>${n}</code>`).join('\n'), parseMode: 'html' });
      }
    }
    else if (cmd === '.delnote' && noteName) {
      if (notesDb[telegramId][noteName]) {
        delete notesDb[telegramId][noteName];
        saveNotes();
        await message.edit({ text: `🗑 <b>Note dihapus!</b>\nNote <code>${noteName}</code> telah dihapus secara permanen.`, parseMode: 'html' });
      } else {
        await message.edit({ text: `❌ Note <code>${noteName}</code> tidak ditemukan.`, parseMode: 'html' });
      }
    }
  }
};
