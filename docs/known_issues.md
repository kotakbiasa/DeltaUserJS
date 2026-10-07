# Known Issues

Catatan masalah yang sudah diketahui, berikut statusnya. Per 2026-10-04, **seluruh 13 masalah telah 100% diperbaiki dan diverifikasi** (termasuk migrasi penuh mtcute, voice chat tgcalls-js, pengetikan ketat, pembersihan lockfile, watchdog backoff, dan pembersihan fallback TL).

---

## 1. Voice Chat (`vc.ts` + `tgcalls-js`) mtcute-ready ✅ SELESAI

**Status:** Diperbaiki via **Opsi A** (Adapter proxy di `src/userbot/handlers/group/vc.ts`).

**Perbaikan yang diterapkan:**
1. **Proxy TL & `className`:** `createTlProxy()` kini menyertakan `className` turunan PascalCase dan getter `className`, sehingga objek TL yang dibuat memiliki `_` (mtcute) sekaligus `className` (tgcalls-js).
2. **Normalisasi `invoke()`:** Me-resolve channel ID numerik menjadi `InputChannel` sungguhan pada `channels.getFullChannel`, me-resolve peer pada `phone.createGroupCall`, mengonversi `id` & `accessHash` di `InputGroupCall` menjadi `Long`, serta menempelkan `className` secara rekursif pada semua hasil TL update (`UpdateGroupCallConnection`, dll.).
3. **Shim Update Event Handler:** Menambahkan `addEventHandler` dan `removeEventHandler` yang terhubung ke `client.onRawUpdate` mtcute, sehingga callback update di tgcalls-js menerima update bertipe `UpdateGroupCallConnection` secara instan.
4. **Normalisasi `getEntity()`:** Mengembalikan objek entitas dengan `className: 'Channel' | 'Chat' | 'User'` beserta `channelId`/`chatId` terpisah agar `markedIdFromEntity()` tidak gagal.
5. **Koreksi ID Obrolan Grup:** Memperbaiki resolusi `chatId` agar tidak mendua-negatifkan ID bertanda mtcute (`-100...`), serta mendukung download media reply Telegram langsung via mtcute buffer.

---

## 2. Lockfile `tgcalls-js` ter-resolve sebagai `git+ssh://` ✅ SELESAI

Lockfile sebelumnya mengunci commit lama `ac64497` via URL `git+ssh://`,
yang membutuhkan akses SSH/port 22.

**Status:** Diperbarui ke commit terbaru `8459f96` menggunakan resolusi
`git+https://github.com/kotakbiasa/tgcalls-js.git#8459f96`. `npm install` dan
`npm ci` kini berjalan lancar di semua lingkungan CI/Docker publik tanpa SSH key.

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

## 4. Lapisan validasi input perintah ✅ SELESAI

Dulu `src/utils/validation.ts` (10 skema zod) **tidak pernah tersambung ke
handler manapun** lalu dihapus; skemanya mengasumsikan API berparameter
terstruktur, sedangkan handler nyata mem-parse string mentah dari
`message.message`.

Gantinya sekarang `src/userbot/engine/validate.ts` — helper yang memang cocok
dengan cara handler bekerja (`parseIntArg`, `parseTelegramIdArg`,
`parseDurationMsArg`, `parseChoiceArg`, `parseTextArg`, `validationErrorText`),
dengan 14 unit test di `test/validate.test.js`.

Yang ikut ketahuan dan diperbaiki saat memasangnya:

