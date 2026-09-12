const BOT_PRIMARY = '@SangMata_BOT';
const BOT_BETA = '@SangMata_beta_bot';

/**
 * Kirim target ID/username ke bot SangMata dan tunggu responsnya.
 */
async function querySangMata(client: any, botUsername: string, target: string, timeoutSec = 7): Promise<any[]> {
  const startTime = Math.floor(Date.now() / 1000);
  try {
    await client.sendMessage(botUsername, { message: target });
  } catch (_err) {
    return [];
  }

  for (let i = 0; i < timeoutSec; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const history = await client.getMessages(botUsername, { limit: 5 });
      const replies = (history || []).filter((m: any) => !m.out && m.date >= startTime - 2);

      // SangMata biasanya mengirim 2 pesan (Name History & Username History)
      // atau 1 pesan jika tidak ada record ("No records found")
      if (
        replies.length >= 2 ||
        (replies.length === 1 && (/no records|history|nama|username/i.test(replies[0].message || '')))
      ) {
        return replies.reverse();
      } else if (replies.length > 0 && i >= 4) {
        return replies.reverse();
      }
    } catch {
      // transient read error, lanjutkan polling
    }
  }

  return [];
}

export default {
  name: 'sangmata',
  version: '1.1.0',
  description: 'Mengecek histori nama dan username seseorang via @SangMata_BOT & @SangMata_beta_bot.',
  help: {
    title: '👁️ SangMata (.sgm / .sgmb / .sangmata)',
    description: 'Mengecek histori perubahan nama dan username seseorang menggunakan bot @SangMata_BOT dan @SangMata_beta_bot (otomatis fallback).',
    usage: '• Balas pesan pengguna dengan `.sgm` atau ketik `.sgm <username/ID>`\n• Balas pesan dengan `.sgmb` atau ketik `.sgm -b <username/ID>` untuk mencoba @SangMata_beta_bot lebih dulu',
    detail: 'Userbot akan memeriksa histori ke @SangMata_BOT terlebih dahulu. Jika bot utama tidak merespons (offline/sibuk), sistem otomatis mencoba cadangan @SangMata_beta_bot.'
  },
  async execute(client: any, message: any, _settings: any, _telegramId: any) {
    if (!message.out || !message.message) {return;}

    const text = message.message.trim();
    const match = text.match(/^\.(sgm|sgmb|sangmata)(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const cmd = match[1].toLowerCase();
    let rawArg = (match[2] || '').trim();

    // Cek apakah user memprioritaskan beta bot via .sgmb atau flag -b / beta
    let preferBeta = cmd === 'sgmb';
    if (/^(?:-b|--beta|beta)(?:\s+|$)/i.test(rawArg)) {
      preferBeta = true;
      rawArg = rawArg.replace(/^(?:-b|--beta|beta)\s*/i, '').trim();
    }

    let target = rawArg;

    if (!target && message.replyToMsgId) {
      const replied = await message.getReplyMessage();
      if (replied && replied.senderId) {
        target = replied.senderId.toString();
      }
    }

    if (!target) {
      await message.edit({
        text: '<blockquote>❌ <b>Harap balas pesan pengguna atau berikan ID/Username.</b>\nContoh: <code>.sgm @username</code> atau balas pesan dengan <code>.sgm</code> / <code>.sgmb</code></blockquote>',
        parseMode: 'html'
      });
      return;
    }

    const bots = preferBeta ? [BOT_BETA, BOT_PRIMARY] : [BOT_PRIMARY, BOT_BETA];

    await message.edit({
      text: `⏳ <b>Memeriksa histori ke ${bots[0]}...</b>`,
      parseMode: 'html'
    });

    let foundMessages: any[] = [];

    for (let b = 0; b < bots.length; b++) {
      const currentBot = bots[b];
      if (b > 0) {
        await message.edit({
          text: `⏳ <b>${bots[0]} tidak merespons, mencoba cadangan ${currentBot}...</b>`,
          parseMode: 'html'
        });
      }

      const res = await querySangMata(client, currentBot, target, 7);
      if (res && res.length > 0) {
        foundMessages = res;
        break;
      }
    }

    if (foundMessages.length > 0) {
      // Hapus status 'loading'
      try {
        await message.delete();
      } catch (_e) {
        /* empty */
      }

      // Kirim hasil balasan SangMata ke chat saat ini
      for (const msg of foundMessages) {
        const sendOpts: any = { message: msg.message };
        if (msg.entities && msg.entities.length > 0) {
          sendOpts.formattingEntities = msg.entities;
        }
        if (message.replyToMsgId) {
          sendOpts.replyTo = message.replyToMsgId;
        }
        await client.sendMessage(message.chatId, sendOpts);
        await new Promise((r) => setTimeout(r, 300));
      }
    } else {
      await message.edit({
        text: `<blockquote>❌ <b>${bots.join(' & ')} tidak merespons.</b>\nKedua bot mungkin sedang offline, antrean padat, atau membatasi (rate limit) permintaan. Silakan coba lagi beberapa saat.</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
