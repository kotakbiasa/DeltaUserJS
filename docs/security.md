# Security & Correctness TODO

Hasil review kode + verifikasi langsung terhadap source (bukan dokumen).
Tanggal verifikasi: **3 Oktober 2026**, commit dasar `1cb96bf`.

> ⚠️ [`audits/archive/SECURITY_AUDIT_REPORT.md`](./audits/archive/SECURITY_AUDIT_REPORT.md) (Juli 2025) sudah **usang** — baris 6 mengklaim
> `exec() → execFile()` sudah diperbaiki, padahal `exec.ts:2` masih
> `import { exec }`. Temuan #1 dan #2 di bawah juga tidak tercantum di sana.
> Dokumen ini yang jadi acuan.

Status: **0 temuan terbuka.** Semua 10 temuan selesai.
Selesai: #1, #2, #3, #4, #5, #6, #7, #8, #9, #10.

---

## Keputusan yang sudah diambil

| Topik | Keputusan | Tanggal |
|---|---|---|
| `.eval` | **Hapus total**, bukan ditambal. Lihat #1. | 2026-10-03 |

---

## 1. `.eval` lolos sandbox `vm` — RCE penuh  ✅ SELESAI

- [x] **Hapus `.eval` sepenuhnya** *(keputusan 2026-10-03 — hapus total, bukan gate/sandbox ulang)*

**File:** `src/userbot/handlers/system/exec.ts`

Objek host dilempar ke dalam `vm` context (`:88–104`): `client`, `message`,
`Math`, `Date`, `JSON`, `String`, `Number`, `Boolean`, `Array`, `Object`,
`Promise`, `Error`, `Set`, `Map`. Semuanya jalur escape via
`.constructor.constructor('return process')()`.

Diverifikasi dengan eksekusi nyata:

```
vm.runInContext("Object.constructor('return process')().pid", ctx)
→ escaped pid = 2141 | real pid = 2141
```

Berhasil keluar dari sandbox dan mendapat objek `process` asli milik host.
`.eval` juga **tidak** dijaga `EXEC_ALLOWED` — gate itu hanya ada di cabang
`exec|sh` (`:118`). Dampak terbatas ke akun owner, tapi jika akun Telegram owner
diambil alih, penyerang dapat RCE di server.

**Cakupan penghapusan (disepakati: hapus total):**

- [x] Buang cabang `if (command === 'eval')` beserta seluruh blok `vm` (`:83–115`)
- [x] Buang konstanta `SAFE_EVAL_CONTEXT` (`:16–25`)
- [x] Buang `await import('node:vm')`
- [x] Ubah regex command `/^\.(eval|exec|sh)…/` → `/^\.(exec|sh)…/` (`:61`)
- [x] Update metadata help: `title` "Eval / Exec (.eval, .exec, .sh)" → "Exec",
      `description`, `usage`, dan `detail` yang menyebut sandbox `.eval`
- [x] Update `description` plugin (`:43`) yang menyebut "kode JavaScript"
- [x] Ganti contoh error `.eval Math.PI` (`:69`) dengan contoh `.exec`
- [x] Grep sisa referensi `.eval` di `help.ts`, README, dan docs

**Catatan:** menghapus `.eval` sekaligus menutup temuan #7 dan #10.

---

## 2. Whitelist `.exec` tidak memblokir `>` `<` `*`  ✅ SELESAI

- [x] Tambahkan `<>` dan `*?[]~` ke character class terlarang
- [x] Pindah dari `exec` ke `execFile` dengan argv terpisah (tanpa shell)

**File:** `src/userbot/handlers/system/exec.ts:27–38`

