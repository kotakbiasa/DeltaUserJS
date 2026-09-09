import { Api } from 'teleproto';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'node:fs';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// VC — voice chat streaming via tgcalls-js + RTMP livestream mode.
//
// Dua jalur streaming:
//   1. RTC (WebRTC native via ntgcalls) — butuh UDP keluar, dipakai otomatis
//      kalau VPS tidak diblokir UDP (deteksi runtime sekali, di-cache).
//   2. RTMP livestream (TCP:443) — fallback untuk VPS UDP-blocked seperti
//      VPS ini. Audio di-push ke rtmps://dcX.rtmp.t.me:443 sebagai livestream
//      yang tampil di grup. Gak butuh UDP sama sekali.
//
// Perintah:
//   .joinvc                       gabung VC (idle)
//   .play <url|file> [--video]    streaming (RTMP di host UDP-blocked)
//   .skip                         hentikan track
//   .pause/.resume/.mute/.unmute  kontrol native (mode RTC)
//   .vctime                       durasi streaming
//   .leavevc                      keluar VC / stop livestream
//   .vcmode                       info mode aktif (RTC / RTMP)
//
// State di globalThis agar survive hot-reload plugin.
// ============================================================

interface RTMPStream {
  ffmpeg: ChildProcess;
  chatId: bigint;
  startedAt: number;
  title: string;
}

function asBigIntChat(chatId: number | bigint): bigint {
  return typeof chatId === 'bigint' ? chatId : BigInt(Math.trunc(chatId));
}

interface VCState {
  clients: Map<string, unknown>;
  rtmpStreams: Map<string, RTMPStream>;
  rtcWorks: boolean | null; // null = belum dideteksi
}

const g = globalThis as unknown as { __deltaVCState?: VCState };
if (!g.__deltaVCState) {
  g.__deltaVCState = { clients: new Map(), rtmpStreams: new Map(), rtcWorks: null };
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
  // GramJS client satisfies MTProtoLike at runtime (invoke/getEntity/handlers).
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
  const isLocal = args.startsWith('/') || args.startsWith('./') || args.startsWith('~');
  if (isLocal) {
    return { kind: 'file', path: args };
  }
  if (!/^https?:\/\//i.test(args)) {
    throw new Error('Argumen harus URL atau path file lokal');
  }
  const direct = await tg.resolveYouTube(args);
  if (direct === null) {
    throw new Error(`yt-dlp gagal resolve: ${args.slice(0, 100)}`);
  }
  return { kind: 'url', url: direct };
}

// ------------------------------------------------------------ RTMP mode

/** Get (or lazily create) the RTMP livestream call for this chat. */
async function getRtmpUrl(client: unknown, chatId: bigint): Promise<{ url: string; key: string }> {
  const invoker = client as unknown as {
    invoke: (r: unknown) => Promise<never>;
  };
  // Ensure a live call exists (rtmpStream calls provide the RTMP URL).
  const full = await invoker.invoke(new Api.channels.GetFullChannel({ channel: chatId as never })) as {
    fullChat?: { call?: unknown };
  };
  if (!full.fullChat?.call) {
    await invoker.invoke(new Api.phone.CreateGroupCall({
      peer: chatId as never,
      randomId: Math.floor(Math.random() * 2 ** 31),
      title: 'Live',
      rtmpStream: true,
    }));
    await new Promise((r) => setTimeout(r, 1200));
  }
  const url = await invoker.invoke(new Api.phone.GetGroupCallStreamRtmpUrl({
    peer: chatId as never,
  })) as unknown as { url: string; key: string };
  // rtmps default port 443 works over TCP; 1935 is commonly blocked.
  // NOTE: url already ends with "/s/" so the final URL is url + key (no extra slash).
  return { url: url.url.replace(':1935', ':443'), key: url.key };
}

/**
 * Spawn ffmpeg to push audio (+ optional video) into the Telegram RTMP
 * endpoint. TCP:443 only (port 1935 is blocked on UDP-restricted hosts).
 */
