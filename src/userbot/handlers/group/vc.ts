import { Api } from 'teleproto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// VC — native Telegram Voice Chat (Obrolan Suara) via tgcalls-js (WebRTC).
//
// Fitur:
//   • Pure WebRTC Voice Chat (bukan RTMP livestream / siaran langsung)
//   • Masuk sebagai peserta obrolan suara dengan ikon mic/speaker
//   • Mendukung streaming musik dari YouTube/URL/file lokal & media reply Telegram
//   • Video sharing via WebRTC (--video)
// ============================================================

interface VCState {
  clients: Map<string, unknown>;
}

const g = globalThis as unknown as { __deltaVCState?: VCState };
if (!g.__deltaVCState) {
  g.__deltaVCState = { clients: new Map() };
}
const state = g.__deltaVCState;

type TgClient = {
  join: (chat: string | number | bigint, src: unknown, opts?: unknown) => Promise<unknown>;
  joinYouTube: (chat: string | number | bigint, url: string, opts?: unknown) => Promise<unknown>;
  joinIdle: (chat: string | number | bigint, opts?: unknown) => Promise<unknown>;
  setSource: (chat: string | number | bigint, src: unknown) => Promise<void>;
  leave: (chat: string | number | bigint) => Promise<void>;
  pause: (chat: string | number | bigint) => Promise<boolean>;
  resume: (chat: string | number | bigint) => Promise<boolean>;
  mute: (chat: string | number | bigint) => Promise<boolean>;
  unmute: (chat: string | number | bigint) => Promise<boolean>;
  time: (chat: string | number | bigint) => Promise<number>;
  isActive: (chat: string | number | bigint) => boolean;
  resolveYouTube: (url: string) => Promise<string | null>;
};

