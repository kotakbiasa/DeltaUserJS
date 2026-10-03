# DeltaUserJS — Arsitektur Saat Ini

Dokumen ini adalah peta struktur yang dipakai source saat ini. Dokumen arsitektur
lama disimpan di [`audits/archive/ARCHITECTURE.md`](./audits/archive/ARCHITECTURE.md)
untuk konteks historis, tetapi tidak boleh dipakai sebagai panduan path baru.

## Struktur repository

```text
src/
├── bot/                         # Master Bot berbasis grammY
│   ├── conversations/          # Flow registrasi dan pengaturan multi-langkah
│   ├── handlers/               # Command, callback, owner, backup, marketplace
│   ├── services/               # Integrasi bot khusus, mis. inline bot
│   ├── state/                  # State kecil yang dipersistenkan di data/
│   ├── ui/keyboards/            # Panel dashboard dan keyboard inline
│   │   └── dashboard/           # Handler, panel, keyboard, dan shared helpers
│   └── index.ts                 # Inisialisasi bot utama
├── userbot/                    # Engine userbot GramJS/teleproto
│   ├── engine/                 # Client, lifecycle manager, registry, loader
│   └── handlers/               # Plugin yang dimuat secara dinamis
│       ├── admin/
│       ├── group/
│       ├── system/
│       ├── tools/
│       └── util/
├── server/                     # HTTP server API Mini App dan static files
│   └── routes/                 # Router API per domain
├── services/                   # Business logic lintas bot dan server
├── infrastructure/             # Persistensi MongoDB + fallback JSON dan cache
│   ├── dbCore.ts               # Implementasi storage, model, lock, cache
│   └── database.ts             # Facade/export publik untuk pemanggil lama
├── utils/                      # Utility bersama dan adapter pesan
├── config.ts                   # Konfigurasi environment
├── preflight.ts                # Pemeriksaan konfigurasi sebelum startup
└── index.ts                    # Entry point, lifecycle, health server

webapp/                         # React/Vite Telegram Mini App
scripts/diagnostics/            # Tool manual, bukan runtime/deployment
test/                           # Unit, integration, dan E2E test berbasis dist/
docs/                           # Dokumentasi aktif dan contoh teleproto
```

## Alur runtime

1. `src/index.ts` memuat konfigurasi dan preflight, menginisialisasi database serta
   digital store, lalu menyalakan Master Bot.
2. Setelah Master Bot siap, `UserbotManager` me-restart userbot aktif dari storage.
   Watchdog dan approval enforcer berjalan sebagai service background.
3. HTTP server yang sama menangani `/api/*`, `/health`/`/healthz`, dan hasil build
   Mini App dari `dist/webapp`.
4. Pada development, plugin watcher memantau `src/userbot/handlers/` melalui proses
   `tsx`; pada build production, TypeScript menghasilkan `dist/userbot/handlers/`.

## Plugin userbot

`src/userbot/engine/pluginLoader.ts` melakukan recursive scan terhadap seluruh file
`.ts`/`.js` di `handlers/`, mengimpor default export, memvalidasi `name` dan
`execute`, lalu mendaftarkannya ke `pluginRegistry.ts`. Karena itu, plugin **tidak
boleh dihapus hanya karena tidak memiliki static import**.

Plugin yang dibuat dengan `defineCommand()` dapat membawa indeks `commands` untuk
mempercepat dispatch command. Plugin pasif tanpa indeks tetap dijalankan untuk setiap
pesan yang relevan. `disabled_plugins` hanya menyaring plugin setelah plugin selesai
dimuat. Hot reload melepas plugin lama sebelum mendaftarkan modul baru.

Bentuk minimal plugin:

```ts
export default {
  name: 'ping',
  help: {
    title: 'Ping',
    description: 'Cek latensi userbot',
    usage: '.ping',
    detail: 'Membalas dengan waktu respons.',
  },
  async execute(client, message, settings, telegramId) {
    // handler command
  },
};
```

## Batasan storage

- MongoDB dipakai bila `MONGO_URI` tersedia.
- Tanpa MongoDB, `dbCore.ts` memakai file JSON lokal yang diabaikan Git.
- `database.ts` adalah facade kompatibilitas; service baru sebaiknya mengimpor
  fungsi internal yang memang dibutuhkan dari module yang sesuai.
- State bot yang memang berbasis file berada di direktori data yang dikonfigurasi,
  bukan di source tree.

## Pengelompokan file non-runtime

- `src/utils/richParser.ts` dan `src/utils/validation.ts` saat ini dipakai oleh
  test (`test/customEmoji.test.js` dan `test/validation.test.js`). Keduanya bukan
  dead code walaupun tidak diimpor langsung oleh production entry point.
- `docs/audits/archive/` berisi review, roadmap, dan catatan refactor historis.
  Isinya referensi sejarah, bukan spesifikasi source saat ini.
- `docs/security.md` adalah review keamanan/kualitas aktif; hasil audit lama tetap
  berada di `docs/audits/archive/`.
- `scripts/diagnostics/` berisi pemeriksa panel yang dijalankan manual dengan
  `tsx`; script tersebut tidak dipanggil oleh startup, build, atau deployment.
- `test/` adalah bagian dari quality gate meski tidak diimpor oleh production
  runtime. Test yang diakses `package.json` atau `test/runner.js` tetap dipelihara.
- File di `dist/`, `webapp/dist/`, database lokal, dan log adalah artefak runtime
  atau build; jangan menambahkannya ke Git.

## Perintah penting

```bash
npm run dev                  # backend development + plugin hot reload
npm run build                # backend TypeScript + Mini App
npm test                     # unit test lalu E2E runner
npm run diagnostics:panels   # verifikasi panel dan keyboard dashboard
npm run diagnostics:menus    # cetak panel/keyboard lengkap untuk inspeksi manual
npm run diagnostics:tags     # periksa keseimbangan tag HTML panel settings
```
