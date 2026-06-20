# 📚 Telegram Bot API & grammY Documentation Reference

Dokumen ini adalah ringkasan dari sejarah versi **Telegram Bot API (dari terbaru ke terlama)** dan panduan ringkas penggunaan *framework* **grammY** untuk referensi pemrograman bot Anda.

---

## 📅 Bagian 1: Sejarah Telegram Bot API (Terbaru ke Terlama)

Telegram secara rutin memperbarui API Bot mereka. Berikut adalah fitur-fitur penting yang dirilis pada setiap versi besarnya:

### Bot API 10.x (2026) - *Era Rich Messages & Guest Mode*
- **Bot API 10.1**: Pengenalan **Rich Messages**. Mendukung pemformatan teks tingkat lanjut dan balasan buatan AI dengan dukungan kelas `RichText*` (seperti `RichTextBold`, `RichTextMathematicalExpression`) dan `RichBlock*` (seperti `RichBlockSlideshow`, `RichBlockCollage`).
- **Bot API 10.0**: Pengenalan **Guest Mode**. Bot kini dapat menerima kueri pesan spesifik dan membalas di dalam grup/chat meskipun bot tersebut *bukan* anggota grup (menggunakan `answerGuestQuery` dan objek `SentGuestMessage`).

### Bot API 9.x (2025) - *Era Mini Apps Storage*
- **Bot API 9.0**: Peluncuran fitur `DeviceStorage` dan `SecureStorage` untuk *Mini Apps*, memungkinkan bot menyimpan data lokal secara persisten dan mengamankan data sensitif pengguna.

### Bot API 8.x (2024) - *Era Ekspansi Mini Apps & Langganan Stars*
- **Bot API 8.0**: Pembaruan besar untuk fitur monetisasi dan Mini Apps. Mengizinkan *Mini Apps* berjalan di mode **Full-Screen** (`requestFullscreen`), bisa ditambahkan ke *Homescreen* HP pengguna, dan dukungan pembayaran langganan berkala menggunakan **Telegram Stars**. Fitur pelacakan sensor gerak dan kustomisasi layar *loading* juga diperkenalkan.

### Bot API 7.x (2023 - 2024) - *Era Bisnis & Monetisasi Awal*
- **Bot API 7.10+**: Dukungan untuk **Telegram Business** (Bot dapat membalas chat atas nama akun pengguna Telegram Business). Dukungan **Telegram Stars** untuk pembayaran layanan digital.
- **Bot API 7.6+**: Pengenalan **Reaction** (Bot dapat memberikan *react* emoji ke pesan). Dukungan untuk **Quotes** (membalas potongan spesifik dari sebuah pesan).
- **Bot API 7.4**: Dukungan Telegram Giveaways.
- **Bot API 7.0**: Pembaruan besar untuk *Reply Parameters*, menambahkan kemampuan untuk membalas pesan di chat lain secara *seamless*.

### Bot API 6.x (2022 - 2023) - *Era Web Apps & Forum*
- **Bot API 6.4 - 6.8**: Pengenalan **Topics/Forum** di dalam grup super (Dukungan `message_thread_id`).
- **Bot API 6.0**: Peluncuran **Telegram Web Apps (TWA)** (Mini-apps dengan antarmuka web penuh yang dijalankan di dalam Telegram). Dukungan *Attachment Menu* untuk bot.

### Bot API 5.x (2020 - 2021) - *Era Privasi & Manajemen Grup*
- **Bot API 5.5**: Peluncuran fitur **Protect Content** (mencegah pesan/media di-*forward* atau di-*screenshot*).
- **Bot API 5.4**: Dukungan *Chat Join Requests* (Bot bisa menerima atau menolak permintaan masuk ke grup private).
- **Bot API 5.0**: Bot diizinkan menjalankan server lokal mereka sendiri (*Local Bot API Server*) untuk batas *upload* media yang lebih besar (hingga 2GB).

### Bot API 4.x (2018 - 2020) - *Era Stiker Animasi & Polling*
- **Bot API 4.7 - 4.9**: Pengenalan *Dice* (Dadu acak) dan *Animated Stickers* (Format `.tgs`).
- **Bot API 4.0 - 4.2**: Pengenalan **Polls** (Kuis dan Polling). Dukungan *Telegram Passport* untuk verifikasi identitas (KYC).