async function getClient(client: unknown): Promise<TgClient> {
  const key = 'shared';
  const existing = state.clients.get(key);
  if (existing) {return existing as TgClient;}
  const mod = await import('tgcalls-js');
  const TgCallsClient = mod.TgCallsClient;
  const inst = new TgCallsClient({ client: client as never, Api });
  state.clients.set(key, inst);
  return inst;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Parse .play argument into an audio source (local path or URL via yt-dlp). */
async function toSource(
  args: string,
  tg: TgClient,
): Promise<{ kind: 'file'; path: string } | { kind: 'url'; url: string }> {
  const isLocal = args.startsWith('/') || args.startsWith('./') || args.startsWith('~') || /^[a-zA-Z]:[/\\]/.test(args);
  if (isLocal) {
    return { kind: 'file', path: args };
  }
  if (!/^https?:\/\//i.test(args)) {
    throw new Error('Argumen harus URL (YouTube/link) atau path file lokal');
  }
  const direct = await tg.resolveYouTube(args);
  if (direct === null) {
    throw new Error(`yt-dlp gagal resolve: ${args.slice(0, 100)}`);
  }
  return { kind: 'url', url: direct };
}

/**
 * Download a replied/quoted Telegram media message to temp and return local path.
 */
async function downloadTgMedia(
  client: unknown,
  replyMsg: unknown,
): Promise<{ path: string; cleanup: () => void } | null> {
  const m = replyMsg as {
    audio?: { mimeType?: string };
    video?: { mimeType?: string };
    voice?: { mimeType?: string };
    videoNote?: unknown;
    document?: { mimeType?: string; attributes?: Array<{ className?: string; fileName?: string }> };
  };
  const hasMedia = Boolean(m?.audio || m?.video || m?.voice || m?.videoNote || m?.document);
  if (!hasMedia) {return null;}

  let ext = '.mp3';
  if (m.voice) {
    ext = '.ogg';
  } else if (m.video || m.videoNote) {
    ext = '.mp4';
  } else if (m.document?.attributes) {
    for (const attr of m.document.attributes) {
      if (attr.className === 'DocumentAttributeFilename' && attr.fileName) {
        const fileExt = path.extname(attr.fileName);
        if (fileExt) {ext = fileExt;}
        break;
      }
    }
  }

  const downloader = client as unknown as {
    downloadMedia: (handle: unknown, opts?: unknown) => Promise<string | Buffer | undefined>;
  };
  const tmpDir = process.env.TEMP || process.env.TMP || os.tmpdir();
  const tmpPath = path.join(tmpDir, `vcplay-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`);

  try {
    Logger.logUser(0, `📥 Mengunduh media Telegram ke: ${tmpPath}`, 'INFO');
    const saved = await downloader.downloadMedia(replyMsg, { filePath: tmpPath });
    if (typeof saved !== 'string' && Buffer.isBuffer(saved)) {
      fs.writeFileSync(tmpPath, saved);
    }
    if (fs.existsSync(tmpPath)) {
      const stats = fs.statSync(tmpPath);
      if (stats.size > 0) {
        Logger.logUser(0, `✅ Media berhasil diunduh: ${tmpPath} (${stats.size} bytes)`, 'SUCCESS');
        return { path: tmpPath, cleanup: () => { try { fs.unlinkSync(tmpPath); } catch {} } };
      }
    }
    Logger.logUser(0, '❌ Media hasil unduhan kosong (0 bytes)', 'ERROR');
  } catch (err) {
    Logger.logUser(0, `❌ Gagal mengunduh media Telegram: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
  }
  return null;
}

function mediaLabel(replyMsg: unknown): string {
  const m = replyMsg as { audio?: { title?: string }; video?: unknown; voice?: unknown; document?: { fileName?: string } };
  if (m?.audio?.title) {return m.audio.title;}
  if (m?.video) {return 'video';}
  if (m?.voice) {return 'pesan suara';}
  if (m?.document?.fileName) {return m.document.fileName;}
  return 'media';
}

export default {
  name: 'vc',
  version: '2.1.0',
  description: 'Streaming audio/video ke obrolan suara (Voice Chat) grup via WebRTC.',
  help: {
    title: 'Obrolan Suara (.joinvc / .play)',
    description: 'Gabung ke obrolan suara Telegram & streaming musik/audio.',
    usage:
      '• `.joinvc` — gabung ke obrolan suara (standby/idle)\n' +
      '• `.play <url>` — streaming musik dari YouTube/tautan\n' +
      '• `.play <url> --video` atau `.vplay` — streaming audio + video\n' +
      '• `.play /path/file.mp3` — streaming file lokal\n' +
      '• Reply media (lagu/video/voice) + `.play` / `.vplay` — putar media Telegram\n' +
      '• `.skip` — hentikan pemutaran audio (tetap di VC)\n' +
      '• `.pause` / `.resume` — jeda / lanjutkan musik\n' +
      '• `.mute` / `.unmute` — bisukan / bunyikan mic userbot\n' +
      '• `.vctime` — durasi streaming aktif\n' +
      '• `.leavevc` — keluar dari obrolan suara',
    detail: 'Murni menggunakan WebRTC Voice Chat resmi Telegram, bukan siaran langsung / RTMP.',
  },
  onLoad: () => {
    Logger.logSystem('🎵 Plugin VC v2.1 loaded (Pure WebRTC Voice Chat)', 'INFO');
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.(\w+)(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}
    const cmd = (match[1] ?? '').toLowerCase();
    const args = (match[2] ?? '').trim();
    if (!['play', 'vplay', 'skip', 'pause', 'resume', 'mute', 'unmute', 'vctime', 'joinvc', 'startvc', 'openvc', 'leavevc', 'vcmode'].includes(cmd)) {return;}

    let chat;
    try {
      chat = await message.getChat();
    } catch (_e) {chat = undefined;}
    if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
      if (['play', 'vplay', 'joinvc', 'startvc', 'openvc'].includes(cmd)) {
        await message.edit({ text: '<blockquote>❌ Perintah VC hanya bisa digunakan di grup.</blockquote>', parseMode: 'html' });
      }
      return;
    }
    const rawId = BigInt(chat.id.toString());
    const chatId = chat.className === 'Channel'
      ? -(1_000_000_000_000n + rawId)
      : -rawId;

    const tg = await getClient(client);
    const busy = (action: string) =>
      message.edit({
        text: `🎵 <b>Obrolan Suara</b> — ${action}…`,
        parseMode: 'html',
      });

    try {
      switch (cmd) {
        case 'vcmode': {
          const active = tg.isActive(chatId);
          await message.edit({
            text: `🛠 <b>STATUS VC</b>\n<blockquote>Status: <b>${active ? 'Aktif (WebRTC Voice Chat)' : 'Tidak aktif'}</b></blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'startvc':
        case 'openvc':
        case 'joinvc': {
          if (tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>✅ Sudah berada di obrolan suara ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Membuka & menghubungkan ke obrolan suara');
          await tg.joinIdle(chatId, { allowCreate: true });
          await message.edit({
            text: `🎧 <b>Obrolan Suara</b>\n<blockquote>✅ Obrolan suara aktif & userbot bergabung (standby).\n▶️ Putar musik: <code>.play &lt;url/link&gt;</code>\n📹 Putar video: <code>.play &lt;url&gt; --video</code> atau <code>.vplay</code>\n👋 Keluar: <code>.leavevc</code></blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'vplay':
        case 'play': {
          const withVideo = cmd === 'vplay' || /--video\b/i.test(args);
          const cleanArgs = (cmd === 'vplay' ? args : args.replace(/--video\b/i, '')).trim();

          // Reply mode: `.play` me-reply pesan media
          if (!cleanArgs) {
            let replyMsg: unknown = null;
            try {
              replyMsg = await (message as unknown as { getReplyMessage: () => Promise<unknown> }).getReplyMessage();
            } catch (_e) {replyMsg = null;}
            const dl = replyMsg ? await downloadTgMedia(client, replyMsg) : null;
            if (dl === null) {
              await message.edit({
                text: `🎵 <b>PUTAR MEDIA</b>\n<blockquote>Gunakan:\n<code>.play https://youtube.com/watch?v=…</code>\n<code>.play &lt;url&gt; --video</code> atau <code>.vplay &lt;url&gt;</code>\n<code>.play /path/file.mp3</code>\nAtau <b>reply media (audio/video)</b> dengan <code>.play</code> atau <code>.play --video</code></blockquote>`,
                parseMode: 'html',
              });
              return;
            }
            await busy(withVideo ? 'Menyiapkan video' : 'Mengunduh media');
            const label = mediaLabel(replyMsg);
            const source = { kind: 'file' as const, path: dl.path };

            if (tg.isActive(chatId)) {
              if (withVideo) {
                await busy('Mengaktifkan video di obrolan suara');
                await tg.leave(chatId);
                await tg.join(chatId, source, {
                  allowCreate: true,
                  video: { width: 1280, height: 720, fps: 24 },
                });
              } else {
                await busy('Mengganti track');
                await tg.setSource(chatId, source);
              }
            } else {
              await busy('Menghubungkan ke obrolan suara');
              await tg.join(chatId, source, {
                allowCreate: true,
                ...(withVideo ? { video: { width: 1280, height: 720, fps: 24 } } : {}),
              });
            }

            await message.edit({
              text: `🎵 <b>Obrolan Suara</b>\n<blockquote>▶️ Memutar: <i>${escapeHtml(label.slice(0, 80))}</i>${withVideo ? '\n📹 Video: ON' : ''}\n⏹ <code>.skip</code> • ⏸ <code>.pause</code> • 👋 <code>.leavevc</code></blockquote>`,
              parseMode: 'html',
            });
            return;
          }

          const source = await toSource(cleanArgs, tg);

          if (tg.isActive(chatId)) {
            if (withVideo) {
              await busy('Mengaktifkan video di obrolan suara');
              await tg.leave(chatId);
              await tg.join(chatId, source, {
                allowCreate: true,
                video: { width: 1280, height: 720, fps: 24 },
              });
            } else {
              await busy('Mengganti lagu');
              await tg.setSource(chatId, source);
            }
            await message.edit({
              text: `🎵 <b>Obrolan Suara</b>\n<blockquote>⏭ Ganti track: <i>${escapeHtml(cleanArgs.slice(0, 80))}</i>${withVideo ? '\n📹 Video: ON' : ''}\n⏹ <code>.skip</code> • ⏸ <code>.pause</code> • 👋 <code>.leavevc</code></blockquote>`,
              parseMode: 'html',
            });
            return;
          }

          await busy(withVideo ? 'Menyiapkan audio + video' : 'Menyiapkan audio');
          await tg.join(chatId, source, {
            allowCreate: true,
            ...(withVideo ? { video: { width: 1280, height: 720, fps: 24 } } : {}),
          });

          await message.edit({
            text: `🎵 <b>Obrolan Suara</b>\n<blockquote>▶️ Memutar di VC: <i>${escapeHtml(cleanArgs.slice(0, 80))}</i>${withVideo ? '\n📹 Video: ON' : ''}</blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'skip': {
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada audio yang sedang diputar di chat ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Menghentikan track');
          await tg.setSource(chatId, { kind: 'shell', command: 'ffmpeg -f lavfi -i anullsrc=r=48000:cl=stereo -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1' });
          await message.edit({
            text: '⏭ <blockquote>Audio dihentikan (tetap berada di VC — ketik <code>.leavevc</code> untuk keluar).</blockquote>',
            parseMode: 'html',
          });
          return;
        }
        case 'pause': {
          const ok = await tg.pause(chatId);
          await message.edit({ text: ok ? '⏸ <blockquote>Pemutaran dijeda.</blockquote>' : '⚠️ <blockquote>Gagal menjeda audio.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'resume': {
          const ok = await tg.resume(chatId);
          await message.edit({ text: ok ? '▶️ <blockquote>Pemutaran dilanjutkan.</blockquote>' : '⚠️ <blockquote>Gagal melanjutkan audio.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'mute':
        case 'unmute': {
          const ok = cmd === 'mute' ? await tg.mute(chatId) : await tg.unmute(chatId);
          await message.edit({
            text: ok
              ? (cmd === 'mute' ? '🔇 <blockquote>Mic userbot dibisukan.</blockquote>' : '🔊 <blockquote>Mic userbot di-unmute.</blockquote>')
              : '⚠️ <blockquote>Gagal mengatur mic.</blockquote>',
            parseMode: 'html',
          });
          return;
        }
        case 'vctime': {
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada sesi streaming aktif di chat ini.</blockquote>', parseMode: 'html' });
            return;
          }
          const t = Math.floor(await tg.time(chatId));
          await message.edit({ text: `⏱ <blockquote>Telah berjalan: <b>${Math.floor(t / 60)}m ${t % 60}s</b>.</blockquote>`, parseMode: 'html' });
          return;
        }
        case 'leavevc': {
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Userbot belum berada di obrolan suara grup ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Keluar dari obrolan suara');
          await tg.leave(chatId);
          await message.edit({ text: '👋 <blockquote>Berhasil keluar dari obrolan suara.</blockquote>', parseMode: 'html' });
          return;
        }
        default:
          return;
      }
    } catch (err) {
      const msg = errText(err);
      const hint = /no active voice chat/i.test(msg)
        ? '\nℹ️ Grup ini belum membuka Obrolan Suara.'
        : /yt-dlp/i.test(msg)
          ? '\nℹ️ yt-dlp gagal memproses tautan.'
          : /ffmpeg/i.test(msg)
            ? '\nℹ️ Format media tidak didukung.'
            : '';
      await message.edit({
        text: `🎵 <b>Obrolan Suara</b>\n<blockquote>❌ ${escapeHtml(msg.slice(0, 200))}${hint}</blockquote>`,
        parseMode: 'html',
      });
      Logger.logUser(0, `Error in vc plugin: ${msg}`, 'ERROR');
    }
  },
};
