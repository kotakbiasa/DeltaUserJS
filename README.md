# DeltaUserJS

Multi-userbot manager untuk Telegram. **Master Bot** dibangun dengan
[grammY](https://grammy.dev), sedangkan **userbot** memakai
[GramJS/teleproto](https://github.com/gram-js/gramjs). State persisten disimpan di
MongoDB (dengan fallback file JSON lokal) dan di-cache di memori untuk akses cepat.

## ✨ Fitur

- Manajemen banyak userbot dari satu Master Bot
- Sistem plugin modular untuk userbot commands
- Pengecek masa aktif (subscription expiration) otomatis
- Watchdog yang menyambungkan ulang userbot yang terputus
- Dashboard interaktif dengan rich message support

## 📦 Prasyarat

- **Node.js >= 18** (memakai ESM + top-level `await`)
- **MongoDB** (Atlas atau self-hosted) — opsional; tanpa `MONGO_URI` akan memakai database file lokal `database.json`
- **Bot token** dari [@BotFather](https://t.me/BotFather)

## 🚀 Instalasi

```bash
git clone https://github.com/kotakbiasa/DeltaUserJS.git
cd DeltaUserJS
npm install
cp .env.example .env   # lalu isi nilainya
```

## ⚙️ Konfigurasi (.env)

| Variabel | Wajib | Keterangan |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token Master Bot dari BotFather |
| `OWNER_ID` | ✅ | ID Telegram owner (akses Panel Admin) |
| `MONGO_URI` | ➖ | Connection string MongoDB (kosong = pakai file lokal) |
| `LOG_GROUP_ID` | ➖ | ID grup untuk log |
| `LOG_TOPIC_ID` | ➖ | ID topik di grup log |
| `API_ID` / `API_HASH` | ➖ | Kredensial Telegram API (default publik dipakai jika kosong) |

## ▶️ Menjalankan

```bash
npm start      # produksi
npm run dev    # mode watch (auto-restart saat file berubah)
npm run build  # compile TypeScript
npm test       # menjalankan E2E test runner
```

## 🤖 Cara Pakai

1. Kirim `/start` atau `/menu` ke Master Bot di private chat
2. Pilih **🤖 Userbot** untuk masuk panel userbot
3. Klik **🚀 Register Panel** untuk registrasi akun userbot baru (OTP atau QR)
4. Setelah berhasil login, gunakan dashboard untuk:
   - ⚡ Hidupkan/Matikan Bot
   - 🧩 Kelola Plugin (aktifkan/nonaktifkan modul)
   - ⚙️ Settings (Anti-PM, AFK, custom name)

## 🗂️ Struktur Project

```
src/
├── bot/                    # Master Bot Layer (grammY)
│   ├── conversations/     # Registration flows (OTP, QR)
│   ├── handlers/          # Command & callback handlers
│   ├── ui/                # Dashboard UI components
│   └── index.ts
├── userbot/               # Userbot Layer (GramJS)
│   ├── engine/           # Client, manager, plugin system
│   └── handlers/         # Plugin commands (admin, system, tools, util)
├── services/             # Business logic services
│   ├── UserbotService.ts
│   ├── SystemVarService.ts
│   └── inlineBotManager.ts
├── infrastructure/       # Data persistence layer
│   ├── dbCore.ts        # MongoDB + file fallback + models
│   └── database.ts      # Re-exports
├── utils/               # Shared utilities
│   ├── logger.ts
│   ├── richMessage.ts
│   └── richParser.ts
├── config.ts            # Environment config
└── index.ts             # Entry point
```

## 🧩 Membuat Plugin

Letakkan file `.ts` atau `.js` di `src/userbot/handlers/`. Setiap plugin mengekspor objek default:

```ts
export default {
  name: 'ping',
  help: {
    title: 'Ping',
    description: 'Cek latensi userbot',
    usage: '.ping',
    detail: 'Membalas dengan waktu respons.'
  },
  async execute(client, message, settings, telegramId) {
    const start = Date.now();
    const sent = await message.reply({ message: '🏓 Pong!' });
    const latency = Date.now() - start;
    await sent.edit({ text: `🏓 Pong! \`${latency}ms\`` });
  }
};
```

Field `name` dan `execute` wajib. `help` opsional tetapi jika ada harus lengkap (`title`, `description`, `usage`, `detail`) agar tampil di module library.

## 🐳 Docker

```bash
docker compose up -d
```

## 📚 Dokumentasi

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Penjelasan detail struktur & arsitektur

## 📄 Lisensi

Lihat berkas `LICENSE` (jika tersedia).
