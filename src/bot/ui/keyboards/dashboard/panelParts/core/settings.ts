/**
 * Panel pengaturan, prefix, inline helper, dan diagnostik.
 *
 * Dipecah dari panelParts/core.ts (721 baris). Tampilan modern, bersih,
 * dan optimal untuk layar mobile Telegram.
 */
import { getDisabledPlugins, getUserbotSession } from '../../../../../../infrastructure/database.js';
import userbotManager from '../../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../../utils/richMessage.js';
import { badge } from '../../shared.js';
import type { BotContext } from '../../../../../context.js';

export function panelSettings(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const afkReason = session?.afk_reason || 'AFK (default)';
  const currentPrefix = session?.vars?.PREFIX || '.';
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;
  const botName = session?.custom_name || ctx.me?.first_name || 'Userbot';
  const helperUser = session?.inline_bot_username ? `@${escapeHtml(String(session.inline_bot_username))}` : '<i>Belum diset</i>';

  return `<h1>⚙️ Pengaturan &amp; Keamanan</h1>` +
    `<blockquote><b>Pusat Pengaturan Preferensi</b><br/>Atur preferensi keamanan, identitas bot, dan respons otomatis akun Anda.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th align="center">Nilai / Status</th></tr>` +
    `<tr><td>💬 Prefix Perintah</td><td align="center"><code>${escapeHtml(currentPrefix)}</code></td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM</td><td align="center">${badge(isAntiPm, '🟢 Aktif (ON)', '🔴 Nonaktif (OFF)')}</td></tr>` +
    `<tr><td>💤 Auto-Reply AFK</td><td align="center">${badge(isAfk, '🟢 Aktif (ON)', '🔴 Nonaktif (OFF)')}</td></tr>` +
    `<tr><td>🏷️ Nama Bot</td><td align="center"><b>${escapeHtml(botName)}</b></td></tr>` +
    `<tr><td>🤖 Inline Helper</td><td align="center">${helperUser}</td></tr>` +
    `<tr><td>📦 Database Sesi</td><td align="center">${session ? '🟢 Tersimpan (MongoDB)' : '🔴 Kosong'}</td></tr>` +
    `</table>` +
    `<details><summary><b>📝 Pesan AFK &amp; Keamanan Sesi</b></summary>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th align="center">Keterangan</th></tr>` +
    `<tr><td>Pesan AFK</td><td align="center"><code>${escapeHtml(afkReason)}</code></td></tr>` +
    `<tr><td>Keamanan</td><td>String sesi dienkripsi dengan AES-256. Gunakan tombol Hapus Sesi Akun di bawah untuk logout total.</td></tr>` +
    `</table>` +
    `</details>` +
    `<footer>Gunakan tombol keyboard di bawah untuk mengatur atau mengubah nilai:</footer>`;
}

export function panelPrefixPicker(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const currentPrefix = session?.vars?.PREFIX || '.';
  return `<h1>💬 Ganti Prefix Perintah</h1>` +
    `<blockquote>Prefix aktif saat ini: <code>${escapeHtml(currentPrefix)}</code><br/>` +
    `Pilih salah satu simbol prefix di tombol bawah untuk mengubahnya secara instan:</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Simbol</th><th align="center">Contoh</th><th align="center">Tipe</th></tr>` +
    `<tr><td><code>.</code> (Titik)</td><td align="center"><code>.ping</code>, <code>.alive</code></td><td align="center">Standar (Default)</td></tr>` +
    `<tr><td><code>!</code> (Seru)</td><td align="center"><code>!ping</code>, <code>!alive</code></td><td align="center">Populer</td></tr>` +
    `<tr><td><code>,</code> (Koma)</td><td align="center"><code>,ping</code>, <code>,alive</code></td><td align="center">Mudah</td></tr>` +
    `<tr><td><code>#</code> (Pagar)</td><td align="center"><code>#ping</code>, <code>#alive</code></td><td align="center">Alternatif</td></tr>` +
    `<tr><td><code>?</code> (Tanya)</td><td align="center"><code>?ping</code>, <code>?alive</code></td><td align="center">Alternatif</td></tr>` +
    `<tr><td><code>~</code> (Tilde)</td><td align="center"><code>~ping</code>, <code>~alive</code></td><td align="center">Alternatif</td></tr>` +
    `</table>` +
    `<footer>Ketuk tombol simbol di bawah untuk mengganti prefix.</footer>`;
}