JSDoc mengklaim *"Block pipes, redirects, backticks, semicolons, newlines"*, tapi
regex `/[;|&`$(){}!\n\r\t\x00-\x1f\x7f]/` tidak memuat `<` maupun `>`.
Diverifikasi:

```
"echo hi > /tmp/x"       ALLOWED      "date; rm -rf /"   BLOCKED
"echo hi >> ~/.bashrc"   ALLOWED      "echo $(id)"       BLOCKED
"wc < /etc/passwd"       ALLOWED
"echo *"                 ALLOWED
```

`echo … >> ~/.bashrc` = tulis file arbitrer → persistence. Butuh `EXEC_ALLOWED=true`.

---

## 3. Rate limiter menghitung semua pesan masuk  ✅ SELESAI

- [x] Batasi hanya pesan outgoing yang berawalan prefix command
      → `shouldCountForRateLimit()` di `rateLimiter.ts`, dipakai `client.ts:271`.
      Diuji di `test/dispatch.test.js`.

**File:** `src/userbot/engine/client.ts:260`, `src/userbot/engine/rateLimiter.ts`

`checkRateLimit()` dipanggil untuk **setiap** event `NewMessage({})` sebelum loop
plugin (`:267`), tanpa cek apakah pesan itu command. Limit 30 pesan / 10 detik per
userbot. Di grup ramai, seluruh plugin berhenti jalan — termasuk anti-flood,
welcome/goodbye, dan keyword filter. Justru mematikan proteksi tepat saat
dibutuhkan.

---

## 4. Blacklist broadcast diabaikan di Mini App  ✅ SELESAI

- [x] Filter `chatIds` dengan `getBroadcastBlacklist(user.id)`
- [x] Batasi jumlah target (`MAX_BROADCAST_TARGETS = 50`, sama dengan `.gcast`)
      dan panjang pesan (`MAX_BROADCAST_MESSAGE_LENGTH = 4096`)
- [x] Cegah broadcast ganda per user — `broadcastInProgress` Set, request kedua
      ditolak dengan HTTP 409
- [x] Response melaporkan `targetCount`, `skippedCount`, dan `cappedCount`

**File:** `src/server/api.ts:421–457`

`.gcast` menghormati blacklist (`gcast.ts:76,95`), endpoint
`POST /api/broadcast/send` tidak sama sekali. Tidak ada batas jumlah `chatIds`,
tidak ada lock sehingga beberapa broadcast bisa jalan paralel dan saling
menumpuk melewati jeda anti-flood 1,2 detik. Panjang pesan terbatas secara tidak
langsung oleh batas body 64 KB.

---

## 5. Hot-reload plugin selalu gagal  ✅ SELESAI

- [x] `unregisterPlugin(name)` di `pluginRegistry.ts` — membersihkan
      `loadedPlugins`, `pluginByName`, `pluginByCommand`, dan `helpRegistry`.
      Hanya melepas command yang benar-benar milik plugin itu, sehingga command
      yang dipegang plugin lain (karena bentrok nama) tetap utuh.
- [x] Dipanggil sebelum register ulang di `loadSinglePlugin`
- [x] Log dibedakan: `✅ Loaded` (pertama) vs `🔄 Reloaded` (hot-reload)
- [x] **Bonus:** `registerPlugin(plugin, { at })` mengembalikan plugin ke posisi
      semula di `loadedPlugins`, supaya urutan eksekusi plugin pasif tidak
      berubah hanya karena sebuah file disimpan.

**File:** `src/userbot/engine/pluginLoader.ts:41–63`, `pluginRegistry.ts:45–52`

`registerPlugin` melempar `plugin duplikat` bila nama sudah terdaftar, dan
`loadSinglePlugin` tidak pernah unregister dulu. Akibatnya hot-reload untuk
plugin yang sudah termuat **100% selalu gagal** dengan
`✗ Failed to reload …: plugin duplikat`. Load pertama juga salah log: menulis
`🔄 Reloaded:` padahal baru dimuat.

---

## 6. `ENCRYPTION_KEY` kosong → kunci acak tiap start  ✅ SELESAI

- [x] Fail-fast saat startup → `src/preflight.ts`, di-import paling awal di `index.ts`
- [x] Error decrypt tidak lagi ditelan — `dbCore.ts` mencatat ERROR yang jelas
- [x] `.env.example` diperbaiki: ditandai WAJIB + perintah pembuat key

**File:** `src/utils/crypto.ts:8–14`, `src/infrastructure/dbCore.ts:128–133`

Tanpa `ENCRYPTION_KEY`, kunci di-generate `randomBytes(32)` setiap proses start
dan hanya diperingatkan lewat `console.log`. Semua session string tersimpan jadi
tidak bisa didekripsi setelah restart.

Diperparah: kegagalan decrypt di `dbCore.ts` ditangkap dengan `catch {}` kosong
lalu **ciphertext mentah diteruskan sebagai session string**. Tidak ada error
yang jelas — semua userbot logout diam-diam dan GramJS hanya gagal auth.

---

## 7. `.exec`/`.eval` tidak memeriksa `message.out`  ✅ SELESAI

- [x] `if (!message.out || !message.message) {return;}` ditambahkan di awal `execute`

**File:** `src/userbot/handlers/system/exec.ts`

0 kemunculan `message.out` di file ini, sementara hampir semua handler lain
memeriksanya. Saat ini aman hanya karena `message.edit()` gagal duluan pada pesan
orang lain — kebetulan, bukan desain.

---

## 8. `restartUserbot()` tidak menyalakan ulang inline bot  ✅ SELESAI

- [x] Diekstrak ke helper bersama `#startLocked()` / `#stopLocked()` yang dipakai
      `startUserbot`, `stopUserbot`, dan `restartUserbot`. Keduanya mengasumsikan
      pemanggil sudah memegang lock, jadi masalah double-lock yang dulu jadi
      alasan menyalin logika tidak muncul. Sekarang hanya ada **satu** tempat yang
      start dan satu yang stop inline bot — diuji di `test/hardening.test.js`.

