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

## 3. Hutang lint di `src/` ✅ SELESAI

`npm run lint` kini **0 error, 0 warning** (sebelumnya 143 warning
`@typescript-eslint/no-explicit-any`). Tidak ada lagi `any` eksplisit di
`src/`.

Yang membuat ini lebih dari sekadar kerapian: `any` pada `UserbotClient.client`
dan pada adapter pesan membuat seluruh pemanggilan ke API Telegram lolos tanpa
diperiksa compiler. Setelah diketik, belasan pemanggilan ke method/field
GramJS yang tidak ada di mtcute langsung ketahuan — semuanya gagal diam-diam
di produksi. Daftarnya ada di §5.

Infrastruktur tipe yang dipakai:

| Berkas | Isi |
|---|---|
| `src/userbot/engine/compatClient.ts` | `CompatClient` (TelegramClient + alias legacy), `LegacyPeer`/`LegacyEntity`/`LegacySendMessageParams`/`LegacySendFileOptions`, helper `toPeer()` |
| `src/userbot/types.ts` | `UserbotMessageLike`, `UserbotEntityLike`, `UserbotSettings` |
| `src/utils/errors.ts` | `errorMessage()`, `rpcErrorText()`, `errorName()`, `isRpcError()` untuk nilai `catch` bertipe `unknown` |

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
| `sendMessage(peer, { file })` | shim `sendMessage` hanya meneruskan teks ke `sendText()` | file **hilang diam-diam**: `.brat`, `.carbon`, `.qr`, `.tts` dkk hanya mengirim caption tanpa gambar. Shim kini mendelegasikan ke `sendFile()` bila ada `file` |
| `parseMode: false` | shim menulis `opts.parseMode \|\| 'html'`, jadi `false` berubah jadi `'html'` | teks yang sengaja dikirim verbatim (`.font`, `.purge` quote, `.schedulemsg`) tetap diparse HTML. Ditangani `resolveParseMode()` |
| `message.copy()` → `forwardMessages({ fromChat, toChat, messages: [id] })` | mtcute: `forwardMessagesById({ fromChatId, toChatId, messages })`; `forwardMessages()` mau objek `Message` | ketiga nama field salah → `.copy()` selalu melempar |
| `kickChatMember(chatId, userId)` posisional (`.kick`) | mtcute memakai satu objek `{ chatId, userId }` | pemanggilan selalu gagal |
| `confirm.delete()` di `.purge`/`.purgeme` | `Message` mtcute tidak punya `.delete()` | pesan konfirmasi "N pesan dihapus" **tidak pernah terhapus** dan menumpuk; kini lewat `client.deleteMessages()` |
| `fresh.message` di `.profiles` | `Message` mtcute memakai `.text` | guard anti-dobel selalu benar → handler **selalu** berhenti di baris pertama |
| `fullChat.description` | `FullChat` mtcute memakai `.bio` | deskripsi grup/channel selalu kosong |
| `client.downloadMedia()` (`.zip`, `.convert`, `.tourl`, `.kang`) | tidak ada di mtcute | **seluruh unduhan media gagal**; kini lewat adapter + `downloadAsBuffer()` |
| `client.getDialogs()` (`.gcast`, `.clear_all_@`, `.clear_all_reacts`) | mtcute hanya punya `iterDialogs()` | `.gcast` melempar sebelum mengirim apa pun |
| `client.iterParticipants()` (`.tagall`) | mtcute: `iterChatMembers()`, dan anggotanya di `member.user` | `.tagall` melempar seketika |
| `client.setChatAdminRights(chat, user, {...})` (`.promote`/`.demote`) | mtcute: `editAdminRights({ chatId, userId, rights, rank })` | selalu gagal |
| `client.getInputPeer()` / `getInputEntity()` (`.help` inline, `.invite`, quotly) | mtcute: `resolvePeer()` / `resolveUser()` / `resolveChannel()` | selalu gagal |
| `forwardMessages(QUOTLY, { messages, fromPeer })` (quotly) | mtcute: `forwardMessagesById({ fromChatId, toChatId, messages })` | selalu gagal |
| shim `getMessages` dipasang di balik `if (!client.getMessages)` | mtcute **sudah punya** nama itu, jadi shim tidak pernah terpasang | semua pemanggil gaya legacy (`{ ids }` / `{ limit }` di `.purge`, `.stalk`, `.kang`, `.sangmata`) mengenai implementasi asli yang hanya menerima array ID. Wrapper kini dipasang tanpa guard |
| `message.downloadMedia()` mengoper objek `Message` ke `downloadAsBuffer()` | parameternya lokasi file (media), bukan pesan | unduhan media lewat adapter **tidak pernah berhasil**; kini memakai `rawMsg.media` |
| `isPrivate`/`isGroup`/`isChannel` dibandingkan dengan `'private'`/`'group'`/`'channel'` | `Peer.type` hanya `'user'` \| `'chat'`; jenis grup ada di `chatType` | ketiga flag **selalu false** |
| `rawMsg.replyToMessageId` | mtcute: `replyToMessage` (`RepliedMessageInfo`) | `replyToMsgId`/`replyTo` selalu `undefined`; `getReplyMessage()` bahkan mengadaptasi objek metadata seolah-olah `Message` |
| `getEntity()` tidak pernah mengisi `className` | pembaca legacy (`.info`) memakainya untuk membedakan user vs grup | shim kini mengisinya dari `Peer.type` |
| `getChat().className` dari `c.type === 'channel'/'supergroup'` | nilai itu tidak pernah muncul di `Peer.type` | dibaca dari `chatType` |

**Belum diperbaiki (sengaja — mengubahnya mengubah tampilan UI):**

- `ubot.client.connected` dibaca di `panelParts/core/main.ts`,
  `core/onboarding.ts`, dan `core/settings.ts`. mtcute tidak mengekspos
  properti ini, jadi nilainya **selalu `undefined`** dan indikator koneksi di
  dashboard permanen menampilkan status "tidak terhubung".
- `client.session.dcId` di `panelParts/core/main.ts` juga tidak ada, sehingga
  DC yang ditampilkan **selalu jatuh ke hardcode `'4'`**.

Helper `toPeer()` di `compatClient.ts` menormalkan identitas peer gaya legacy
(bigint / objek entity) ke bentuk yang diterima mtcute.

**Catatan cakupan.** `tsconfig.json` memakai `strict: false`, jadi
`noImplicitAny` mati: masih ada ~650 parameter tanpa anotasi (67 di antaranya
parameter `client`), dan pemanggilan di dalamnya **tidak** diperiksa compiler.
Temuan di tabel atas yang berada di file-file itu ditemukan lewat audit nama
manual terhadap `keyof CompatClient`, bukan oleh `tsc`. Menyalakan
`noImplicitAny` adalah langkah lanjutan yang masuk akal bila ingin jaminan
menyeluruh.

Keduanya kini dideklarasikan sebagai properti opsional ber-`@deprecated` di
`CompatClient` supaya kebohongannya terlihat di tipe. `ITelegramClient` mtcute
tidak punya padanan publik untuk status koneksi maupun DC saat ini, jadi
memperbaikinya butuh melacak status sendiri lewat event koneksi — pekerjaan
tersendiri yang mengubah perilaku UI.
