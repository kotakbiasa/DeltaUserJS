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
- Telegram Mini App responsif dengan tema Telegram (light/dark)
- Toko plugin digital dengan pesanan dan fulfilment manual oleh owner
- Utilitas lokal: kalkulator aman, pengolahan teks, dan password generator

## 📦 Prasyarat

- **Node.js >= 18** (memakai ESM + top-level `await`)
- **MongoDB** (Atlas atau self-hosted) — opsional; tanpa `MONGO_URI` akan memakai database file lokal `database.json`
- **Bot token** dari [@BotFather](https://t.me/BotFather)

## 🚀 Instalasi

```bash
git clone https://github.com/kotakbiasa/DeltaUserJS.git
cd DeltaUserJS
npm install
npm --prefix webapp install
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
| `APP_URL` | ✅ | URL HTTPS Mini App yang terdaftar di BotFather |
| `ALLOW_DEV_AUTH` | ➖ | `true` hanya untuk browser development lokal; jangan aktifkan di production |
| `DIGITAL_STORE_PATH` | ➖ | Lokasi JSON toko digital; default `data/digital-store.json` |
| `MIDTRANS_SERVER_KEY` / `XENDIT_API_KEY` | ➖ | Payment gateway untuk checkout langganan |

## ▶️ Menjalankan

```bash
npm start      # produksi
npm run dev    # mode watch (auto-restart saat file berubah)
npm run build  # compile backend + Mini App
npm test       # unit + E2E test runner
```

## 📱 Telegram Mini App

Frontend berada di `webapp/` dan memakai React + Vite. Backend REST API,
validasi `initData` Telegram, serta penyimpanan file statik berada di `src/server/`.

```bash
npm run build:webapp       # build frontend saja
npm --prefix webapp run dev  # Vite dev server
```

Untuk deployment:

1. Deploy aplikasi di domain **HTTPS** dan set `APP_URL=https://domain-anda.com`.
2. Daftarkan URL tersebut di **@BotFather → Bot Menu → Mini App**.
3. Jalankan `npm run build`; server produksi menyajikan frontend dari
   `dist/webapp` dan API dari `/api/*`.
4. Buka `/app` dari Master Bot atau tombol menu bot.

Data toko digital disimpan pada `data/digital-store.json` secara default.
Backup file ini bersama database utama. Jangan menyimpan `initData` pengguna
di browser atau log server. Checkout paket berbayar memerlukan MongoDB serta
Midtrans/Xendit; jika belum dikonfigurasi, Mini App mengarahkan pengguna ke owner.
Renewal otomatis belum melakukan penagihan; konfirmasi perpanjangan tetap manual.
Penyimpanan JSON toko digital mengasumsikan satu instance aplikasi; gunakan database bersama bila menjalankan beberapa worker.

## 🤖 Cara Pakai

1. Kirim `/start` atau `/menu` ke Master Bot di private chat
2. Pilih **🤖 Userbot** untuk masuk panel userbot
3. Klik **🚀 Register Panel** untuk registrasi akun userbot baru (OTP atau QR)
4. Setelah berhasil login, gunakan dashboard untuk:
   - ⚡ Hidupkan/Matikan Bot
   - 🧩 Kelola Plugin (aktifkan/nonaktifkan modul)
   - 🛍️ Toko Plugin (pesanan digital dikonfirmasi manual oleh owner)
   - 🧮 Utilitas lokal (kalkulator, teks, password)
   - ⚙️ Settings (Anti-PM, AFK, custom name)

Owner dapat membuka **Toko → Kelola** untuk menambahkan produk, mengaktifkan
produk, dan memperbarui status pesanan.

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
│   └── DigitalStoreService.ts
├── server/               # Mini App REST API, auth, static files
├── infrastructure/       # Data persistence layer
│   ├── dbCore.ts        # MongoDB + file fallback + models
│   └── database.ts      # Re-exports
├── utils/               # Shared utilities
│   ├── logger.ts
│   ├── richMessage.ts
│   └── richParser.ts
├── config.ts            # Environment config
└── index.ts             # Entry point

webapp/                  # React + Vite Telegram Mini App
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