| Perintah | Bug | Akibat |
|---|---|---|
| `.loop <menit>` | tidak ada batas atas | `setInterval` Node memakai penghitung 32-bit: delay > ~24,8 hari **tidak ditolak**, melainkan diam-diam jadi 1 ms → `.loop 99999999 hai` berubah jadi spam tiap milidetik. Kini dibatasi 7 hari |
| `.setfloodlimit` / `.setfloodwarn` / `.setfloodtime` | `parseInt()` tanpa batas | `"5abc"` lolos sebagai 5; `999999` mematikan anti-flood tanpa pemberitahuan |
| `.setrepfloor`, `.rep <id>` | argumen tidak valid hanya `return` | perintah tampak "tidak melakukan apa-apa"; `Number('')` juga lolos sebagai 0 |
| `remind.ts` + `schedulemsg.ts` | `parseDurationMs()` diduplikat | dua salinan aturan yang bisa menyimpang; kini satu helper (batas 7 hari tetap) |

Khusus `.exec`, pengamanannya tidak pernah bergantung pada skema zod itu dan
tetap utuh: owner-only, gerbang `EXEC_ALLOWED`, `execFile` tanpa shell,
whitelist 12 perintah, dan penolakan karakter khusus.

---

## 5. Pemanggilan API hantu yang dulu disembunyikan `any` ✅ SUDAH DIPERBAIKI

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

**Indikator koneksi & DC — ✅ kini diperbaiki (dulu sengaja dibiarkan):**

- `ubot.client.connected` (nama GramJS) selalu `undefined`, jadi indikator
  koneksi di dashboard permanen "tidak terhubung". Kini `UserbotClient`
  berlangganan `client.onConnectionState` milik mtcute dan mengeksposnya lewat
  `isConnected()`; saat emitter tidak tersedia (mock test) statusnya `unknown`
  dan tidak dianggap mati.
- `client.session.dcId` juga tidak ada, sehingga DC yang ditampilkan **selalu
  hardcode `'4'`**. Kini diambil dari `client.getPrimaryDcId()` (di-prefetch
  saat start agar panel sinkron bisa membacanya) dan menampilkan `—` bila
  benar-benar belum diketahui, bukan angka palsu.
- Keduanya sudah dihapus dari tipe `CompatClient` karena tidak ada lagi
  pembacanya.

Helper `toPeer()` di `compatClient.ts` menormalkan identitas peer gaya legacy
(bigint / objek entity) ke bentuk yang diterima mtcute.

**Catatan cakupan.** ✅ `noImplicitAny` kini **aktif** di `tsconfig.json`
(`strict` masih `false`). Seluruh ~650 parameter implicit-any sudah diketik,
sehingga setiap pemanggilan API di dalamnya diperiksa compiler. Ronde
pengetikan itu memunculkan tabel temuan tambahan di §6.

---

## 6. Bug yang ditemukan saat menyalakan `noImplicitAny` ✅ SUDAH DIPERBAIKI

Mengetik parameter bukan pekerjaan kosmetik: begitu `tsc` bisa melihat **bentuk
argumen**, kelas bug berikut muncul. Semuanya sudah diperbaiki.

