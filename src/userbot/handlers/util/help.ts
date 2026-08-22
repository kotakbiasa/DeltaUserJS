import { helpRegistry } from '../../engine/pluginRegistry.js';
import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { getUserbotSession } from '../../../services/UserbotService.js';
import { Api, Rich } from 'teleproto';
import config from '../../../config.js';
import { buildModuleHtml } from '../../../bot/handlers/inlineHelp.js';
import { getMasterBotUsername } from '../../../bot/state/botUsername.js';

/**
 * Bangun InputReplyToMessage untuk forum topic — memastikan pesan bot
 * masuk ke topic yang sama dengan .help, bukan main topic.
 */
function buildReplyToTopic(message) {
  try {
    const header = message.replyTo;
    if (header) {
      const topId = header.replyToTopId || header.replyToMsgId;
      const replyToMsgId = header.replyToMsgId || message.id;
      if (topId) {
        return new Api.InputReplyToMessage({
          replyToMsgId: replyToMsgId,
          topMsgId: topId,
        });
      }
    }
    // Message ada di topic tapi replyTo kosong — reply ke pesan asli
    if (message.peerId?.className === 'PeerChannel' && message.message) {
      const msgId = message.id;
      return new Api.InputReplyToMessage({
        replyToMsgId: msgId,
        topMsgId: msgId, // topic message = pesan asli .help
      });
    }
    return undefined;
  } catch (_e) {
    return undefined;
  }
}

/**
 * Format nama modul agar rapi
 */
function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') {return 'AntiPM';}
  if (name.length <= 3) {return name.toUpperCase();}
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Strip HTML tags untuk preview singkat
 */
function stripHtml(text) {
  return String(text ?? '').replace(/<[^>]+>/g, '');
}

/**
 * Konversi Markdown sederhana ke HTML
 */
