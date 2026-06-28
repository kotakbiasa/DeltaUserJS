export async function isAdmin(ctx) {
  if (!ctx.chat || ctx.chat.type === 'private') return false;
  try {
    const member = await ctx.getChatMember(ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export async function isBotAdmin(ctx) {
  if (!ctx.chat || ctx.chat.type === 'private') return false;
  try {
    const botMember = await ctx.getChatMember(ctx.me.id);
    return botMember.status === 'administrator';
  } catch (err) {
    return false;
  }
}

function getTargetUser(ctx) {
  if (ctx.message?.reply_to_message) {
    return {
      id: ctx.message.reply_to_message.from.id,
      name: ctx.message.reply_to_message.from.first_name
    };
  }
  const parts = ctx.message?.text?.split(' ');
  if (parts && parts.length > 1) {
    const id = parseInt(parts[1], 10);
    if (!isNaN(id)) return { id, name: String(id) };
  }
  return null;
}

export function registerAdminHandlers(bot) {
  // --- BAN ---
  bot.command('ban', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) {
      return ctx.reply('❌ Saya butuh hak akses admin untuk mem-ban pengguna.');
    }

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');

    try {
      await ctx.banChatMember(target.id);
      await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br><b>${target.name}</b> telah di-ban dari grup ini.</blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal mem-ban: ${err.message}</blockquote>` });
    }
  });

  // --- UNBAN ---
  bot.command('unban', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) return;

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');

    try {
      await ctx.unbanChatMember(target.id);
      await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br><b>${target.name}</b> telah di-unban.</blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal meng-unban: ${err.message}</blockquote>` });
    }
  });

  // --- MUTE ---
  bot.command('mute', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) {
      return ctx.reply('❌ Saya butuh hak akses admin untuk me-mute pengguna.');
    }

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');

    try {
      await ctx.restrictChatMember(target.id, { can_send_messages: false });
      await ctx.replyWithRichMessage({ html: `<blockquote>🔇 <b>${target.name}</b> telah di-mute.</blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal me-mute: ${err.message}</blockquote>` });
    }
  });

  // --- UNMUTE ---
  bot.command('unmute', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) return;

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');

    try {
      await ctx.restrictChatMember(target.id, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
      await ctx.replyWithRichMessage({ html: `<blockquote>🔊 <b>${target.name}</b> telah di-unmute.</blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal meng-unmute: ${err.message}</blockquote>` });
    }
  });

  // --- KICK ---
  bot.command('kick', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) {
      return ctx.reply('❌ Saya butuh hak akses admin untuk mengeluarkan (kick) pengguna.');
    }

    const target = getTargetUser(ctx);
    if (!target) return ctx.reply('❌ Harap balas (reply) pesan pengguna atau masukkan ID-nya.');

    try {
      await ctx.banChatMember(target.id);
      await ctx.unbanChatMember(target.id); // Langsung unban agar bisa masuk lagi via link
      await ctx.replyWithRichMessage({ html: `<blockquote>👢 <b>${target.name}</b> telah dikeluarkan dari grup.</blockquote>` });
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal menendang: ${err.message}</blockquote>` });
    }
  });

  // --- PIN ---
  bot.command('pin', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) {
      return ctx.reply('❌ Saya butuh hak akses admin untuk menyematkan pesan.');
    }

    if (!ctx.message?.reply_to_message) {
      return ctx.reply('❌ Harap balas (reply) pesan yang ingin disematkan.');
    }

    try {
      await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal menyematkan: ${err.message}</blockquote>` });
    }
  });

  // --- UNPIN ---
  bot.command('unpin', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    if (!(await isBotAdmin(ctx))) return;

    try {
      if (ctx.message?.reply_to_message) {
        await ctx.unpinChatMessage(ctx.message.reply_to_message.message_id);
      } else {
        await ctx.unpinAllChatMessages();
        await ctx.replyWithRichMessage({ html: `<blockquote><b>✅ BERHASIL</b><br>Semua pesan sematan telah dilepas.</blockquote>` });
      }
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Gagal melepas sematan: ${err.message}</blockquote>` });
    }
  });
}
