/**
 * Panel pengaturan, prefix, inline helper, dan diagnostik.
 *
 * Dipecah dari panelParts/core.ts (721 baris). Isi tiap fungsi dipindahkan
 * apa adanya; yang berubah hanya di file mana ia tinggal.
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

  const antiPmBtn = `<tg-button type="callback_data" data="rich:toggle_anti_pm">${isAntiPm ? '🔴 Matikan' : '🟢 Aktifkan'}</tg-button>`;
  const afkBtn = `<tg-button type="callback_data" data="rich:toggle_afk">${isAfk ? '🔴 Matikan' : '🟢 Aktifkan'}</tg-button>`;
  const prefixBtn = `<tg-button type="callback_data" data="rich:pick_prefix">✏️ Ubah</tg-button>`;
  const nameBtn = `<tg-button type="callback_data" data="rich:edit_name">✏️ Ganti</tg-button>`;
  const afkReasonBtn = `<tg-button type="callback_data" data="rich:edit_afk">✏️ Edit</tg-button>`;
  const helperBtn = `<tg-button type="callback_data" data="rich:setup_helper">⚙️ Setup</tg-button>`;

  return `<h1 align="center">⚙️ Pengaturan &amp; Keamanan <sup>SYSTEM</sup></h1>` +
    `<p>Atur preferensi keamanan, identitas bot, dan respons otomatis akun Anda.</p>` +
    `<table bordered striped><caption>🛠️ Konfigurasi Fitur Akun</caption>` +
    `<tr><th>Pengaturan</th><th>Nilai / Status</th><th align="center">Aksi Cepat</th></tr>` +
    `<tr><td>💬 Prefix Perintah</td><td><code>${escapeHtml(currentPrefix)}</code></td><td align="center">${prefixBtn}</td></tr>` +
    `<tr><td>🛡️ Proteksi Anti-PM</td><td>${badge(isAntiPm, '🟢 ON', '🔴 OFF')}</td><td align="center">${antiPmBtn}</td></tr>` +
    `<tr><td>💤 Mode AFK Auto</td><td>${badge(isAfk, '🟢 ON', '🔴 OFF')}</td><td align="center">${afkBtn}</td></tr>` +
    `<tr><td>🏷️ Nama Kustom Bot</td><td><b>${escapeHtml(botName)}</b></td><td align="center">${nameBtn}</td></tr>` +
    `<tr><td>📝 Pesan Balasan AFK</td><td><tg-spoiler><code>${escapeHtml(afkReason)}</code></tg-spoiler></td><td align="center">${afkReasonBtn}</td></tr>` +
    `<tr><td>🤖 Inline Helper</td><td>${helperUser}</td><td align="center">${helperBtn}</td></tr>` +
    `<tr><td>📦 Database Sesi</td><td>${session ? '🟢 Tersimpan' : '🔴 Kosong'}</td><td align="center">MongoDB</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>⚠️ Keamanan Sesi Telegram:</h3>` +
    `<p>String sesi akun Anda disimpan aman di database MongoDB. Jika Anda menduga ada aktivitas mencurigakan, gunakan tombol <b>🗑️ Hapus Sesi Akun</b> untuk logout secara permanen dari server.</p>` +
    `<footer>Ketuk tombol di tabel atau gunakan tombol di bawah untuk setelan lanjutan.</footer>`;
}

export function panelPrefixPicker(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const currentPrefix = session?.vars?.PREFIX || '.';
  return `<h1 align="center">💬 Ganti Prefix Perintah <sup>CONFIG</sup></h1>` +
    `<p>Prefix saat ini: <code>${escapeHtml(currentPrefix)}</code><br>` +
    `Pilih salah satu simbol prefix di bawah untuk mengubah prefix perintah userbot Anda:</p>` +
    `<table bordered striped>` +
    `<tr><th>Simbol</th><th>Contoh Perintah</th><th>Keterangan</th></tr>` +
    `<tr><td><code>.</code> (Titik)</td><td><code>.ping</code>, <code>.alive</code></td><td>Standar (Default)</td></tr>` +
    `<tr><td><code>!</code> (Seru)</td><td><code>!ping</code>, <code>!alive</code></td><td>Populer</td></tr>` +
    `<tr><td><code>,</code> (Koma)</td><td><code>,ping</code>, <code>,alive</code></td><td>Mudah (Mudah)</td></tr>` +
    `<tr><td><code>#</code> (Pagar)</td><td><code>#ping</code>, <code>#alive</code></td><td>Alternatif</td></tr>` +
    `<tr><td><code>?</code> (Tanya)</td><td><code>?ping</code>, <code>?alive</code></td><td>Alternatif</td></tr>` +
    `<tr><td><code>~</code> (Tilde)</td><td><code>~ping</code>, <code>~alive</code></td><td>Alternatif</td></tr>` +
    `</table>` +
    `<footer>Ketuk tombol prefix di bawah untuk langsung mengganti.</footer>`;
}

export function panelInlineHelper(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const botUser = session?.inline_bot_username;
  return `<h1 align="center">🤖 Setup Inline Helper Bot <sup>BOTFATHER</sup></h1>` +
    `<p>Inline Helper Bot memungkinkan perintah <code>.help</code> di obrolan mana pun memunculkan tombol menu interaktif.</p>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th>Status</th></tr>` +
    `<tr><td>Status Helper</td><td align="center">${botUser ? `🟢 Terpasang (@${escapeHtml(botUser)})` : '🔴 Belum Terpasang'}</td></tr>` +
    `<tr><td>Metode Pemasangan</td><td align="center">Via @BotFather (HTTP API)</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>📝 Cara Mendapatkan Token Bot:</h3>` +
    `<ol>` +
    `<li>Buka @BotFather di Telegram.</li>` +
    `<li>Kirim perintah <code>/newbot</code> dan ikuti instruksi (beri nama &amp; username akhiran 'bot').</li>` +
    `<li>Kirim perintah <code>/setinline</code> ke @BotFather lalu pilih bot Anda.</li>` +
    `<li>Salin <b>HTTP API Token</b> yang diberikan @BotFather.</li>` +
    `<li>Ketuk tombol <b>🔑 Masukkan Token Bot</b> di bawah untuk menyimpannya.</li>` +
    `</ol>` +
    `<footer>Helper bot hanya digunakan untuk merender menu bantuan inline.</footer>`;
}

export async function panelUserbotDiag(ctx: BotContext) {
  const telegramId = ctx.from.id;
  const session = getUserbotSession(telegramId);
  const isRunning = userbotManager.isRunning(telegramId);
  const ubot = userbotManager.clients.get(telegramId);

  let pingMs = -1;
  let dcId = '4';
  let connected = false;

  if (isRunning && ubot && ubot.client) {
    connected = Boolean(ubot.isActive || ubot.client.connected);
    try {
      const start = Date.now();
      if (typeof ubot.client.call === 'function') {
        const res = await ubot.client.call({ _: 'help.getNearestDc' });
        dcId = String(res?.nearestDc || res?.thisDc || '4');
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

  const retryBtn = `<tg-button type="callback_data" data="rich:ubot_diag">🔄 Uji Ulang</tg-button>`;
  const backUbotBtn = `<tg-button type="callback_data" data="rich:ubot">🤖 Dashboard</tg-button>`;

  const floodInfo = flood.inCooldown
    ? `<h3>⚠️ Peringatan FloodWait Telegram:</h3>` +
      `<p>Akun Anda saat ini sedang dalam masa pendinginan aman sebesar <b>${flood.secondsLeft} detik</b>. DeltaUbotJS otomatis menahan seluruh aktivitas perintah keluar agar akun tidak terkena batasan banned dari Telegram. Sistem akan kembali normal secara otomatis begitu hitungan mundur selesai.</p><hr/>`
    : '';

  return `<h1 align="center">🩺 Diagnostik &amp; Latensi MTProto <sup>v2.4</sup></h1>` +
    floodInfo +
    `<p>Hasil pengujian langsung soket MTProto Telegram dan status runtime engine.</p>` +
    `<table bordered striped><caption>📊 Hasil Pengujian Real-Time</caption>` +
    `<tr><th>Parameter Uji</th><th>Hasil / Nilai</th><th align="center">Aksi</th></tr>` +
    `<tr><td>⚡ Status Client</td><td>${isRunning ? (connected ? '🟢 Online &amp; Terhubung' : '🟡 Menghubungkan...') : '🔴 Offline / Mati'}</td><td align="center">${retryBtn}</td></tr>` +
    `<tr><td>📡 Latensi Telegram DC</td><td>${pingMs > 0 ? `<b>${pingMs} ms</b>` : (isRunning ? '🟡 Mengukur...' : '🔴 N/A')}</td><td align="center">Layer 229</td></tr>` +
    `<tr><td>🌐 Server Datacenter</td><td>Telegram DC ${dcId}</td><td align="center">mtcute</td></tr>` +
    `<tr><td>🛡️ FloodWait Guard</td><td>${flood.inCooldown ? `⏳ Hibernasi (${flood.secondsLeft}s)` : '🟢 Normal'}</td><td align="center">Proteksi</td></tr>` +
    `<tr><td>🧩 Modul Aktif</td><td>🟢 ${activeCount} / ${loadedPlugins.length} Plugin</td><td align="center">${backUbotBtn}</td></tr>` +
    `<tr><td>🛡️ Filter Anti-PM</td><td>${session?.anti_pm === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td><td align="center">Spam Shield</td></tr>` +
    `<tr><td>🤖 Auto-Reply AFK</td><td>${session?.auto_reply === 1 ? '🟢 Aktif' : '🔴 Nonaktif'}</td><td align="center">Auto-Reply</td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Panduan Indikator Latensi:</h3>` +
    `<ul>` +
    `<li><b>&lt; 50 ms</b>: Sangat Cepat (Respon bot instan)</li>` +
    `<li><b>50 - 150 ms</b>: Normal (Kecepatan standar jaringan MTProto Telegram)</li>` +
    `<li><b>&gt; 200 ms</b>: Lambat (Beban jaringan atau antrean di Datacenter Telegram)</li>` +
    `</ul>` +
    (isRunning
      ? `<footer>✅ Koneksi userbot berjalan lancar dan siap mengeksekusi perintah secara instan.</footer>`
      : `<footer>⚠️ Userbot sedang mati. Gunakan tombol Hidupkan Userbot di bawah untuk menyalakan.</footer>`);
}