**File:** `src/userbot/engine/manager.ts:116–144`

`startUserbot()` memanggil `startInlineBotForUser` (`:79–84`) dan `stopUserbot()`
memanggil `stopInlineBotForUser` (`:103`), tapi `restartUserbot()` meng-inline
logika start/stop demi menghindari double-lock dan **melewatkan keduanya**.
Setelah restart, inline bot mati sampai userbot di-stop/start manual.

---

## 9. Data approval disimpan di file lokal, bukan DB  ✅ SELESAI

- [x] Dipindahkan ke direktori data yang **sudah** punya volume
      (`deltauserjs_store_data:/app/data`), mengikuti pola `DIGITAL_STORE_PATH`
      yang sudah dipakai digital store — bukan menambah volume baru.
- [x] `STATE_DIR` bisa di-override lewat env; disetel eksplisit di
      `docker-compose.yml` dan didokumentasikan di `.env.example`.
- [x] Migrasi sekali jalan: file lama di `process.cwd()` dipindah otomatis ke
      direktori baru saat start, jadi deployment lama tidak kehilangan approval.

> Tidak dipindah ke Mongo: keempat file ini dibaca sinkron saat modul di-load
> (`fs.readFileSync` di top level), jadi memindahkannya ke DB berarti mengubah
> seluruh modul jadi async dan menyentuh semua pemanggilnya. Menaruhnya di
> volume menyelesaikan masalah persistensinya dengan perubahan jauh lebih kecil.

**File:** `src/bot/state/approvedUsers.ts:12–15`

`approvals.json`, `approvals_meta.json`, `pending_approvals.json`, dan
`terms_accepted.json` ditulis ke `process.cwd()`.

Di Docker, `process.cwd()` = `/app`, sementara `docker-compose.yml:52–54` hanya
mem-mount `./logs:/app/logs` dan `deltauserjs_store_data:/app/data` — keempat
file itu **di luar volume**. Setiap `docker compose up -d --build` menghapus
seluruh data approval, pending, dan terms-accepted. Tidak ikut backup Mongo juga.

---

## 10. `.eval` tidak pernah meng-`await` hasilnya  ✅ SELESAI

- [x] Tertutup oleh #1 — `.eval` sudah tidak ada

**File:** `src/userbot/handlers/system/exec.ts:110–112`

Kode dibungkus `async function __eval(){ return (…); } __eval();` lalu hasilnya
langsung di-`util.inspect` tanpa await:

```
.eval Math.PI   →   Promise { 3.141592653589793 }
```

Untuk kode async hasilnya `Promise { <pending> }`. Opsi `timeout: 10000` juga
tidak berlaku untuk kerja async di dalam promise tersebut.

---

## Urutan pengerjaan yang disarankan

| PR | Isi | Alasan |
|---|---|---|
| 1 | #1 (hapus `.eval`), #2, #6, #7 | Semua kecil & terisolasi di `exec.ts` + `crypto.ts`. #1 satu-satunya Tinggi. |
| 2 | #3, #5 | Bug fungsional yang diam-diam mematikan fitur. |
| 3 | #4, #8, #9 | Hardening & persistensi. |

Ketiga PR sudah dikerjakan. Tidak ada temuan tersisa.

Setiap PR wajib hijau di: `npx tsc --noEmit`, 11 unit test, dan 60 E2E test.
Untuk #1 dan #2 tambahkan test regresi yang membuktikan jalur escape tertutup.

## Catatan environment

`npm install` gagal di environment bersih — dependency `tgcalls-js`
(`github:kotakbiasa/tgcalls-js`) mengembalikan 403. Untuk menjalankan test,
`tgcalls-js` perlu di-stub atau dijadikan `optionalDependencies` (kodenya sudah
memakai `await import()` dinamis di `vc.ts:58`). Test juga butuh `npm run build`
lebih dulu dan `BOT_TOKEN` terisi, jika tidak `customEmoji.test.js` akan crash.