| Lokasi | Bug | Dampak sebelum perbaikan |
|---|---|---|
| `admin/moderate.ts` | `.kick/.ban/.unban/.mute` memanggil mtcute secara posisional di dalam cabang `if (typeof client.X === 'function')` yang **selalu** benar | seluruh suite moderasi melempar `TypeError`; fallback `client.call()` tidak pernah tercapai |
| `admin/moderate.ts` | `.unmute` mengirim `restrictions: { sendMessages: true }` (semantik TL: `true` = DILARANG) | unmute justru membisukan; cabang TL-nya malah mem-ban total lewat `viewMessages: true` |
| `admin/moderate.ts` | panggilan TL mentah dikirimi objek entity sebagai `channel`/`peer` | butuh `InputChannel`/`InputPeer` — selalu ditolak |
| `admin/moderate.ts` (`.lock`) | pembeda supergroup memakai `chat.className === 'Channel'` | `getEntity()` tidak pernah menghasilkan nilai itu → selalu jalur basic group |
| `group/antiflood.ts` | kick/mute posisional + restriction terbalik | hukuman flood tidak pernah terpasang (error ditelan `.catch`) |
| `group/antiflood.ts` | service message disaring lewat `action.className` gaya GramJS | pesan join/leave ikut dihitung sebagai flood |
| `group/welcome.ts` | event join/leave dicocokkan dengan `className` GramJS | **welcome & leave tidak pernah terpicu** |
| `group/gnotes.ts` | `message.peerId.className === 'PeerChat'` padahal `peerId` hanya ID angka | recall `#hashtag` dan `.gsave/.gnotes` selalu menolak dengan "hanya di grup" |
| adapter | media tidak diturunkan dari `Message.media` mtcute | `msg.sticker/.gif/.photo/.video/...` selalu `undefined` → `.toimg`, `.tovid`, `.tovoice` dkk menolak bekerja |
| `tools/stickers.ts` | `classifyMedia()` membaca `media.photo` / `media.document` ala TL mentah | `.kang` menolak semua media |
| `tools/stickers.ts` (`.q`) | balasan QuotLyBot dibaca via `media.document.mimeType` dan `date` sebagai epoch detik | deteksi hasil quote selalu gagal |
| `system/sessions.ts` | `hash` untuk `account.resetAuthorization` dibuat dengan `BigInt()` | skema TL mtcute memakai `Long` → serialisasi gagal |
| `test/mockMtcute.js` | mock tidak punya `kick/ban/unban/restrictChatMember` sama sekali | test selalu melewati jalur fallback TL, sehingga **semua bug moderasi di atas lolos dari 178 test** |

Pelajaran yang paling mahal: pola
`if (typeof client.X === 'function') { client.X(posisional) } else { client.call(TL) }`
adalah jebakan. Pada mtcute cabang pertama selalu diambil, fallback TL jadi kode
mati, dan bentuk argumen yang salah lolos karena bertipe `any`.

---

## 7. Direktori data marketplace tersimpan di dalam `dist/` ✅ SUDAH DIPERBAIKI

`pluginMarketplace.ts` me-resolve `path.join(__dirname, '../../plugins_marketplace')`.
Dari `dist/userbot/engine`, dua tingkat hanya sampai ke `dist/`, jadi
`registry.json` dan seluruh plugin terpasang disimpan di
`dist/plugins_marketplace` — **ikut terhapus setiap kali `dist/` dibangun
ulang**, dan tidak pernah cocok dengan entri `plugins_marketplace/` di
`.gitignore` yang menunjuk root repo.

Kini tiga tingkat ke atas (root repo), bisa ditimpa lewat
`PLUGINS_MARKETPLACE_DIR`, dan dijaga satu unit test.

---

## 8. Sisa `teleproto` di `package-lock.json` ✅ SUDAH DIPERBAIKI

`teleproto` sudah lama dicopot dari `package.json`, tetapi lockfile masih
mencantumkannya di blok root **dan** sebagai paket utuh
(`node_modules/teleproto@1.229.0`). Akibatnya `npm install` terlihat bersih,
sementara **`npm ci` tetap menarik kembali** paket GramJS-family itu ke CI dan
image produksi.

Diperbaiki dengan suntingan bedah: hanya dua entri tersebut yang dihapus
(21 baris), sehingga resolusi paket lain — termasuk `tgcalls-js` yang memakai
`git+ssh` dan pin commit `ac64497` — tidak bergeser sama sekali. `big-integer`
sengaja **dipertahankan** karena `tgcalls-js` masih membutuhkannya (`>=1.6`).

**Pembersihan tuntas:** Setelah lockfile di-resolve ulang melalui HTTPS pada §2, seluruh lima paket yatim tersebut (`node-localstorage`, `store2`, `write-file-atomic`, `graceful-fs`, `slide`) telah otomatis dibersihkan sepenuhnya dari `package-lock.json`. Lockfile kini 100% bersih.

---

## 9. Konversi sesi GramJS dihapus — repo full mtcute ✅