export function panelInlineHelper(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const botUser = session?.inline_bot_username;
  return `<h1>🤖 Setup Inline Helper Bot</h1>` +
    `<blockquote>Inline Helper Bot memungkinkan perintah <code>.help</code> di obrolan mana pun memunculkan tombol menu interaktif.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th align="center">Status</th></tr>` +
    `<tr><td>Status Helper</td><td align="center">${botUser ? `🟢 Terpasang (@${escapeHtml(botUser)})` : '🔴 Belum Terpasang'}</td></tr>` +
    `<tr><td>Metode Pemasangan</td><td align="center">Via @BotFather (HTTP API)</td></tr>` +
    `</table>` +
    `<details><summary><b>📝 Cara Mendapatkan Token Bot Father</b></summary>` +
    `<ol>` +
    `<li>Buka @BotFather di Telegram.</li>` +
    `<li>Kirim perintah <code>/newbot</code> dan ikuti instruksi (beri nama &amp; username berakhiran 'bot').</li>` +
    `<li>Kirim perintah <code>/setinline</code> ke @BotFather lalu pilih bot Anda.</li>` +
    `<li>Salin <b>HTTP API Token</b> yang diberikan @BotFather.</li>` +
    `<li>Ketuk tombol <b>🔑 Masukkan Token Bot</b> di bawah untuk menyimpannya.</li>` +
    `</ol>` +
    `</details>` +
    `<footer>Helper bot hanya digunakan untuk merender menu bantuan inline.</footer>`;
}

export async function panelUserbotDiag(ctx: BotContext) {
  const telegramId = ctx.from.id;
  const session = getUserbotSession(telegramId);
  const isRunning = userbotManager.isRunning(telegramId);
  const ubot = userbotManager.clients.get(telegramId);

  let pingMs = -1;
  let dcId = '—';
  let connected = false;

  if (isRunning && ubot && ubot.client) {
    connected = Boolean(ubot.isConnected());
    const primaryDc = await ubot.getDcId();
    if (primaryDc) {dcId = String(primaryDc);}
    try {
      const start = Date.now();
      if (typeof ubot.client.call === 'function') {
        const res = await ubot.client.call({ _: 'help.getNearestDc' });
        if (!primaryDc) {dcId = String(res?.thisDc ?? res?.nearestDc ?? '—');}
      } else if (typeof ubot.client.invoke === 'function') {
        await ubot.client.invoke({ _: 'help.getNearestDc' });
      }
      pingMs = Date.now() - start;
    } catch (_) {
      pingMs = -1;
    }
  }

  const disabledCount = getDisabledPlugins(telegramId).length;
  const activeCount = Math.max(0, loadedPlugins.length - disabledCount);
  const flood = userbotManager.getFloodStatus(telegramId);

  const floodInfo = flood.inCooldown
    ? `<blockquote>⚠️ <b>Peringatan FloodWait Telegram</b><br/>Akun Anda sedang dalam masa pendinginan aman sebesar <b>${flood.secondsLeft} detik</b>. DeltaUserJS otomatis menahan seluruh aktivitas perintah keluar agar akun tidak terkena batasan banned.</blockquote>`
    : '';

  return `<h1>🩺 Diagnostik &amp; Latensi MTProto</h1>` +
    floodInfo +
    `<blockquote>Hasil pengujian langsung soket MTProto Telegram dan status runtime engine.</blockquote>` +
    `<table bordered striped>` +
    `<tr><th>Parameter Uji</th><th align="center">Hasil / Status</th></tr>` +
    `<tr><td>⚡ Status Client</td><td align="center">${isRunning ? (connected ? '🟢 Online &amp; Terhubung' : '🟡 Menghubungkan...') : '🔴 Offline / Mati'}</td></tr>` +
    `<tr><td>📡 Latensi Telegram DC</td><td align="center">${pingMs > 0 ? `<b>${pingMs} ms</b>` : (isRunning ? '🟡 Mengukur...' : '🔴 N/A')}</td></tr>` +
    `<tr><td>🌐 Server Datacenter</td><td align="center">Telegram DC ${dcId} (mtcute)</td></tr>` +
    `<tr><td>🛡️ FloodWait Guard</td><td align="center">${flood.inCooldown ? `⏳ Hibernasi (${flood.secondsLeft}s)` : '🟢 Normal (Siap)'}</td></tr>` +
    `<tr><td>🧩 Modul Aktif</td><td align="center">🟢 ${activeCount} / ${loadedPlugins.length} Plugin</td></tr>` +
    `<tr><td>🛡️ Filter Anti-PM</td><td align="center">${session?.anti_pm === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td></tr>` +
    `<tr><td>🤖 Auto-Reply AFK</td><td align="center">${session?.auto_reply === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td></tr>` +
    `</table>` +
    `<details><summary><b>💡 Panduan Indikator Latensi Jaringan</b></summary>` +
    `<table bordered striped>` +
    `<tr><th>Rentang Ping</th><th align="center">Kondisi Jaringan</th></tr>` +
    `<tr><td>&lt; 50 ms</td><td align="center">🟢 Sangat Cepat (Respon bot instan)</td></tr>` +
    `<tr><td>50 - 150 ms</td><td align="center">🟡 Normal (Kecepatan standar jaringan MTProto)</td></tr>` +
    `<tr><td>&gt; 200 ms</td><td align="center">🔴 Lambat (Beban jaringan atau antrean DC)</td></tr>` +
    `</table>` +
    `</details>` +
    (isRunning
      ? `<footer>✅ Koneksi userbot berjalan lancar dan siap mengeksekusi perintah.</footer>`
      : `<footer>⚠️ Userbot sedang mati. Gunakan tombol Hidupkan Userbot di bawah.</footer>`);
}
