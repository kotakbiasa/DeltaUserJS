# Security & Correctness TODO

Hasil review kode + verifikasi langsung terhadap source (bukan dokumen).
Tanggal verifikasi: **3 Oktober 2026**, commit dasar `1cb96bf`.

> ⚠️ `SECURITY_AUDIT_REPORT.md` (Juli 2025) sudah **usang** — baris 6 mengklaim
> `exec() → execFile()` sudah diperbaiki, padahal `exec.ts:2` masih
> `import { exec }`. Temuan #1 dan #2 di bawah juga tidak tercantum di sana.
> Dokumen ini yang jadi acuan.

Status: 10 temuan terbuka — 1 Tinggi, 5 Sedang, 4 Rendah. Belum ada yang dikerjakan.

---

## Keputusan yang sudah diambil

| Topik | Keputusan | Tanggal |
|---|---|---|
| `.eval` | **Hapus total**, bukan ditambal. Lihat #1. | 2026-10-03 |

---

## 1. `.eval` lolos sandbox `vm` — RCE penuh  🔴 TINGGI

- [ ] **Hapus `.eval` sepenuhnya** *(keputusan 2026-10-03 — hapus total, bukan gate/sandbox ulang)*

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

- [ ] Buang cabang `if (command === 'eval')` beserta seluruh blok `vm` (`:83–115`)
- [ ] Buang konstanta `SAFE_EVAL_CONTEXT` (`:16–25`)
- [ ] Buang `await import('node:vm')`
- [ ] Ubah regex command `/^\.(eval|exec|sh)…/` → `/^\.(exec|sh)…/` (`:61`)
- [ ] Update metadata help: `title` "Eval / Exec (.eval, .exec, .sh)" → "Exec",
      `description`, `usage`, dan `detail` yang menyebut sandbox `.eval`
- [ ] Update `description` plugin (`:43`) yang menyebut "kode JavaScript"
- [ ] Ganti contoh error `.eval Math.PI` (`:69`) dengan contoh `.exec`
- [ ] Grep sisa referensi `.eval` di `help.ts`, README, dan docs

**Catatan:** menghapus `.eval` sekaligus menutup temuan #7 dan #10.

---

## 2. Whitelist `.exec` tidak memblokir `>` `<` `*`  🟡 SEDANG

- [ ] Tambahkan `<>` (dan pertimbangkan `*?[]~`) ke character class terlarang
- [ ] Lebih baik: pindah dari `exec` ke `execFile` dengan argv terpisah (tanpa shell)

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

## 3. Rate limiter menghitung semua pesan masuk  🟡 SEDANG

- [ ] Batasi hanya pesan outgoing yang berawalan prefix command, atau pindahkan
      ke dalam plugin command

**File:** `src/userbot/engine/client.ts:260`, `src/userbot/engine/rateLimiter.ts`

`checkRateLimit()` dipanggil untuk **setiap** event `NewMessage({})` sebelum loop
plugin (`:267`), tanpa cek apakah pesan itu command. Limit 30 pesan / 10 detik per
userbot. Di grup ramai, seluruh plugin berhenti jalan — termasuk anti-flood,
welcome/goodbye, dan keyword filter. Justru mematikan proteksi tepat saat
dibutuhkan.

---

## 4. Blacklist broadcast diabaikan di Mini App  🟡 SEDANG

- [ ] Filter `chatIds` dengan `getBroadcastBlacklist(user.id)`
- [ ] Batasi jumlah target dan panjang pesan
- [ ] Cegah broadcast ganda per user (lock/antrian)

**File:** `src/server/api.ts:421–457`

`.gcast` menghormati blacklist (`gcast.ts:76,95`), endpoint
`POST /api/broadcast/send` tidak sama sekali. Tidak ada batas jumlah `chatIds`,
tidak ada lock sehingga beberapa broadcast bisa jalan paralel dan saling
menumpuk melewati jeda anti-flood 1,2 detik. Panjang pesan terbatas secara tidak
langsung oleh batas body 64 KB.

---

## 5. Hot-reload plugin selalu gagal  🟡 SEDANG

- [ ] **Buat `unregisterPlugin(name)`** di `pluginRegistry.ts` — fungsi ini belum ada
      (harus membersihkan `loadedPlugins`, `pluginByName`, dan `helpRegistry`)
- [ ] Panggil sebelum register ulang di `loadSinglePlugin`
- [ ] Bedakan log "Loaded" (pertama) vs "Reloaded" (hot-reload)

