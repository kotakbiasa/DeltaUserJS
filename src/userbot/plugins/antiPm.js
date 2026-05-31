// Map untuk melacak siapa saja yang sudah diperingatkan per masing-masing akun userbot.
// Struktur: telegramId (Akun Ubot) -> Set dari senderId (Orang yang PM)
const warnedMap = new Map();

export default {
  name: 'antipm',
  help: {
    title: 'Anti-Spam Inbox',
    description: 'Melindungi inbox Anda dari spam chat pribadi orang tidak dikenal secara otomatis.',
    usage: 'Aktifkan melalui tombol di Master Bot.',
    detail: '• **Pesan PM Pertama**: Userbot otomatis membaca dan membalas dengan pesan peringatan keamanan kustom DeltaUbotJS.\n• **Pesan Selanjutnya**: Seluruh pesan PM berikutnya dari orang tersebut akan **otomatis dihapus secara permanen secara instan** agar inbox Anda bersih.'
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
          await client.sendMessage(message.peerId, {
            message: `🚫 <b>Keamanan Anti-PM</b> 🚫\n` +
                     `────────────────────────\n` +
                     `Halo! Maaf, pemilik akun ini sedang mengaktifkan fitur <b>Anti-PM</b>.\n\n` +
                     `Harap <b>tidak</b> mengirimkan pesan pribadi lagi sebelum mode ini dinonaktifkan, atau pesan Anda selanjutnya akan otomatis terhapus secara permanen.\n` +
                     `────────────────────────`,
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
