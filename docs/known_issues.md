# Known Issues

Catatan masalah yang **sudah diketahui tapi belum diperbaiki**. Status per 2026-10-04.

---

## 1. Voice Chat (`vc.ts` + `tgcalls-js`) belum mtcute-ready 🔴

**Dampak:** perintah Voice Chat userbot (`.play`, `.vplay`, `.vjoin`, `.leave`, dst.
di `src/userbot/handlers/group/vc.ts`) kemungkinan besar **gagal saat runtime**,
meskipun `tsc` bersih dan semua test hijau.

**Kenapa lolos typecheck:** semua titik sentuh ke tgcalls-js bertipe
`unknown`/`never`, jadi ketidakcocokan bentuk objek tidak terdeteksi compiler.
Ini bug runtime yang diam, bukan error kompilasi.

**Akar masalah:** `tgcalls-js@0.2.0` (pin `github:kotakbiasa/tgcalls-js`) ditulis
untuk klien **GramJS-family** (`telegram` / `teleproto`). Setelah migrasi ke
mtcute, konvensi berikut tidak lagi terpenuhi:

| # | Lokasi | Asumsi GramJS | Realita mtcute |
|---|--------|---------------|----------------|
| 1 | `tgcalls-js/dist/index.js:478` (`findConnectionParams`) dan `:424` (update handler) | `upd.className === 'UpdateGroupCallConnection'` | hasil `client.call()` memakai `_: 'updateGroupCallConnection'`, tidak punya `className` → params koneksi tak pernah ditemukan → `join()` melempar `"JoinGroupCall succeeded but no UpdateGroupCallConnection was received"` setelah ±3 detik |
| 2 | `tgcalls-js/dist/index.js:359` (`getGroupCall`) | `channels.GetFullChannel({ channel: markedId })` — GramJS menerima id numerik | `client.call()` butuh objek `InputChannel` sungguhan → gagal sebelum join |
| 3 | `tgcalls-js/dist/index.js:418` (`installUpdateHandler`) | `client.addEventHandler` tersedia | klien mtcute tidak punya, dan alias kompat di `UserbotClient.setupClientCompatibility()` tidak menyediakannya → jalur fallback update mati |
| 4 | `tgcalls-js/dist/index.js:506-510` (`markedIdFromEntity`) | entity punya `className === 'Channel'/'Chat'` | alias `getEntity` mengembalikan `{ id, title, username, ... }` tanpa `className` → resolve `@username` selalu gagal |
| 5 | `src/userbot/handlers/group/vc.ts:228` | `chat.className === 'Channel'` | objek chat mtcute memakai `chat.type` / `chatType` |

**Yang sudah benar** (jangan diulang): `vc.ts` sudah membangun TL proxy sendiri
yang menghasilkan `_: 'phone.joinGroupCall'` gaya mtcute dan mengopernya sebagai
opsi `Api` eksplisit — jadi `loadTl()` tidak perlu paket `telegram`/`teleproto`.
Alias `client.invoke → client.call` juga sudah ada di
`src/userbot/engine/client.ts`.

**Opsi perbaikan** (belum dipilih):

- **A — Adapter lokal di `vc.ts`.** Bungkus klien mtcute dengan proxy:
  `invoke()` me-resolve peer numerik menjadi `InputChannel` dan menempelkan
  `className` (turunan dari `_`, PascalCase) secara rekursif pada hasil;
  `getEntity()` mengembalikan `className`; tambah shim `addEventHandler` /
  `removeEventHandler` ke raw update mtcute. Tidak menyentuh repo lain, tapi
  sifatnya menambal dari luar.
- **B — Perbaiki upstream di `kotakbiasa/tgcalls-js`.** Terima `_` maupun
  `className`, dan buat peer resolver pluggable; lalu bump pin commit di
  `package.json`. Lebih bersih dan permanen.

**Catatan verifikasi:** tidak bisa diuji di CI/sandbox — butuh akun Telegram
sungguhan, kredensial MTProto, dan voice chat aktif.

---

## 2. Lockfile `tgcalls-js` ter-resolve sebagai `git+ssh://` 🟡

`package-lock.json` menyimpan:

```
"resolved": "git+ssh://git@github.com/kotakbiasa/tgcalls-js.git#ac64497..."
```

Repo-nya **publik** dan commit tersebut **ada**, tapi resolusi via SSH membuat
`npm ci` gagal di lingkungan tanpa SSH key atau dengan port 22 diblokir
(sebagian runner CI, image Docker minimal, sandbox).