**File:** `src/userbot/engine/pluginLoader.ts:41–63`, `pluginRegistry.ts:45–52`

`registerPlugin` melempar `plugin duplikat` bila nama sudah terdaftar, dan
`loadSinglePlugin` tidak pernah unregister dulu. Akibatnya hot-reload untuk
plugin yang sudah termuat **100% selalu gagal** dengan
`✗ Failed to reload …: plugin duplikat`. Load pertama juga salah log: menulis
`🔄 Reloaded:` padahal baru dimuat.

---

## 6. `ENCRYPTION_KEY` kosong → kunci acak tiap start  🟡 SEDANG

- [ ] Fail-fast saat startup bila `ENCRYPTION_KEY` kosong (tiru pola `BOT_TOKEN` di `config.ts`)
- [ ] Jangan telan error decrypt diam-diam — log jelas / fail
- [ ] Perbaiki `.env.example:7` yang menyarankan *"or let the app handle it"*

**File:** `src/utils/crypto.ts:8–14`, `src/infrastructure/dbCore.ts:128–133`

Tanpa `ENCRYPTION_KEY`, kunci di-generate `randomBytes(32)` setiap proses start
dan hanya diperingatkan lewat `console.log`. Semua session string tersimpan jadi
tidak bisa didekripsi setelah restart.

Diperparah: kegagalan decrypt di `dbCore.ts` ditangkap dengan `catch {}` kosong
lalu **ciphertext mentah diteruskan sebagai session string**. Tidak ada error
yang jelas — semua userbot logout diam-diam dan GramJS hanya gagal auth.

---

## 7. `.exec`/`.eval` tidak memeriksa `message.out`  🟢 RENDAH

- [ ] Tambahkan `if (!message.out) {return;}` di awal `execute`
- [ ] *Tertutup otomatis untuk `.eval` jika #1 dikerjakan; tetap perlu untuk `.exec`/`.sh`*

**File:** `src/userbot/handlers/system/exec.ts`

0 kemunculan `message.out` di file ini, sementara hampir semua handler lain
memeriksanya. Saat ini aman hanya karena `message.edit()` gagal duluan pada pesan
orang lain — kebetulan, bukan desain.

---

## 8. `restartUserbot()` tidak menyalakan ulang inline bot  🟢 RENDAH

- [ ] Samakan logika start/stop inline bot, atau ekstrak ke helper bersama

**File:** `src/userbot/engine/manager.ts:116–144`

`startUserbot()` memanggil `startInlineBotForUser` (`:79–84`) dan `stopUserbot()`
memanggil `stopInlineBotForUser` (`:103`), tapi `restartUserbot()` meng-inline
logika start/stop demi menghindari double-lock dan **melewatkan keduanya**.
Setelah restart, inline bot mati sampai userbot di-stop/start manual.

---

## 9. Data approval disimpan di file lokal, bukan DB  🟢 RENDAH

- [ ] Pindahkan ke DB utama, atau mount volume khusus + masukkan ke `BackupService`

**File:** `src/bot/state/approvedUsers.ts:12–15`

`approvals.json`, `approvals_meta.json`, `pending_approvals.json`, dan
`terms_accepted.json` ditulis ke `process.cwd()`.

Di Docker, `process.cwd()` = `/app`, sementara `docker-compose.yml:52–54` hanya
mem-mount `./logs:/app/logs` dan `deltauserjs_store_data:/app/data` — keempat
file itu **di luar volume**. Setiap `docker compose up -d --build` menghapus
seluruh data approval, pending, dan terms-accepted. Tidak ikut backup Mongo juga.

---

## 10. `.eval` tidak pernah meng-`await` hasilnya  🟢 RENDAH

- [ ] *Tertutup otomatis oleh #1 (hapus `.eval`)*

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

Setiap PR wajib hijau di: `npx tsc --noEmit`, 11 unit test, dan 60 E2E test.
Untuk #1 dan #2 tambahkan test regresi yang membuktikan jalur escape tertutup.

## Catatan environment

`npm install` gagal di environment bersih — dependency `tgcalls-js`
(`github:kotakbiasa/tgcalls-js`) mengembalikan 403. Untuk menjalankan test,
`tgcalls-js` perlu di-stub atau dijadikan `optionalDependencies` (kodenya sudah
memakai `await import()` dinamis di `vc.ts:58`). Test juga butuh `npm run build`
lebih dulu dan `BOT_TOKEN` terisi, jika tidak `customEmoji.test.js` akan crash.
