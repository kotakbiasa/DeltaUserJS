# 🛠️ Development Cheat Sheet (Buku Pintar DeltaUserJS)

Dokumen ini berisi kumpulan **kode pembantu (snippets)** dan **panduan cepat** agar Anda **tidak perlu repot mencari di Google/Web** setiap kali ingin membuat fitur baru atau memanggil API. Cukup salin dan tempel (Copas) dari sini!

---

## 1. 🌐 Mengambil Data dari Web / API (GET Request)
Jika Anda ingin mengambil data JSON dari API terbuka (seperti jadwal sholat, cuaca, atau anilist).

```javascript
// Contoh mengambil data JSON
async function fetchApi(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Gagal mengambil data:", error.message);
    return null;
  }
}

// Cara Penggunaan:
// const cuaca = await fetchApi('https://api.cuaca.com/jakarta');
// console.log(cuaca);
```

## 2. 📤 Mengirim Data ke Web / API (POST Request)
Digunakan saat API meminta Anda mengirim data (misalnya GraphQL seperti Anilist, atau API Login).

```javascript
// Contoh POST Request dengan JSON
async function postApi(url, bodyData) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData) // Mengubah object JS jadi JSON String
    });
    
    return await response.json();
  } catch (error) {
    console.error("Gagal mengirim POST:", error.message);
    return null;
  }
}
```

## 3. 🔍 Scraping Teks / Menemukan Teks Spesifik (Regex)
Banyak kasus di mana Anda harus mengekstrak sebuah tautan atau angka dari pesan. Anda tidak perlu mencari rumus di web, gunakan ini:

```javascript
const teks = "Halo, silahkan kunjungi https://google.com atau hubungi 08123456789";

// 1. Mengambil URL dari Teks
const urlMatch = teks.match(/(https?:\/\/[^\s]+)/g);
// Hasil: ['https://google.com']

// 2. Mengambil Angka saja dari Teks (contoh untuk ID Telegram)
const angkaMatch = teks.match(/\d+/g);
// Hasil: ['08123456789']

// 3. Menghapus semua tag HTML dari Teks
const textTanpaHtml = "<p>Halo <b>Dunia</b></p>".replace(/<[^>]+>/g, '');
// Hasil: 'Halo Dunia'
```

## 4. ⏳ Memberikan Jeda Waktu (Sleep / Delay)
JavaScript tidak memiliki fungsi `sleep()` bawaan. Gunakan fungsi pembantu ini untuk menunda eksekusi kode (sangat berguna untuk fitur Anti-Spam atau Broadcast).

```javascript
// Fungsi Helper Delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cara Penggunaan:
// await ctx.reply("Pesan 1");
// await sleep(3000); // Jeda 3 detik
// await ctx.reply("Pesan 2");
```

## 5. 🗂️ Memformat Waktu/Durasi agar Enak Dibaca
Mengubah angka *millisecond* menjadi format Hari, Jam, Menit, Detik.

```javascript
function formatWaktu(ms) {
  const detik = Math.floor((ms / 1000) % 60);
  const menit = Math.floor((ms / (1000 * 60)) % 60);
  const jam = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const hari = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  let str = '';
  if (hari > 0) str += `${hari}h `;
  if (jam > 0) str += `${jam}j `;
  if (menit > 0) str += `${menit}m `;
  str += `${detik}d`;
  
  return str.trim();
}

// Hasil: formatWaktu(125000) -> "2m 5d"
```

## 6. 🖼️ Daftar Tautan (Referensi) Penting
Simpan tautan ini, jangan sampai hilang saat Anda kebingungan mencari *library* Node.js atau API Telegram:

1. **Telegram Bot API Resmi**: [https://core.telegram.org/bots/api](https://core.telegram.org/bots/api)
2. **Panduan grammY (Bahasa Indonesia)**: [https://grammy.dev/id/](https://grammy.dev/id/)
3. **GramJS (Core Userbot)**: [https://painor.gitbook.io/gramjs/](https://painor.gitbook.io/gramjs/)
4. **RegEx101 (Untuk mengetes Regex)**: [https://regex101.com](https://regex101.com)
5. **JSON Formatter (Biar JSON enak dibaca)**: [https://jsonformatter.org](https://jsonformatter.org)