`client.ts` dulu mencoba `convertFromGramjsSession()` sebagai fallback ketika
`importSession()` gagal, sehingga sesi lama era GramJS masih bisa dipakai.
Jalur itu kini **dihapus total**, berikut dependensi `@mtcute/convert` dari
`package.json` dan `package-lock.json` (suntingan bedah 2 entri; `@mtcute/core`
dan `@fuman/*` tetap ada karena dipakai `@mtcute/node`).

**Dampak yang perlu diketahui.** Semua sesi baru memang sudah lahir dari
`client.exportSession()` milik mtcute (lihat `registration/otp.ts` dan
`registration/qr.ts`), jadi alur login normal tidak terpengaruh. Tetapi baris
userbot di database yang **masih menyimpan string sesi format GramJS dari
sebelum migrasi tidak akan bisa start lagi** — pemiliknya harus menghapus
userbot itu dan login ulang. Pesan error sudah diubah agar menyebutkan hal itu
secara eksplisit, bukan sekadar "sesi tidak valid".

---

## 10. Handler kritis tanpa test — dan dua bug yang langsung ketahuan ✅

30 dari 59 handler userbot tidak tersentuh test sama sekali, termasuk
`moderate.ts` (553 baris) dan `purge.ts` — justru berkas yang paling banyak
diubah saat migrasi GramJS → mtcute. Ditambahkan **17 test E2E baru** (Tier 5)
untuk `.mute/.unmute/.ban/.kick/.promote/.demote/.lock`, `.purge/.purgeme`,
`.tagall`, dan `.gsave` + recall `#hashtag`.

Test ini sengaja memeriksa **bentuk argumen** yang dikirim ke klien, bukan
sekadar teks balasan — di situlah bug migrasi bersembunyi. Mock
(`test/mockMtcute.js`) ikut diperluas dengan permukaan mtcute yang sebelumnya
tidak ada (`resolvePeer`/`resolveUser`/`resolveChannel`, `editAdminRights`,
`iterChatMembers`, `getChat`, `sendFile`, `message.getChat()`,
`getSender()`), karena ketiadaannya membuat handler diam-diam jatuh ke cabang
fallback `client.call()` sehingga jalur yang benar-benar dipakai di produksi
tak pernah diuji.

**Bug yang ditemukan dan diperbaiki:**

| Lokasi | Gejala |
|---|---|
| `moderate.ts` `resolveTarget()` | Saat perintah berupa **reply**, token pertama argumen tetap dipotong sebagai "target". Akibatnya `.ban spam parah` menyimpan alasan `"parah"` (kata pertama hilang), dan `.promote Moderator` kehilangan gelarnya sehingga rank jatuh ke default `"Admin"`. Kini token hanya dipotong bila tidak sedang membalas pesan. |
| `test/mockMtcute.js` | `until`/`untilDate` numerik diperlakukan sebagai milidetik, padahal mtcute memaknainya sebagai **unix detik**. Mute berdurasi apa pun tampak sudah kedaluwarsa — bug mock yang akan menyamarkan regresi `.mute` sungguhan. |

---

## 11. `strictNullChecks` kini aktif ✅

`tsconfig.json` sekarang memakai `noImplicitAny: true` **dan**
`strictNullChecks: true` (`strict` masih `false`). Saat dinyalakan, compiler
melaporkan **236 error**; semuanya sudah dibereskan.

**Dua pola sistemik — 123 dari 236 error:**

| Pola | Jumlah | Penyelesaian |
|---|---|---|
| `ctx.from` mungkin undefined | 110 | `BotContext` mendeklarasikan `from` non-opsional, dijamin middleware pertama di `bot/index.ts` yang membuang update tanpa `from` (channel post, poll). Bot ini memang hanya melayani interaksi user. |
| `ctx.match`/`ctx.chat`/`ctx.message` mungkin undefined di dalam handler ber-filter | 13 | Anotasi `ctx: BotContext` yang ditulis manual justru **mematikan penyempitan tipe** dari filter grammY. Anotasinya dihapus supaya `bot.on('inline_query')`, `bot.command()`, dan `bot.callbackQuery(/re/)` memberi context yang sudah menyempit. |

