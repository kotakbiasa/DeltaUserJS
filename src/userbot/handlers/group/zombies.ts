// @ts-nocheck
import { Api } from 'teleproto';

export default {
  name: 'zombies',
  help: {
    title: 'Pemburu Zombie (.zombies)',
    description: 'Menghapus (kick) semua akun yang telah dihapus (Deleted Accounts) dari grup.',
    usage: '`.zombies` — Memulai pembersihan akun mati di grup',
    detail: 'Fitur ini sangat efektif untuk membersihkan grup besar dari akun-akun sampah.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out) return;
    
    const text = message.message || '';
    if (text.trim() !== '.zombies') return;

    if (!message.isGroup) {
      await message.edit({ text: '❌ Perintah ini hanya bisa digunakan di dalam grup.' });
      return;
    }

    await message.edit({ text: '🧟‍♂️ <i>Mencari zombie (akun terhapus) di grup ini...</i>', parseMode: 'html' });

    try {
      // Get participants (MTProto handles pagination or limit)
      // For large supergroups, this gets the first batch, but we can iterate. 
      // Teleproto's iterParticipants is usually preferred, but let's just get the first 1000 for safety or use iterParticipants if available.
      
      let deletedCount = 0;
      let checkedCount = 0;

      // We use GetParticipants manually to avoid overloading or we can use client.invoke
      let offset = 0;
      const limit = 200;
      let hasMore = true;

      while (hasMore) {
        const result = await client.invoke(new Api.channels.GetParticipants({
          channel: message.peerId,
          filter: new Api.ChannelParticipantsRecent(),
          offset: offset,
          limit: limit,
          hash: BigInt(0)
        }));

        if (!result.participants || result.participants.length === 0) {
          hasMore = false;
          break;
        }

        for (const user of result.users) {
          checkedCount++;
          if (user.deleted) {
            // Kick the zombie
            try {
              await client.invoke(new Api.channels.EditBanned({
                channel: message.peerId,
                participant: user.id,
                bannedRights: new Api.ChatBannedRights({
                  untilDate: 0,
                  viewMessages: true, // ban
                })
              }));
              await client.invoke(new Api.channels.EditBanned({
                channel: message.peerId,
                participant: user.id,
                bannedRights: new Api.ChatBannedRights({
                  untilDate: 0,
                  viewMessages: false, // unban (kick effect)
                })
              }));
              deletedCount++;
            } catch (e) {
              // Ignore kick errors
            }
          }
        }

        offset += limit;
        if (result.participants.length < limit) {
          hasMore = false;
        }

        // Safety break to prevent infinite loops on giant groups
        if (checkedCount > 10000) break;
      }

      await message.edit({ text: `✅ <b>Operasi Pemburu Zombie Selesai!</b>\n\n🔍 Diperiksa: ${checkedCount} member\n🧟‍♂️ Zombie Dihapus: ${deletedCount} akun`, parseMode: 'html' });

    } catch (err) {
      console.error(err);
      await message.edit({ text: '❌ Gagal mencari zombie. Pastikan kamu adalah admin grup.' });
    }
  }
};
