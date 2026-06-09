// Map untuk melacak siapa saja yang sudah diperingatkan per masing-masing akun userbot.
// Struktur: telegramId (Akun Ubot) -> Set dari senderId (Orang yang PM)
const warnedMap = new Map();

import { getUserbotSession } from '../../database/db.js';
import { Api } from 'telegram';

export default {
  name: 'antipm',
  help: {
    title: 'Anti-Spam Inbox',
    description: 'Melindungi inbox Anda dari spam chat pribadi. Tersedia juga sistem Trust/Approve.',
    usage: '• Aktifkan Anti-PM via Master Bot.\n• `.approve` (Balas pesan target)\n• `.disapprove` (Balas pesan target)\n• `.approved` (Melihat daftar diizinkan)',
    detail: '• **Pesan Pertama**: Otomatis dibalas dengan peringatan keamanan.\n• **Pesan Selanjutnya**: Otomatis dihapus permanen jika target belum di-approve.\n• **Bypass**: Pengguna di kontak Anda atau yang telah di-approve tidak akan diblokir.'
  },
  async execute(client, message, settings, telegramId) {
    const isPrivate = message.isPrivate;
    
    // Jika Anti-PM dimatikan, bersihkan cache peringatan untuk user ini agar hemat memori
    if (settings.anti_pm !== 1) {
      if (warnedMap.has(telegramId)) {
        warnedMap.delete(telegramId);
      }
      return;
    }

    // Aktif jika Mode Anti-PM dinyalakan (anti_pm === 1), pesan masuk pribadi, dan bukan pesan dari kita sendiri
    if (!message.out && isPrivate) {
      const senderId = Number(message.senderId);
      
      // Jika pengirim adalah Bot atau Layanan Telegram resmi, abaikan agar tidak terhapus
      const sender = await message.getSender();
      if (sender?.bot || senderId === 777000) return;

      // BYPASS: Jika pengirim ada di daftar kontak Telegram kita
      if (sender?.contact) return;

      // BYPASS: Jika pengirim ada di daftar Approved (Whitelist)
      const session = getUserbotSession(telegramId);
      if (session?.approved_users?.includes(senderId)) return;

      // Inisialisasi/Ambil Set peringatan untuk akun userbot ini
      if (!warnedMap.has(telegramId)) {
        warnedMap.set(telegramId, new Set());
      }
      const myWarnedSet = warnedMap.get(telegramId);

      if (!myWarnedSet.has(senderId)) {
        // --- PM PERTAMA (Berikan Peringatan & Auto-Read) ---
        if (myWarnedSet.size > 1000) myWarnedSet.clear(); // Mencegah memory leak
        myWarnedSet.add(senderId);
        
        try {
          // Tandai sebagai dibaca agar tidak ada notifikasi menumpuk
          await client.markAsRead(message.peerId);
        } catch (e) {}

        try {
          if (session?.inline_bot_username) {
            // Coba menggunakan Custom Inline Bot agar pesan memiliki Inline Button
            try {
              const botEntity = await client.getEntity(session.inline_bot_username);
              const results = await client.invoke(new Api.messages.GetInlineBotResults({
                bot: botEntity,
                peer: message.peerId,
                query: `antipm_${senderId}`,
                offset: ''
              }));

              if (results && results.results && results.results.length > 0) {
                await client.invoke(new Api.messages.SendInlineBotResult({
                  peer: message.peerId,
                  queryId: results.queryId,
                  id: results.results[0].id
                }));
                return; // Sukses mengirim via inline bot
              }
            } catch (inlineErr) {
              console.error(`Gagal mengirim Anti-PM via inline bot, fallback ke pesan biasa.`, inlineErr.message);
            }
          }

          // Fallback ke pesan teks biasa jika tidak ada inline bot atau gagal
          await client.sendMessage(message.peerId, {
            message: `🚫 <b>Keamanan Anti-PM</b> 🚫\n\n` +
                     `<blockquote>` +
                     `Halo! Maaf, pemilik akun ini sedang mengaktifkan fitur <b>Anti-PM</b>.\n\n` +
                     `Harap <b>tidak</b> mengirimkan pesan pribadi lagi sebelum mode ini dinonaktifkan, atau pesan Anda selanjutnya akan <b>otomatis terhapus secara permanen</b>.` +
                     `</blockquote>\n\n` +
                     `⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`,
            parseMode: 'html'
          });
        } catch (err) {
          console.error(`❌ Gagal mengirim warning Anti-PM untuk [${telegramId}]:`, err.message);
        }
      } else {
        // --- PM KEDUA & SETERUSNYA (Hapus Chat Otomatis!) ---
        try {
          // Hapus pesan yang baru masuk secara instan untuk kita dan untuk mereka (revoke: true)
          await client.deleteMessages(message.peerId, [message.id], { revoke: true });
        } catch (err) {
          // Fallback: hapus untuk kita sendiri jika gagal revoke
          try {
            await client.deleteMessages(message.peerId, [message.id], { revoke: false });
          } catch (e) {}
        }
      }
    }
  }
};