**Temuan yang pantas dicatat:**

- Beberapa variabel `let` yang hanya di-assign dari dalam callback (`twoFaReject`
  di alur QR 2FA) disimpulkan compiler selalu `null`, sehingga pemanggilannya
  ditandai "not callable". Diganti satu objek pemegang state (`twoFa.resolve` /
  `twoFa.reject`) agar penyempitan bekerja benar.
- `qrResult.sessionString` sudah dijaga `if (!...) throw`, tetapi penyempitan itu
  hilang saat nilainya dibaca lagi di dalam closure `conversation.external()`.
  Disalin ke `const` sebelum dipakai.
- Beberapa handler memakai `message.chatId` langsung sebagai kunci pengaturan
  chat. Bila undefined, kuncinya menjadi string `"undefined"` — pengaturan satu
  chat hantu yang dipakai bersama. Kini keluar lebih awal.
- Password 2FA kosong dulu diteruskan apa adanya; sekarang ditolak dengan pesan
  jelas dan sesi registrasi dibersihkan.

---

## 12. Watchdog Reconnect: Exponential Backoff & Deteksi Sesi Mati ✅ SELESAI

**Status:** Diimplementasikan di `src/userbot/engine/manager.ts`, diuji lewat 4 unit test di `test/watchdog.test.js`.

**Masalah sebelumnya:**
1. Watchdog mencoba menghubungkan ulang userbot yang offline pada setiap interval (120 detik) tanpa batas percobaan dan tanpa jeda bertahap.
2. Ketika sesi Telegram pengguna telah dicabut atau tidak valid (`AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED`, dll.), watchdog tetap mencoba menghubungkan kembali secara berulang-ulang tanpa henti (infinite loop), membanjiri log sistem.

**Perbaikan:**
1. **Exponential Backoff:** Setiap kegagalan berturut-turut melipatgandakan interval jeda reconnect ($1\times, 2\times, 4\times$).
2. **Maksimal 3 Percobaan:** Setelah 3 kali gagal berturut-turut, userbot otomatis dinonaktifkan (`is_active = 0`) dan dibersihkan dari memori.
3. **Deteksi Sesi Mati Seketika:** Error otentikasi permanen Telegram (`AUTH_KEY_*`, `SESSION_*`, `USER_DEACTIVATED*`) langsung menonaktifkan userbot pada percobaan pertama tanpa membuang-buang siklus retry.
4. **Notifikasi Pengguna:** Pemilik akun otomatis menerima pesan pemberitahuan Telegram dari Master Bot yang menjelaskan alasan penonaktifan dan mengarahkan untuk login ulang via `/daftar`.

---

## 13. Pembersihan Kode Fallback Panggilan TL/GramJS Kuno ✅ SELESAI

**Status:** Dibersihkan di `moderate.ts`, `warn.ts`, `clearnotif.ts`, dan `sessions.ts`.

**Masalah sebelumnya:**
Sisa kode migrasi lawas masih membungkus pemanggilan API mtcute dengan pola berulang:
`if (typeof client.kickChatMember === 'function') { ... } else if (typeof client.call === 'function') { ... } else if (typeof client.invoke === 'function') { ... }`
Cabang `client.invoke` dan `client.call` di dalamnya adalah kode mati (dead code) warisan GramJS/teleproto yang tidak pernah dieksekusi. Di beberapa tempat, parameter di cabang fallback bahkan memanggil fungsi yang tidak terdefinisi (`resolveChannelPeer`).

**Perbaikan:**
Seluruh pemanggilan method moderasi (`kickChatMember`, `banChatMember`, `unbanChatMember`, `restrictChatMember`, `editAdminRights`) dan TL call (`account.getAuthorizations`, `account.resetAuthorization`, `messages.readMentions`) kini langsung memanggil method mtcute standar tanpa cabang usang. Hasilnya: kode jauh lebih ringkas, aman, dan mudah dirawat.

