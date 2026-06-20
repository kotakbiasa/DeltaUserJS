import { getGroupConfig, updateGroupConfig, addWarn } from '../../../core/database.js';
import { Api } from 'teleproto';

// In-memory tracker for message timestamps
// Key: chatId_userId
// Value: array of timestamps (numbers)
const spamTracker = new Map();

// Configuration
const SPAM_LIMIT = 5; // max messages
const TIME_WINDOW = 3000; // in milliseconds (3 seconds)

export default {
  name: 'antispam',
  help: {
    title: 'Anti-Spam Group (.antispam)',
    description: 'Mendeteksi dan menghukum member yang melakukan spam (mengirim 5 pesan beruntun dalam 3 detik). Jika diaktifkan, bot akan menghapus pesan spam, memberikan warn, dan jika warn mencapai 3, member akan di-mute selama 1 jam.',
    usage: '`.antispam on` — Mengaktifkan Anti-Spam\n`.antispam off` — Mematikan Anti-Spam',
    detail: 'Fitur ini terintegrasi dengan sistem Warn. Setiap kali spam terdeteksi, pesan spam akan dihapus dan pengguna diberikan 1 warn.'
  },
  async execute(client, message, settings, telegramId) {
    const text = message.message || '';
    const parts = text.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    const chatId = message.peerId.userId || message.peerId.chatId || message.peerId.channelId;

    // Handle toggling antispam
    if (message.out && (cmd === '.antispam')) {
      const option = parts[1]?.toLowerCase();
      if (!['on', 'off'].includes(option)) {
        await message.edit({ text: `<blockquote>❌ Format salah.\nGunakan: <code>.antispam on</code> atau <code>.antispam off</code></blockquote>`, parseMode: 'html' });
        return;
      }

      const config = await getGroupConfig(chatId);
      config.antispam_enabled = (option === 'on');
      await updateGroupConfig(chatId, config);

      await message.edit({ text: `<blockquote>🛡️ <b>Anti-Spam</b> berhasil di-${option === 'on' ? 'aktifkan' : 'matikan'} untuk obrolan ini.</blockquote>`, parseMode: 'html' });
      return;
    }

    // Process incoming messages (if not from ourselves)
    if (message.out) return;

    // Check if antispam is enabled for this chat
    const config = await getGroupConfig(chatId);
    if (!config.antispam_enabled) return;

    // We only care about normal users (not admins).
    // Let's check if the sender is an admin
    let senderEntity;
    const senderId = message.senderId;
    if (!senderId) return;

    try {
      const participants = await client.invoke(new Api.channels.GetParticipants({
        channel: message.peerId,
        filter: new Api.ChannelParticipantsAdmins(),
        offset: 0,
        limit: 100,
        hash: BigInt(0)
      }));
      const isAdmin = participants.participants.some(p => p.userId === senderId);
      if (isAdmin) return; // Admins are immune
    } catch (e) {
      // Might not be a channel/supergroup, or bot lacks permission to check admins
    }

    // Tracker logic
    const trackerKey = `${chatId}_${senderId}`;
    let timestamps = spamTracker.get(trackerKey) || [];
    
    const now = Date.now();
    timestamps.push(now);

    // Keep only timestamps within the TIME_WINDOW
    timestamps = timestamps.filter(t => now - t <= TIME_WINDOW);
    spamTracker.set(trackerKey, timestamps);

    if (timestamps.length >= SPAM_LIMIT) {
      // Spam detected!
      spamTracker.delete(trackerKey); // Reset tracker to avoid duplicate actions for the same burst

      try {
        // 1. Delete the triggering message (and preferably previous ones if we tracked their IDs, but deleting current is a start)
        await client.deleteMessages(message.peerId, [message.id], { revoke: true });

        // Fetch sender info for announcement
        senderEntity = await client.getEntity(senderId);
        const targetName = senderEntity.firstName || senderEntity.title || String(senderId);

        // 2. Add Warn
        const warnData = await addWarn(telegramId, chatId, senderId, 'Spamming messages');
        
        let replyText = `🛡️ <b>Sistem Anti-Spam</b>\nPengguna <b>${targetName}</b> terdeteksi melakukan spam.\n⚠️ Peringatan ke: <b>${warnData.count}/3</b>`;

        // 3. Check if reaching 3 warns -> Mute 1 hour
        if (warnData.count >= 3) {
          replyText += `\n\n⛔ <b>Batas peringatan tercapai! Membisukan (Mute) pengguna selama 1 Jam...</b>`;
          const muteDurationSeconds = 3600; // 1 hour
          const untilDate = Math.floor(Date.now() / 1000) + muteDurationSeconds;

          try {
            await client.invoke(new Api.channels.EditBanned({
              channel: message.peerId,
              participant: senderId,
              bannedRights: new Api.ChatBannedRights({
                untilDate: untilDate,
                viewMessages: false, // Can still view
                sendMessages: true,  // Banned from sending
                sendMedia: true,
                sendStickers: true,
                sendGifs: true,
                sendGames: true,
                sendInline: true,
                embedLinks: true
              })
            }));
            replyText += `\n✅ <i>Berhasil dibungkam hingga 1 jam ke depan.</i>`;
          } catch (muteError) {
            replyText += `\n❌ <i>Gagal membungkam pengguna. Pastikan Userbot adalah admin.</i>`;
          }
        }

        // Send announcement
        await client.sendMessage(message.peerId, { message: `<blockquote>${replyText}</blockquote>`, parseMode: 'html' });

      } catch (err) {
        console.error('Antispam Error:', err);
      }
    }
  }
};
