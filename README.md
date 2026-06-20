# DeltaUserJS

Multi-userbot manager untuk Telegram. **Master Bot** dibangun dengan
[grammY](https://grammy.dev), sedangkan **userbot** memakai
[GramJS/teleproto](https://github.com/gram-js/gramjs). State persisten disimpan di
MongoDB (dengan fallback file JSON lokal) dan di-cache di memori untuk akses cepat.

## ✨ Fitur

- Manajemen banyak userbot dari satu Master Bot.
- Sistem plugin modular (`src/userbot/plugins/`).
- Pengecek masa aktif (subscription expiration) otomatis.
- Watchdog yang menyambungkan ulang userbot yang terputus.
- Fitur grup: AFK, anti-PM, warn, lock, notes, gcast, kang sticker, dll.

## 📦 Prasyarat

- **Node.js >= 18** (memakai ESM + top-level `await`).
- **MongoDB** (Atlas atau self-hosted) — opsional; tanpa `MONGO_URI` akan
  memakai database file lokal `database.json`.
- **Bot token** dari [@BotFather](https://t.me/BotFather).

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
npm test       # menjalankan E2E test runner
```

## 🧩 Membuat Plugin

Letakkan file `.js` di `src/userbot/plugins/`. Setiap plugin mengekspor objek
default:

```js
export default {
  name: 'ping',
  help: {
    title: 'Ping',
    description: 'Cek latensi userbot',
    usage: '.ping',
    detail: 'Membalas dengan waktu respons.'
  },
  async execute(client, message, settings, telegramId) {
    // logika command di sini
  },
  // opsional:
  async onCallbackQuery(client, event, settings, telegramId) {
    // tangani klik tombol inline; return true bila sudah ditangani
  }
};
```

Field `name` dan `execute` wajib. `help` opsional tetapi jika ada harus lengkap
(`title`, `description`, `usage`, `detail`) agar tampil di module library.

## 🗂️ Struktur Proyek

```
src/
├── index.js              # entry point + expiration checker
├── config.js             # konfigurasi dari .env
├── bot/                  # Master Bot (grammY): menu, percakapan, handler
├── userbot/              # manajer userbot, loader plugin, registry
│   └── plugins/          # plugin command userbot
└── database/db.js        # layer database (Mongo + cache + fallback file)
test/                     # E2E test runner & mock GramJS
```

## 🐳 Docker

```bash
docker compose up -d
```

## 📄 Lisensi

Lihat berkas `LICENSE` (jika tersedia).