**Status:** sengaja dibiarkan — build yang sekarang sudah jalan.

**Workaround** kalau suatu saat install gagal dengan
`kex_exchange_identification` / `Could not read from remote repository`:

```bash
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
npm install
```

Solusi permanen (bila diinginkan nanti): re-resolve lockfile memakai
`git+https://`.

---

## 3. Hutang lint di `src/` 🟡

**Progres:** 143 → **111 warning**. `src/userbot/engine/client.ts` (32 warning,
penyumbang terbesar) sudah nol: `UserbotClient.client` kini bertipe
`CompatClient` (`src/userbot/engine/compatClient.ts`) alih-alih `any`.

`npm run lint` sebelumnya melaporkan **143 warning** `@typescript-eslint/no-explicit-any`.
Error sudah nol (dulu 42, dibereskan terpisah). Warning `any` ini belum
disentuh — dan `any`-lah yang menyembunyikan ketidakcocokan VC di §1 dari
compiler, jadi mengetatkannya punya nilai lebih dari sekadar kerapian.

## 4. Tidak ada lapisan validasi input perintah 🟡

Dulu ada `src/utils/validation.ts` (10 skema zod) yang **tidak pernah
tersambung ke handler manapun**, lalu dihapus. Skemanya mendeskripsikan API
berparameter terstruktur (`{ text, silent, pin }`, `{ code, language }`),
sedangkan handler yang nyata mem-parse string mentah dari `message.message` —
jadi memasangnya butuh mendesain ulang parsing perintah, bukan sekadar
menyambung.

Khusus `.exec`, pengamanannya tidak bergantung pada skema itu dan tetap utuh:
owner-only, gerbang `EXEC_ALLOWED`, `execFile` tanpa shell, whitelist 12
perintah, dan penolakan karakter khusus.

---

## 5. Pemanggilan API hantu yang dulu disembunyikan `any` 🔴

Begitu `UserbotClient.client` diberi tipe nyata, compiler menemukan beberapa
pemanggilan ke method/properti yang **tidak pernah ada di mtcute**. Semuanya
berada di dalam `try/catch` atau dibaca sebagai `undefined`, jadi gagal
diam-diam, bukan crash.

**Sudah diperbaiki:**

| Pemanggilan lama | Kenyataan | Perbaikan |
|---|---|---|
| `client.getMessage(chatId, msgId)` | tidak ada | `(await client.getMessages(chat, [id]))[0]` — akibatnya `getMessage()` pada callback query **selalu** `null`, tombol inline yang butuh pesan asalnya tidak pernah bekerja |
| `query.message` di `onAnyCallbackQuery` | hanya ada di *business* callback query | handler dipindah ke `onCallbackQuery` (callback pesan chat biasa) dan pesan selalu diambil lewat `getMessages`; inline/business callback memang tidak pernah didukung UI ini dan dulu pasti gagal di `query.chat.id` |
| `client.getProfilePhoto(peer)` | butuh `(userId, photoId)` | `getProfilePhotos(peer, { limit: 1 })` — shim `downloadProfilePhoto()` selalu melempar, jadi `.info`, `.me`, dan `.profiles` **tidak pernah** menampilkan foto profil |
| rantai `close()` / `disconnect()` di `stop()` | hanya `destroy()` yang nyata | dipersempit ke tipe probe eksplisit; dua cabang lain hanya untuk mock test |

**Belum diperbaiki (sengaja — mengubahnya mengubah tampilan UI):**

- `ubot.client.connected` dibaca di `panelParts/core/main.ts`,
  `core/onboarding.ts`, dan `core/settings.ts`. mtcute tidak mengekspos
  properti ini, jadi nilainya **selalu `undefined`** dan indikator koneksi di
  dashboard permanen menampilkan status "tidak terhubung".
- `client.session.dcId` di `panelParts/core/main.ts` juga tidak ada, sehingga
  DC yang ditampilkan **selalu jatuh ke hardcode `'4'`**.

Keduanya kini dideklarasikan sebagai properti opsional ber-`@deprecated` di
`CompatClient` supaya kebohongannya terlihat di tipe. `ITelegramClient` mtcute
tidak punya padanan publik untuk status koneksi maupun DC saat ini, jadi
memperbaikinya butuh melacak status sendiri lewat event koneksi — pekerjaan
tersendiri yang mengubah perilaku UI.