### Bot API 3.x (2017 - 2018) - *Era Multimedia Lengkap*
- **Bot API 3.5**: Pengenalan *Media Groups* (Mengirim album foto/video sekaligus).
- **Bot API 3.0**: Pengenalan **Video Messages** (*Round video* / Telescope) dan **Live Locations** (Berbagi lokasi secara *real-time*).

### Bot API 2.x (2016) - *Era Revolusi Interaktif*
- **Bot API 2.0 - 2.1**: **Pembaruan Paling Revolusioner!** Pengenalan **Inline Keyboards**, **Callback Queries** (Tombol interaktif tanpa pesan baru), dan **Inline Bots** (`@BotName query`). 

### Bot API 1.x (2015) - *Generasi Pertama*
- **Bot API 1.0**: Rilis awal! Fitur masih terbatas pada pengiriman pesan teks dasar, *Custom Keyboards* (Reply Keyboard), serta pengiriman foto/dokumen standar.

---

## 🐹 Bagian 2: Panduan Cepat (Cheat Sheet) grammY

**grammY** adalah *framework* modern untuk Node.js dan Deno yang ditulis menggunakan TypeScript. Ia sangat cepat dan mendukung *middleware* layaknya Express.js.

### 1. Inisialisasi & Basic Middleware
```javascript
import { Bot } from "grammy";

const bot = new Bot("TOKEN_ANDA_DI_SINI");

// Middleware Global (Akan dijalankan di setiap pesan)
bot.use(async (ctx, next) => {
  console.log(`Pesan masuk dari: ${ctx.from.first_name}`);
  await next(); // Lanjut ke handler berikutnya
});
```

### 2. Menangani Teks & Perintah (Commands)
```javascript
// Menangani perintah /start
bot.command("start", async (ctx) => {
  await ctx.reply("Halo! Saya adalah bot grammY.");
});

// Menangani teks biasa atau regex
bot.hears(/halo|hai/i, async (ctx) => {
  await ctx.reply("Hai juga!");
});

// Menangani tipe pesan tertentu
bot.on("message:photo", async (ctx) => {
  await ctx.reply("Bagus fotonya!");
});
```

### 3. Keyboards (Tombol)

**Inline Keyboard (Tombol Transparan di bawah pesan):**
```javascript
import { InlineKeyboard } from "grammy";

const inlineMenu = new InlineKeyboard()
  .text("Klik Saya!", "klik_tombol").row()
  .url("Kunjungi Website", "https://grammy.dev");

bot.command("menu", async (ctx) => {
  await ctx.reply("Pilih menu:", { reply_markup: inlineMenu });
});

// Menangkap event ketika tombol diklik
bot.callbackQuery("klik_tombol", async (ctx) => {
  await ctx.answerCallbackQuery("Tombol berhasil diklik!");
  await ctx.editMessageText("Anda telah mengklik tombol tersebut.");
});
```

**Reply Keyboard (Tombol pengganti Keyboard HP):**
```javascript
import { Keyboard } from "grammy";

const replyMenu = new Keyboard()
  .text("Opsi 1").text("Opsi 2").row()
  .text("Opsi 3").resized().oneTime();

bot.command("pilih", async (ctx) => {
  await ctx.reply("Silakan pilih opsi:", { reply_markup: replyMenu });
});
```

### 4. Plugin Favorit: Conversations
Banyak bot yang butuh mode *tanya-jawab* terstruktur. grammY menyediakannya secara *native* lewat modul `@grammyjs/conversations`.

```javascript
import { conversations, createConversation } from "@grammyjs/conversations";

// 1. Definisikan percakapan
async function registerForm(conversation, ctx) {
  await ctx.reply("Siapa nama Anda?");
  const nameCtx = await conversation.wait(); // Tunggu balasan user
  const nama = nameCtx.message.text;

  await ctx.reply(`Berapa umur Anda, ${nama}?`);
  const ageCtx = await conversation.wait();
  
  await ctx.reply(`Data tersimpan: ${nama}, ${ageCtx.message.text} tahun.`);
}

// 2. Gunakan plugin
bot.use(conversations());
bot.use(createConversation(registerForm, "form_daftar"));

// 3. Panggil percakapan
bot.command("daftar", async (ctx) => {
  await ctx.conversation.enter("form_daftar");
});
```

### 5. Error Handling
Sangat penting untuk menangkap *error* di grammY agar bot tidak *crash*.

```javascript
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  console.error("Unknown error:", e);
});
```
