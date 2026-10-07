# Panduan Arsitektur & Manajemen Plugin DeltaUserJS (Untuk AI Agent & Developer)

Dokumen ini merupakan referensi resmi arsitektur sistem plugin DeltaUserJS, mencakup pemisahan modul Core vs Eksternal, repositori modul di Telegram Channel, Dynamic Loader, dan panduan membuat plugin baru.

---

## 1. Filosofi Modular & Pemisahan Plugin

Sebelumnya, seluruh modul ditaruh di dalam satu codebase monolith (`handlers/` lokal). Untuk menghemat resource, meminimalkan memory footprint, serta memungkinkan instalasi *on-demand* bagi pengguna, plugin dibagi menjadi dua tier:

```
src/userbot/handlers/
├── admin/                 # 🛡️ CORE / PERMANEN (Khusus manajemen & moderasi bot)
│   ├── blacklist.ts
│   ├── clearnotif.ts
│   ├── gcast.ts
│   ├── moderate.ts
│   └── warn.ts
├── system/
│   ├── ping.ts            # ⚡ CORE / PERMANEN (Uji latensi dasar)
│   └── pluginManager.ts   # 🧩 CORE / PERMANEN (Dynamic Installer .install/.uninstall/.plugins)
└── installed/             # 📂 DYNAMIC EXTENSIONS (Modul yang diunduh user di runtime)
    └── <nama_modul>.ts
```

### Aturan Batasan (Boundaries):
- **JANGAN PERNAH** menghapus folder `admin/`, `system/ping.ts`, atau `system/pluginManager.ts` dari repo lokal. Modul-modul ini adalah komponen inti.
- **Logika background non-handler** (seperti interval, broadcast scheduler, loop DB) **HARUS** ditaruh di `src/services/` (contoh: [src/services/loopService.ts](file:///c:/Users/Muhammad%20Nur%20Fauzan/Downloads/Project/DeltaUserJS/src/services/loopService.ts)), bukan di dalam handler plugin agar tidak memicu circular dependency saat modul dicopot.

---

## 2. Repositori Modul Telegram Channel (`@PluginList`)

Seluruh 54 modul opsional (kategori `group`, `system`, `tools`, `util`) diarsipkan dan didistribusikan melalui channel resmi:
- **Channel ID:** `-1004449247006`
- **Username:** [@PluginList](https://t.me/PluginList)
- **Format Pesan:**
  - 1 Pesan Dokumen Sumber (`.ts`) per modul.
  - Caption berisikan deskripsi rapi dengan `<blockquote expandable>` dan metadata lengkap.
  - Tombol interaktif Bot API 10.3 (`style: "success"` untuk tombol pasang instan).
  - Skrip pengunggah otomatis: [src/utils/channelUploader.ts](file:///c:/Users/Muhammad%20Nur%20Fauzan/Downloads/Project/DeltaUserJS/src/utils/channelUploader.ts).

---

## 3. Dynamic Plugin Loader (`pluginManager.ts`)

File handler: [src/userbot/handlers/system/pluginManager.ts](file:///c:/Users/Muhammad%20Nur%20Fauzan/Downloads/Project/DeltaUserJS/src/userbot/handlers/system/pluginManager.ts)

Sistem ini memungkinkan penambahan atau penghapusan handler secara realtime di runtime tanpa perlu me-restart proses Node.js atau PM2.

### Perintah Pengguna:
| Perintah | Deskripsi | Cara Kerja |
| :--- | :--- | :--- |
| `.install` *(Reply)* | Memasang modul dari file | Unduh media `.ts` dari pesan yang dibalas ➔ simpan ke `handlers/installed/` ➔ load via `loadSinglePlugin()` |
| `.install <nama>` | Memasang modul via nama | Mencari & mengunduh file modul dari repositori resmi ➔ load ke runtime |
| `.uninstall <nama>` | Mencopot modul | Melepas dari memory via `unregisterPlugin()` ➔ menghapus file di `handlers/installed/` |
| `.plugins` | Status modul aktif | Menampilkan daftar modul Core vs modul Installed |

### Fungsi Engine Inti:
1. **`loadSinglePlugin(filePath)`** ([src/userbot/engine/pluginLoader.ts](file:///c:/Users/Muhammad%20Nur%20Fauzan/Downloads/Project/DeltaUserJS/src/userbot/engine/pluginLoader.ts)):
   - Mengimpor file secara dinamis dengan URL cache-busting `?v=${Date.now()}`.
   - Memvalidasi schema plugin (`name`, `execute`, `help`).
   - Mendaftarkan command ke dispatcher O(1).
2. **`unregisterPlugin(name)`** ([src/userbot/engine/pluginRegistry.ts](file:///c:/Users/Muhammad%20Nur%20Fauzan/Downloads/Project/DeltaUserJS/src/userbot/engine/pluginRegistry.ts)):
   - Melepaskan handler dari array `loadedPlugins` dan Map `pluginByCommand`.

---

## 4. Standar Penulisan Plugin Baru

Setiap plugin baru **WAJIB** mengikuti kontrak antarmuka `Plugin`:

```typescript
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { getCustomEmoji } from '../../../utils/customEmoji.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';

export default {
  name: 'nama_modul', // Huruf kecil, tanpa spasi
  commands: ['cmd1', 'cmd2'], // Command tanpa titik prefix
  help: {
    title: 'Judul Modul (.cmd1)',
    description: 'Deskripsi singkat mengenai fungsi modul.',
    usage: '• `.cmd1 <argumen>`',
    detail: 'Rincian penjelasan mendalam (opsional).'
  },
  async execute(
    client: CompatClient,
    message: UserbotMessageLike,
    settings: UserbotSettings,
    telegramId: number
  ) {
    // 1. Validasi pesan keluar (hanya respon pesan akun userbot sendiri)
    if (!message.out || !message.message) return;

    const text = message.message.trim();
    if (!text.toLowerCase().startsWith('.cmd1')) return;

    try {
      const loadingEmoji = getCustomEmoji(settings, 'loading');
      await message.edit({
        text: `<blockquote>${loadingEmoji} Memproses...</blockquote>`,
        parseMode: 'html'
      });

      // Logika modul di sini...

      const successEmoji = getCustomEmoji(settings, 'check');
      await message.edit({
        text: `<b>${successEmoji} Selesai!</b>`,
        parseMode: 'html'
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in nama_modul: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    }
  }
};
```

---

## 5. Checklist AI Agent untuk Tugas Plugin

Jika user meminta bantuan terkait plugin di masa mendatang, ikuti checklist berikut:

- [ ] **Apakah modul masuk kategori Core?** Jika fitur admin atau dasar bot, tempatkan di `src/userbot/handlers/admin/` atau `src/userbot/handlers/system/`.
- [ ] **Apakah modul merupakan modul opsional/ekstensi?** Tempatkan di `src/userbot/handlers/installed/` atau unggah ke channel `@PluginList` via [channelUploader.ts](file:///c:/Users/Muhammad%20Nur%20Fauzan/Downloads/Project/DeltaUserJS/src/utils/channelUploader.ts).
- [ ] **Apakah ada logic background atau shared state?** Pisahkan shared state ke `src/services/` agar tidak terjadi error jika file handler tidak ada.
- [ ] **Verifikasi Tipe:** Selalu jalankan `node ./node_modules/typescript/bin/tsc --noEmit` untuk memastikan tidak ada kesalahan tipe sebelum menyelesaikannya.
