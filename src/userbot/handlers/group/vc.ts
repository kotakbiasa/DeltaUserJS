import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// VC — voice chat streaming via tgcalls-js (github:kotakbiasa/tgcalls-js).
// Orkestrasi MTProto ↔ ntgcalls (WebRTC native, npm resmi pytgcalls).
//
//   .play <url yt/tautan media> | <path file>   join + streaming
//   .skip                                        hentikan track (autoLeave next)
//   .pause  .resume  .mute  .unmute              kontrol native
//   .vctime                                      durasi streaming
//   .leave                                       keluar VC
//
// Konsep: pytgcalls (Python) — port ke NodeJS lewat lib tgcalls-js buatan sendiri.
// State disimpan di globalThis agar survive hot-reload plugin.
// ============================================================

interface VCState {
  clients: Map<string, unknown>;
}

const g = globalThis as unknown as { __deltaVCState?: VCState };
if (!g.__deltaVCState) {
  g.__deltaVCState = { clients: new Map() };
}
const state = g.__deltaVCState;

async function getClient(client: unknown): Promise<{
  join: (chat: string | number | bigint, src: unknown, opts?: unknown) => Promise<unknown>;
  joinYouTube: (chat: string | number | bigint, url: string, opts?: unknown) => Promise<unknown>;
  setSource: (chat: string | number | bigint, src: unknown) => Promise<void>;
  leave: (chat: string | number | bigint) => Promise<void>;
  pause: (chat: string | number | bigint) => Promise<boolean>;
  resume: (chat: string | number | bigint) => Promise<boolean>;
  mute: (chat: string | number | bigint) => Promise<boolean>;
  unmute: (chat: string | number | bigint) => Promise<boolean>;
  time: (chat: string | number | bigint) => Promise<number>;
  isActive: (chat: string | number | bigint) => boolean;
}> {
  const key = 'shared';
  const existing = state.clients.get(key);
  if (existing) {return existing as never;}
  const mod = await import('tgcalls-js');
  const TgCallsClient = mod.TgCallsClient;
  // GramJS client satisfies MTProtoLike at runtime (invoke/getEntity/handlers).
  const inst = new TgCallsClient({ client: client as never, Api });
  state.clients.set(key, inst);
  return inst;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default {
  name: 'vc',
  version: '1.0.0',
  description: 'Streaming audio ke voice chat grup via tgcalls-js (WebRTC native).',
  help: {
    title: 'Voice Chat Streaming (.play)',
    description: 'Join voice chat grup dan streaming audio dari YouTube/tautan media/file lokal.',
    usage:
      '• `.play <url>` — streaming dari YouTube/tautan media (yt-dlp/ffmpeg)\n' +
      '• `.play /path/file.mp3` — streaming file lokal\n' +
      '• `.pause` / `.resume` / `.mute` / `.unmute`\n' +
      '• `.skip` — hentikan track sekarang\n' +
      '• `.vctime` — durasi streaming\n' +
      '• `.leave` — keluar dari VC',
    detail:
      'Perlu ffmpeg (dan yt-dlp untuk YouTube) di PATH. Grup harus punya voice chat aktif ' +
      '(bot membuat otomatis bila kamu admin). Audio-only; video menyusul.',
  },
  onLoad: () => {
    Logger.logSystem('🎵 Plugin VC loaded (.play/.skip/.pause/.resume/.mute/.unmute/.vctime/.leave)', 'INFO');
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.(\w+)(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}
    const cmd = (match[1] ?? '').toLowerCase();
    const args = (match[2] ?? '').trim();
    if (!['play', 'skip', 'pause', 'resume', 'mute', 'unmute', 'vctime', 'leave'].includes(cmd)) {return;}

    let chat;
    try {
      chat = await message.getChat();
    } catch (_e) {chat = undefined;}
    if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
      if (cmd === 'play') {
        await message.edit({ text: '<blockquote>❌ <b>.play hanya di grup.</b></blockquote>', parseMode: 'html' });
      }
      return;
    }
    const chatId = Number(chat.id.toString()) * (chat.className === 'Channel' ? -1 : 1) -
      (chat.className === 'Channel' ? 1_000_000_000_000 : 0);

    const tg = await getClient(client);
    const busy = (action: string) =>
      message.edit({
        text: `🎵 <b>VC</b> — ${action}…`,
        parseMode: 'html',
      });

    try {
      switch (cmd) {
        case 'play': {
          if (!args) {
            await message.edit({
              text: `🎵 <b>PLAY</b>\n<blockquote>Penggunaan:\n<code>.play https://youtube.com/watch?v=…</code>\n<code>.play /path/file.mp3</code></blockquote>`,
              parseMode: 'html',
            });
            return;
          }
          if (tg.isActive(chatId)) {
            await message.edit({
              text: '<blockquote>⚠️ Masih streaming — <code>.skip</code> dulu atau <code>.leave</code>.</blockquote>',
              parseMode: 'html',
            });
            return;
          }
          await busy('Joining voice chat');
          const isLocal = args.startsWith('/') || args.startsWith('./') || args.startsWith('~');
          if (isLocal) {
            await tg.join(chatId, { kind: 'file', path: args });
          } else if (/^https?:\/\//i.test(args)) {
            await tg.joinYouTube(chatId, args);
          } else {
            await message.edit({
              text: '<blockquote>❌ Argumen harus URL atau path file lokal.</blockquote>',
              parseMode: 'html',
            });
            return;
          }
          await message.edit({
            text: `🎵 <b>VC</b>\n<blockquote>▶️ Streaming: <i>${escapeHtml(args.slice(0, 80))}</i>\n⏹ <code>.skip</code> • ⏸ <code>.pause</code> • 🔇 <code>.mute</code> • 👋 <code>.leave</code></blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'skip': {
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada streaming di chat ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Skipping');
          await tg.leave(chatId);
          await message.edit({ text: '⏭ <blockquote>Track dihentikan & keluar dari VC.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'pause': {
          const ok = await tg.pause(chatId);
          await message.edit({ text: ok ? '⏸ <blockquote>Streaming dipause.</blockquote>' : '⚠️ <blockquote>Gagal pause.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'resume': {
          const ok = await tg.resume(chatId);
          await message.edit({ text: ok ? '▶️ <blockquote>Streaming dilanjutkan.</blockquote>' : '⚠️ <blockquote>Gagal resume.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'mute': {
          const ok = await tg.mute(chatId);
          await message.edit({ text: ok ? '🔇 <blockquote>Mic dimute.</blockquote>' : '⚠️ <blockquote>Gagal mute.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'unmute': {
          const ok = await tg.unmute(chatId);
          await message.edit({ text: ok ? '🔊 <blockquote>Mic di-unmute.</blockquote>' : '⚠️ <blockquote>Gagal unmute.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'vctime': {
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada streaming.</blockquote>', parseMode: 'html' });
            return;
          }
          const t = Math.floor(await tg.time(chatId));
          await message.edit({ text: `⏱ <blockquote><b>${Math.floor(t / 60)}m ${t % 60}s</b> streaming.</blockquote>`, parseMode: 'html' });
          return;
        }
        case 'leave': {
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada streaming di chat ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Leaving');
          await tg.leave(chatId);
          await message.edit({ text: '👋 <blockquote>Keluar dari voice chat.</blockquote>', parseMode: 'html' });
          return;
        }
        default:
          return;
      }
    } catch (err) {
      const msg = errText(err);
      const hint = /no active voice chat/i.test(msg)
        ? '\nℹ️ Grup ini belum punya voice chat aktif.'
        : /yt-dlp/i.test(msg)
          ? '\nℹ️ yt-dlp gagal resolve tautan itu.'
          : '';
      await message.edit({
        text: `🎵 <b>VC</b>\n<blockquote>❌ ${escapeHtml(msg.slice(0, 200))}${hint}</blockquote>`,
        parseMode: 'html',
      });
      Logger.logUser(0, `Error in vc plugin: ${msg}`, 'ERROR');
    }
  },
};
