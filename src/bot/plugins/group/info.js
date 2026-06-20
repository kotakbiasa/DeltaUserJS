export function registerInfoHandlers(bot) {
  bot.command('info', async (ctx) => {
    let targetUser = ctx.from;
    
    // Check if reply
    if (ctx.message.reply_to_message) {
      targetUser = ctx.message.reply_to_message.from;
    } else {
      // Check if ID/username provided
      const args = ctx.match.trim();
      if (args) {
        try {
          const chat = await ctx.api.getChat(args);
          if (chat.type === 'private') {
            targetUser = chat;
          }
        } catch (err) {
          // Ignore, fallback to ctx.from
        }
      }
    }

    if (!targetUser) return;

    try {
      // Show thinking indicator using API 10.1
      const thinkingMsg = await ctx.replyWithRichMessage({ html: `<tg-thinking>Mengambil profil pengguna...</tg-thinking>` });

      // Fetch full chat to get bio if possible (for users it might be empty without Userbot, but we try)
      const fullChat = await ctx.api.getChat(targetUser.id).catch(() => targetUser);

      const id = targetUser.id;
      const firstName = targetUser.first_name || '';
      const lastName = targetUser.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const username = targetUser.username ? `@${targetUser.username}` : 'Tidak ada';
      const isBot = targetUser.is_bot ? 'Ya 🤖' : 'Tidak 👤';
      const isPremium = targetUser.is_premium ? 'Ya 🌟' : 'Tidak';
      
      const bio = fullChat.bio || fullChat.description || 'Tidak ada';

      const html = `
        <h1>ℹ️ Informasi Pengguna</h1>
        <blockquote>Berikut adalah profil detail dari <a href="tg://user?id=${id}">${fullName}</a>.</blockquote>
        <table bordered striped>
          <tr>
            <th align="left">Atribut</th>
            <th align="left">Detail</th>
          </tr>
          <tr>
            <td><b>ID Telegram</b></td>
            <td><code>${id}</code></td>
          </tr>
          <tr>
            <td><b>Username</b></td>
            <td>${username}</td>
          </tr>
          <tr>
            <td><b>Status Bot</b></td>
            <td>${isBot}</td>
          </tr>
          <tr>
            <td><b>Premium</b></td>
            <td>${isPremium}</td>
          </tr>
          <tr>
            <td><b>Bio</b></td>
            <td><i>${bio}</i></td>
          </tr>
        </table>
      `.trim();

      await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(()=>{});
      
      await ctx.replyWithRichMessage({ html }, { reply_parameters: { message_id: ctx.message.message_id } });
      
    } catch (err) {
      console.error('Info command error:', err);
      ctx.reply('❌ Terjadi kesalahan saat mengambil informasi.');
    }
  });
}