function spawnRtmpPush(
  inputUrl: string | undefined,
  inputPath: string | undefined,
  rtmpUrl: string,
  rtmpKey: string,
  withVideo: boolean,
): ChildProcess {
  const args: string[] = ['-re'];
  if (inputUrl !== undefined) {
    args.push('-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '2', '-i', inputUrl);
  } else if (inputPath !== undefined) {
    args.push('-i', inputPath);
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  }
  args.push('-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2');
  if (withVideo) {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-b:v', '1200k', '-maxrate', '1200k', '-bufsize', '2400k',
      '-vf', 'scale=1280:720', '-r', '24', '-pix_fmt', 'yuv420p', '-g', '48');
  } else {
    args.push('-vn');
  }
  // url already ends with "/s/" — final URL is url + key (no extra slash).
  args.push('-f', 'flv', `rtmps://${rtmpUrl.replace(/^rtmps?:\/\//, '')}${rtmpKey}`);
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  ff.stderr?.on('data', () => { /* drain to avoid pipe backpressure */ });
  return ff;
}

// ------------------------------------------------------- Telegram media

/**
 * Download a replied/quoted Telegram media message to /tmp and return the
 * local path. Supports audio, video, voice, document. Returns null when the
 * message has no downloadable media.
 */
async function downloadTgMedia(
  client: unknown,
  replyMsg: unknown,
): Promise<{ path: string; cleanup: () => void } | null> {
  const m = replyMsg as {
    audio?: unknown;
    video?: unknown;
    voice?: unknown;
    videoNote?: unknown;
    document?: unknown;
  };
  const hasMedia = Boolean(m?.audio || m?.video || m?.voice || m?.videoNote || m?.document);
  if (!hasMedia) {return null;}
  const downloader = client as unknown as {
    downloadMedia: (handle: unknown, opts?: unknown) => Promise<string | Buffer | undefined>;
  };
  const tmpPath = `/tmp/vcplay-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const saved = await downloader.downloadMedia(replyMsg, { filePath: tmpPath });
  if (typeof saved !== 'string') {
    // Buffer fallback: write manually
    if (Buffer.isBuffer(saved)) {
      fs.writeFileSync(tmpPath, saved);
    } else {
      return null;
    }
  }
  return { path: tmpPath, cleanup: () => fs.unlink(tmpPath, () => {}) };
}

/** Infer media kind for nicer titles. */
function mediaLabel(replyMsg: unknown): string {
  const m = replyMsg as { audio?: { title?: string }; video?: unknown; voice?: unknown; document?: { fileName?: string } };
  if (m?.audio?.title) {return m.audio.title;}
  if (m?.video) {return 'video';}
  if (m?.voice) {return 'voice';}
  if (m?.document?.fileName) {return m.document.fileName;}
  return 'media';
}

export default {
  name: 'vc',
  version: '2.0.0',
  description: 'Streaming audio/video ke voice chat grup. Auto-fallback ke RTMP livestream di host UDP-blocked.',
  help: {
    title: 'Voice Chat (.joinvc / .play)',
    description: 'Join voice chat & streaming audio/video. Otomatis pakai RTMP livestream kalau WebRTC diblokir.',
    usage:
      '• `.joinvc` — gabung voice chat (idle)\n' +
      '• `.play <url>` — streaming musik dari YouTube/tautan\n' +
      '• `.play <url> --video` — audio+video livestream (720p)\n' +
      '• `.play /path/file.mp3` — file lokal\n' +
      '• Reply media (lagu/video/voice) + `.play` — putar media Telegram\n' +
      '• `.skip` — hentikan track\n' +
      '• `.pause` / `.resume` / `.vctime` — kontrol\n' +
      '• `.vcmode` — mode streaming aktif (RTC/RTMP)\n' +
      '• `.leavevc` — keluar VC',
    detail:
      'Di VPS UDP-blocked (seperti VPS utama), streaming otomatis lewat RTMP ' +
      'livestream (TCP:443) dan tampil sebagai live stream di grup. Di host biasa, ' +
      'streaming masuk sebagai participant VC biasa (WebRTC).',
  },
  onLoad: () => {
    Logger.logSystem('🎵 Plugin VC v2.0 loaded (RTC + RTMP fallback, .joinvc/.play/.skip/.leavevc/.vcmode)', 'INFO');
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.(\w+)(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}
    const cmd = (match[1] ?? '').toLowerCase();
    const args = (match[2] ?? '').trim();
    if (!['play', 'skip', 'pause', 'resume', 'mute', 'unmute', 'vctime', 'joinvc', 'leavevc', 'vcmode'].includes(cmd)) {return;}

    let chat;
    try {
      chat = await message.getChat();
    } catch (_e) {chat = undefined;}
    if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
      if (cmd === 'play' || cmd === 'joinvc') {
        await message.edit({ text: '<blockquote>❌ Perintah VC hanya di grup.</blockquote>', parseMode: 'html' });
      }
      return;
    }
    const chatId = Number(chat.id.toString()) * (chat.className === 'Channel' ? -1 : 1) -
      (chat.className === 'Channel' ? 1_000_000_000_000 : 0);
    const rtmpKey = String(chatId);

    const tg = await getClient(client);
    const busy = (action: string) =>
      message.edit({
        text: `🎵 <b>VC</b> — ${action}…`,
        parseMode: 'html',
      });

    try {
      switch (cmd) {
        case 'vcmode': {
          const s = state.rtmpStreams.get(rtmpKey);
          const mode = s ? 'RTMP livestream (TCP:443)' : tg.isActive(chatId) ? 'RTC (WebRTC native)' : '—';
          await message.edit({
            text: `🛠 <b>VC MODE</b>\n<blockquote>Mode chat ini: <b>${mode}</b>${s ? `\n▶️ Live sejak ${Math.floor((Date.now() - s.startedAt) / 60000)}m lalu` : ''}</blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'joinvc': {
          const existing = state.rtmpStreams.get(rtmpKey);
          if (existing || tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>✅ Sudah ada di voice chat ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Joining voice chat');
          await tg.joinIdle(chatId, { allowCreate: true });
          await message.edit({
            text: `🎧 <b>VC</b>\n<blockquote>✅ Masuk voice chat.\n▶️ Putar musik: <code>.play &lt;url&gt;</code>\n👋 Keluar: <code>.leavevc</code></blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'play': {
          const withVideo = /--video\b/i.test(args);
          const cleanArgs = args.replace(/--video\b/i, '').trim();

          // Reply mode: `.play` (or `.play --video`) replying to a media message.
          if (!cleanArgs) {
            let replyMsg: unknown = null;
            try {
              replyMsg = await (message as unknown as { getReplyMessage: () => Promise<unknown> }).getReplyMessage();
            } catch (_e) {replyMsg = null;}
            const dl = replyMsg ? await downloadTgMedia(client, replyMsg) : null;
            if (dl === null) {
              await message.edit({
                text: `🎵 <b>PLAY</b>\n<blockquote>Penggunaan:\n<code>.play https://youtube.com/watch?v=…</code>\n<code>.play <url> --video</code> — audio+video livestream\n<code>.play /path/file.mp3</code> — file lokal\nAtau <b>reply</b> media (audio/video/voice/dokumen) dengan <code>.play</code></blockquote>`,
                parseMode: 'html',
              });
              return;
            }
            // Telegram media path — always RTMP (works on UDP-blocked hosts).
            await busy('Downloading media');
            const label = mediaLabel(replyMsg);
            const { url, key } = await getRtmpUrl(client, asBigIntChat(chatId));
            const ff = spawnRtmpPush(undefined, dl.path, url, key, withVideo);
            ff.on('close', () => {dl.cleanup();});
            ff.on('error', () => {dl.cleanup();});
            await new Promise((r) => setTimeout(r, 4000));
            if (ff.exitCode !== null) {
              dl.cleanup();
              throw new Error('ffmpeg gagal start (media tidak bisa dibaca)');
            }
            state.rtmpStreams.set(rtmpKey, {
              ffmpeg: ff,
              chatId: asBigIntChat(chatId),
              startedAt: Date.now(),
              title: label,
            });
            await message.edit({
              text: `📺 <b>LIVE</b>\n<blockquote>🔴 Streaming media Telegram: <i>${escapeHtml(label.slice(0, 80))}</i>${withVideo ? '\n📹 Video: ON (720p)' : '\n🎵 Audio only'}\n⏹ Stop: <code>.skip</code> / <code>.leavevc</code></blockquote>`,
              parseMode: 'html',
            });
            return;
          }
          const existing = state.rtmpStreams.get(rtmpKey);
          if (existing) {
            await message.edit({
              text: '⚠️ <blockquote>RTMP livestream sudah jalan di chat ini — <code>.skip</code> dulu buat ganti.</blockquote>',
              parseMode: 'html',
            });
            return;
          }
          if (tg.isActive(chatId)) {
            await busy('Ganti track');
            await tg.setSource(chatId, await toSource(cleanArgs, tg));
            await message.edit({
              text: `🎵 <b>VC</b>\n<blockquote>⏭ Ganti track: <i>${escapeHtml(cleanArgs.slice(0, 80))}</i>\n⏹ <code>.skip</code> • ⏸ <code>.pause</code> • 👋 <code>.leavevc</code></blockquote>`,
              parseMode: 'html',
            });
            return;
          }
          await busy('Preparing stream');
          // Try native RTC first; fall back to RTMP livestream when the host
          // cannot reach Telegram's UDP media servers (ICE timeout / kick).
          let useRtmp = state.rtcWorks === false;
          if (state.rtcWorks === null) {
            // First-ever play: detect by attempting RTC join; if it fails or
            // times out quickly, mark RTMP for this session.
            try {
              await tg.join(chatId, await toSource(cleanArgs, tg), { allowCreate: true });
              state.rtcWorks = true;
              await message.edit({
                text: `🎵 <b>VC</b>\n<blockquote>▶️ Streaming (RTC): <i>${escapeHtml(cleanArgs.slice(0, 80))}</i></blockquote>`,
                parseMode: 'html',
              });
              return;
            } catch (rtcErr) {
              Logger.logUser(0, `RTC join failed, falling back to RTMP: ${errText(rtcErr)}`, 'WARN');
              state.rtcWorks = false;
              useRtmp = true;
              await tg.leave(chatId).catch(() => {});
            }
          }
          if (!useRtmp) {
            await tg.join(chatId, await toSource(cleanArgs, tg), {
              allowCreate: true,
              ...(withVideo ? { video: { width: 1280, height: 720, fps: 24 } } : {}),
            });
            await message.edit({
              text: `🎬 <b>VC</b>\n<blockquote>▶️ Streaming (RTC): <i>${escapeHtml(cleanArgs.slice(0, 80))}</i></blockquote>`,
              parseMode: 'html',
            });
            return;
          }
          // ---- RTMP livestream path (TCP:443, no UDP needed)
          const resolved = await toSource(cleanArgs, tg);
          const { url, key } = await getRtmpUrl(client, asBigIntChat(chatId));
          const ff = spawnRtmpPush(
            resolved.kind === 'url' ? resolved.url : undefined,
            resolved.kind === 'file' ? resolved.path : undefined,
            url,
            key,
            withVideo,
          );
          let failed = false;
          ff.on('exit', (code) => {
            if (code !== 0 && code !== null && !failed) {
              Logger.logUser(0, `RTMP ffmpeg exited code=${code}`, 'WARN');
            }
            state.rtmpStreams.delete(rtmpKey);
          });
          // small grace period: if ffmpeg dies instantly (bad input), fail fast
          await new Promise((r) => setTimeout(r, 4000));
          if (ff.exitCode !== null) {
            failed = true;
            throw new Error('ffmpeg gagal start (input tidak valid atau RTMP ditolak)');
          }
          state.rtmpStreams.set(rtmpKey, {
            ffmpeg: ff,
            chatId: asBigIntChat(chatId),
            startedAt: Date.now(),
            title: cleanArgs.slice(0, 100),
          });
          await message.edit({
            text: `📺 <b>LIVE</b>\n<blockquote>🔴 Livestream jalan (RTMP via TCP): <i>${escapeHtml(cleanArgs.slice(0, 80))}</i>${withVideo ? '\n📹 Video: ON (720p)' : '\n🎵 Audio only'}\n⏹ Stop: <code>.skip</code> / <code>.leavevc</code></blockquote>`,
            parseMode: 'html',
          });
          return;
        }
        case 'skip': {
          const existing = state.rtmpStreams.get(rtmpKey);
          if (existing) {
            await busy('Stopping live');
            existing.ffmpeg.kill('SIGKILL');
            state.rtmpStreams.delete(rtmpKey);
            await message.edit({ text: '⏹ <blockquote>Livestream dihentikan.</blockquote>', parseMode: 'html' });
            return;
          }
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada streaming di chat ini.</blockquote>', parseMode: 'html' });
            return;
          }
          await busy('Skipping');
          // Stop audio but stay in the call: swap to a silent source.
          await tg.setSource(chatId, { kind: 'shell', command: 'ffmpeg -f lavfi -i anullsrc=r=48000:cl=stereo -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1' });
          await message.edit({
            text: '⏭ <blockquote>Track dihentikan (masih di VC — <code>.leavevc</code> buat keluar).</blockquote>',
            parseMode: 'html',
          });
          return;
        }
        case 'pause': {
          const s = state.rtmpStreams.get(rtmpKey);
          if (s) {
            s.ffmpeg.kill('SIGSTOP');
            await message.edit({ text: '⏸ <blockquote>Livestream dipause.</blockquote>', parseMode: 'html' });
            return;
          }
          const ok = await tg.pause(chatId);
          await message.edit({ text: ok ? '⏸ <blockquote>Streaming dipause.</blockquote>' : '⚠️ <blockquote>Gagal pause.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'resume': {
          const s = state.rtmpStreams.get(rtmpKey);
          if (s) {
            s.ffmpeg.kill('SIGCONT');
            await message.edit({ text: '▶️ <blockquote>Livestream dilanjutkan.</blockquote>', parseMode: 'html' });
            return;
          }
          const ok = await tg.resume(chatId);
          await message.edit({ text: ok ? '▶️ <blockquote>Streaming dilanjutkan.</blockquote>' : '⚠️ <blockquote>Gagal resume.</blockquote>', parseMode: 'html' });
          return;
        }
        case 'mute':
        case 'unmute': {
          if (state.rtmpStreams.has(rtmpKey)) {
            await message.edit({ text: 'ℹ️ <blockquote>Mode RTMP: mute/unmute gak relevan (livestream terpisah).</blockquote>', parseMode: 'html' });
            return;
          }
          const ok = cmd === 'mute' ? await tg.mute(chatId) : await tg.unmute(chatId);
          await message.edit({
            text: ok
              ? (cmd === 'mute' ? '🔇 <blockquote>Mic dimute.</blockquote>' : '🔊 <blockquote>Mic di-unmute.</blockquote>')
              : '⚠️ <blockquote>Gagal.</blockquote>',
            parseMode: 'html',
          });
          return;
        }
        case 'vctime': {
          const s = state.rtmpStreams.get(rtmpKey);
          if (s) {
            const t = Math.floor((Date.now() - s.startedAt) / 1000);
            await message.edit({ text: `⏱ <blockquote><b>${Math.floor(t / 60)}m ${t % 60}s</b> live.</blockquote>`, parseMode: 'html' });
            return;
          }
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Tidak ada streaming.</blockquote>', parseMode: 'html' });
            return;
          }
          const t = Math.floor(await tg.time(chatId));
          await message.edit({ text: `⏱ <blockquote><b>${Math.floor(t / 60)}m ${t % 60}s</b> streaming.</blockquote>`, parseMode: 'html' });
          return;
        }
        case 'leavevc': {
          const s = state.rtmpStreams.get(rtmpKey);
          if (s) {
            await busy('Stopping live');
            s.ffmpeg.kill('SIGKILL');
            state.rtmpStreams.delete(rtmpKey);
            await message.edit({ text: '👋 <blockquote>Livestream dihentikan.</blockquote>', parseMode: 'html' });
            return;
          }
          if (!tg.isActive(chatId)) {
            await message.edit({ text: '<blockquote>⚠️ Belum ada di voice chat ini.</blockquote>', parseMode: 'html' });
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
          : /ffmpeg/i.test(msg)
            ? '\nℹ️ ffmpeg error — cek format file/URL.'
            : '';
      await message.edit({
        text: `🎵 <b>VC</b>\n<blockquote>❌ ${escapeHtml(msg.slice(0, 200))}${hint}</blockquote>`,
        parseMode: 'html',
      });
      Logger.logUser(0, `Error in vc plugin: ${msg}`, 'ERROR');
    }
  },
};