function markdownToHtml(text) {
  if (!text) {return '';}
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

// ============================================================
// HELP MENU — Inline Keyboard via Master Bot
// ============================================================
//
// CATATAN PENTING: Userbot (akun user) TIDAK BISA menampilkan
// inline keyboard — parameter `buttons` di teleproto hanya bekerja
// untuk akun BOT. Jadi alurnya:
//   1. User ketik `.help` di chat userbot
//   2. Userbot kirim request "help_ubot" ke Master Bot (via DM)
//   3. Master Bot balas dengan rich message + inline keyboard
//      yang bisa diklik (page nav, detail modul, tutup)

const _MODULES_PER_PAGE = 8;

function getModuleNames() {
  return Object.keys(helpRegistry).sort();
}

/**
 * Bangun rich message (dengan tabel) untuk halaman menu utama
 */
function buildMenuRich(_page = 1) {
  const names = getModuleNames();
  const rows: string[][] = [['#', 'Modul', 'Deskripsi']];
  names.forEach((name, i) => {
    const mod = helpRegistry[name];
    const desc = mod ? stripHtml(mod.description).slice(0, 45) : '';
    rows.push([String(i + 1), `<code>${escapeHtml(name)}</code>`, escapeHtml(desc)]);
  });

  let tableHtml = '<table bordered striped><tr><th>#</th><th>Modul</th><th>Deskripsi</th></tr>';
  for (let i = 1; i < rows.length; i++) {
    tableHtml += `<tr><td align="center">${rows[i][0]}</td><td>${rows[i][1]}</td><td>${rows[i][2]}</td></tr>`;
  }
  tableHtml += '</table>';

  return Rich.html(
    `<h2>📖 Help Menu</h2>` +
    `<blockquote>📦 Total <b>${names.length}</b> modul terpasang. Ketik <code>.help [nama_modul]</code> untuk detail.</blockquote>` +
    tableHtml
  );
}

/**
 * Bangun teks HTML untuk halaman menu utama (fallback classic)
 */
function buildMenuText(_page = 1) {
  const names = getModuleNames();
  // Tampilkan SEMUA modul sekaligus di chat userbot (userbot tidak bisa render tombol)
  const items = names;
  const _currentPage = 1;

  const moduleList = items
    .map((name, i) => {
      const mod = helpRegistry[name];
      const num = i + 1;
      const title = mod?.title || formatModuleName(name);
      const desc = mod ? stripHtml(mod.description).slice(0, 60) : '';
      return `<b>${num}.</b> <code>${escapeHtml(name)}</code> — ${escapeHtml(title)}${desc ? `\n    <i>${escapeHtml(desc)}…</i>` : ''}`;
    })
    .join('\n\n');

  return (
    `📖 <b>HELP MENU — DAFTAR MODUL</b>\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
    `📦 <b>Total Modul:</b> ${names.length}\n\n` +
    `${moduleList}\n\n` +
    `💡 <b>Petunjuk:</b> ketik <code>.help [nama_modul]</code> untuk melihat detail modul, contoh: <code>.help admin</code>`
  );
}

/**
 * Bangun rich message untuk detail modul
 */
function buildModuleDetailRich(moduleName) {
  const mod = helpRegistry[moduleName];
  if (!mod) {return null;}

  const title = escapeHtml(mod.title?.toUpperCase() || formatModuleName(moduleName).toUpperCase());
  const tableHtml =
    `<table bordered striped>` +
    `<tr><th>Item</th><th>Detail</th></tr>` +
    `<tr><td>📝 Deskripsi</td><td>${markdownToHtml(mod.description)}</td></tr>` +
    `<tr><td>🚀 Penggunaan</td><td><code>${escapeHtml(stripHtml(mod.usage))}</code></td></tr>` +
    (mod.detail ? `<tr><td>💡 Detail</td><td>${markdownToHtml(mod.detail)}</td></tr>` : '') +
    `</table>`;

  return Rich.html(`<h2>📦 Modul: ${title}</h2>` + tableHtml);
}

/**
 * Bangun teks HTML untuk detail modul (fallback classic)
 */
function buildModuleDetail(moduleName) {
  const mod = helpRegistry[moduleName];
  if (!mod) {return null;}

  return (
    `📦 <b>MODUL: ${escapeHtml(mod.title?.toUpperCase() || formatModuleName(moduleName).toUpperCase())}</b>\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
    `📝 <b>Deskripsi:</b>\n` +
    `<blockquote>${markdownToHtml(mod.description)}</blockquote>\n\n` +
    `🚀 <b>Penggunaan:</b>\n` +
    `<blockquote>${markdownToHtml(mod.usage)}</blockquote>` +
    (mod.detail ? `\n\n💡 <b>Detail Tambahan:</b>\n<blockquote>${markdownToHtml(mod.detail)}</blockquote>` : '')
  );
}

export default {
  name: 'help',
  help: {
    title: 'Help Menu',
    description: 'Menampilkan panduan penggunaan dan daftar modul yang tersedia di userbot Anda.',
    usage: 'Ketik `.help` untuk menu utama atau `.help [nama_modul]` untuk detail spesifik.',
    detail: 'Menu help interaktif ditampilkan oleh Master Bot dengan tombol yang bisa diklik (navigasi halaman, detail modul, tutup).'
  },

  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}
    if (!message.message.toLowerCase().startsWith('.help')) {return;}

    try {
      const parts = message.message.trim().split(/\s+/);
      const moduleArg = parts.length > 1 ? parts[1].toLowerCase() : '';
      const session = getUserbotSession(telegramId);
      // Pakai custom INLINE_BOT_TOKEN jika sudah diset; fallback ke Master Bot (bawaan)
      const _inlineToken = session?.inline_bot_token || config.botToken || '';

      // Kirim menu + TOMBOL via inline bot result (MTProto) ke chat ini.
      // Pola dari kotakbiasa/userbot: get_inline_bot_results + reply_inline_bot_result
      // Pesan datang dari bot → inline keyboard render normal.
      // PENTING: pakai Master Bot (yang polling inline_query), BUKAN
      // inline_bot_username session (bisa menunjuk bot lain yang tidak polling).
      const masterBotUsername = getMasterBotUsername() || 'PanelDeltaUbot';
      const query = moduleArg || 'help';

      try {
        // Resolve bot FRESH via contacts.ResolveUsername (hindari cache rusak)
        const resolved = await client.invoke(
          new Api.contacts.ResolveUsername({ username: masterBotUsername })
        );
        const botUser = (resolved.users || []).find((u) => String(u.id) === String(resolved.peer?.userId));
        if (!botUser) {throw new Error(`Bot @${masterBotUsername} tidak ditemukan`);}
        const botPeer = new Api.InputPeerUser({
          userId: botUser.id,
          accessHash: botUser.accessHash,
        });
        console.log(`[HELP-INLINE] Bot resolved: @${masterBotUsername} id=${botUser.id} (bukan cache ${JSON.stringify((resolved.peer || {}).userId)})`);

        // Dapatkan inline query results dari bot (peer='me' = user sendiri sebagai konteks)
        const botResults = await client.invoke(
          new Api.messages.GetInlineBotResults({
            bot: botPeer,
            peer: 'me',
            query: query,
            offset: '',
          })
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`[HELP-INLINE] Got ${((botResults as any).results || []).length} results, queryId: ${(botResults as any).queryId}`);
        // Ambil hasil pertama & kirim ke chat (pesan datang dari BOT → tombol render)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = (botResults as any).results || [];
        if (results.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const queryId = (botResults as any).queryId;
          // Tangani forum topic: kirim ke topic yang sama dengan .help
          const replyTo = buildReplyToTopic(message);
          await client.invoke(
            new Api.messages.SendInlineBotResult({
              peer: message.peerId,
              queryId: queryId,
              id: String(results[0].id),
              hideVia: true,
              replyTo,
            })
          );
          console.log(`[HELP-INLINE] Sent inline result to chat`);
          // Hapus pesan asli .help (pola kotakbiasa/userbot: event.delete())
          await message.delete().catch(() => {});
          return;
        }
      } catch (mtpErr) {
        console.log(`[HELP-INLINE] Error: ${mtpErr.message} (cause: ${mtpErr.cause?.message || 'unknown'})`);
        Logger.logUser(telegramId, `[HELP] MTProto inline error: ${mtpErr.message} — fallback teks`, 'WARN');
      }

      // Fallback: tanpa inline bot — tampilkan daftar lengkap di chat userbot
      // (rich message dengan tabel; kalau server tolak → classic HTML)
      if (moduleArg) {
        const targetModule = helpRegistry[moduleArg];
        if (targetModule) {
          try {
            await message.edit({ text: '', richMessage: buildModuleDetailRich(moduleArg) });
          } catch (_e) {
            await message.edit({ text: buildModuleDetail(moduleArg), parseMode: 'html' });
          }
        } else {
          const available = Object.keys(helpRegistry).join(', ');
          const safeName = escapeHtml(parts[1]);
          const errText = `❌ <b>Modul "${safeName}" tidak ditemukan.</b>\n\n<blockquote>Modul tersedia: <code>${escapeHtml(available)}</code></blockquote>`;
          await message.edit({ text: errText, parseMode: 'html' });
        }
        return;
      }

      try {
        await message.edit({ text: '', richMessage: buildMenuRich(1) });
      } catch (_e) {
        const text = buildMenuText(1);
        await message.edit({ text, parseMode: 'html' });
      }
    } catch (err) {
      Logger.logUser(telegramId, `Error in help plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      try {
        await message.edit({
          text: `❌ <b>Error menampilkan help:</b>\n<code>${escapeHtml(err.message)}</code>`,
          parseMode: 'html'
        });
      } catch (_e) { /* ignore */ }
    }
  },

  // Handle callback dari inline keyboard
  async onCallbackQuery(client, callbackEvent, _settings, _telegramId) {
    try {
      const data = callbackEvent.data?.toString() || '';
      if (!data.startsWith('help:')) {return false;}

      const parts = data.split(':');
      const action = parts[1];

      if (action === 'close') {
        // Tutup / hapus pesan
        await callbackEvent.editMessage('Menu help ditutup.', { parseMode: 'html' });
        return true;
      }

      // Tampilkan detail modul
      const moduleName = action;
      const html = buildModuleHtml(moduleName, 'ubot');
      await callbackEvent.editMessage(html, { parseMode: 'html' });
      console.log(`[HELP-CALLBACK] Edited message to show ${moduleName}`);
      return true;
    } catch (err) {
      console.log(`[HELP-CALLBACK] Error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  },
};
