/**
 * Konstruktor TL dinamis gaya GramJS (`Api.phone.JoinGroupCall`). mtcute tidak
 * punya padanannya, jadi proxy ini merakit objek `{ _: 'nama.tl' }` sesuai
 * jalur properti yang diakses. Tipenya rekursif: setiap properti adalah proxy
 * lain yang juga bisa dipanggil dengan `new`.
 */
type TlProxy = (new (args?: Record<string, unknown>) => { _: string }) & {
  [key: string]: TlProxy;
};

function createTlProxy(prefix = ''): TlProxy {
  const Cls = class {
    _: string;
    constructor(args?: Record<string, unknown>) {
      this._ = prefix;
      if (args) {
        Object.assign(this, args);
      }
    }
  };
  return new Proxy(Cls, {
    get(target, prop: string) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop);
      }
      if (prop in target) {
        return (target as unknown as Record<string, unknown>)[prop];
      }
      const next = prefix
        ? `${prefix}.${prop.charAt(0).toLowerCase() + prop.slice(1)}`
        : prop.charAt(0).toLowerCase() + prop.slice(1);
      return createTlProxy(next);
    },
  }) as unknown as TlProxy;
}
const Api = createTlProxy();

/**
 * Unduh media pesan jadi Buffer.
 *
 * mtcute tidak punya `client.downloadMedia()` (itu nama GramJS); jalurnya
 * adalah adapter pesan, dengan `downloadAsBuffer()` atas objek media sebagai
 * cadangan.
 */
async function downloadMediaBuffer(client: CompatClient, currentMsg: UserbotMessageLike) {
  let buf;
  if (typeof currentMsg?.downloadMedia === 'function') {
    buf = await currentMsg.downloadMedia();
  }
  if (!buf && currentMsg?.media && typeof client.downloadAsBuffer === 'function') {
    buf = Buffer.from(await client.downloadAsBuffer(currentMsg.media as unknown as Parameters<CompatClient['downloadAsBuffer']>[0]));
  }
  return buf;
}
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { Jimp } from 'jimp';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';

// ============================================================
// Sticker Tools: .kang (salin sticker/foto/video ke pack pribadi)
//                .q    (quote sticker via @QuotLyBot)
// Referensi pola: PyroUbot modules/stickers.py
// ============================================================

const QUOTLY = '@QuotLyBot';
const STICKER_MAX_EDGE = 512;
const VIDEO_STICKER_MAX_SEC = 3;
const PACK_LIMITS: Record<string, number> = { static: 120, anim: 50, video: 50 };

const EMOJIS = [
  '✨', '🤡', '🙂', '🤔', '😂', '💀', '🔥', '❤️', '💯', '👍',
  '🎉', '😎', '😭', '🥺', '😱', '🤯', '😴', '🤪', '🥰', '😈',
  '👻', '🎭', '🎨', '⚡', '💎', '🌟', '🌈', '⭐', '🍕', '🐱'
];

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function editStatus(message: UserbotMessageLike, html: string) {
  await message.edit({
    text: `<blockquote>${html}</blockquote>`,
    parseMode: 'html'
  });
}

async function runFfmpeg(args: string[]) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024
    }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`ffmpeg: ${stderr ? String(stderr).trim().slice(-300) : errMsg(err)}`));
        return;
      }
      resolve(undefined);
    });
  });
}

async function probeMedia(file: string) {
  try {
    const out = await new Promise<string>((resolve, reject) => {
      execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], {
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024
      }, (err, stdout) => {
        if (err) {reject(err); return;}
        resolve(typeof stdout === 'string' ? stdout : String(stdout || ''));
      });
    });
    const parsed = JSON.parse(out);
    const vs = (parsed.streams || []).find((s: { codec_type?: string }) => s.codec_type === 'video');
    if (!vs) {return null;}
    return {
      w: Number(vs.width) || 0,
      h: Number(vs.height) || 0,
      duration: Number(vs.duration || (parsed.format && parsed.format.duration) || 0) || 0
    };
  } catch (_e) {
    return null;
  }
}

function tmpFile(ext: string) {
  return path.join(os.tmpdir(), `duserjs_sticker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
}

function unlinkQuiet(p: string) {
  try {
    if (p && fs.existsSync(p)) {fs.unlinkSync(p);}
  } catch (_e) { /* ignore */ }
}

/**
 * Objek media mtcute berbasis dokumen (sticker/video/audio/document). Semua
 * atribut TL lama (DocumentAttributeFilename/Sticker) sudah dinormalkan
 * menjadi getter, jadi pembacaan `doc.attributes` gaya GramJS tidak berlaku.
 */
type MtcuteDoc = {
  type?: string;
  mimeType?: string;
  fileName?: string | null;
  emoji?: string;
  isAnimation?: boolean;
  inputDocument?: unknown;
  raw?: { id?: unknown; accessHash?: unknown; fileReference?: unknown };
} & Record<string, unknown>;

function docFilename(doc: MtcuteDoc | null | undefined): string {
  return doc?.fileName ? String(doc.fileName) : '';
}

function stickerEmojiOf(doc: MtcuteDoc | null | undefined): string {
  return typeof doc?.emoji === 'string' ? doc.emoji : '';
}

function isPictographic(s: unknown) {
  return typeof s === 'string' && /\p{Extended_Pictographic}/u.test(s);
}

function inputDocFrom(doc: MtcuteDoc | null | undefined) {
  // mtcute sudah menyediakan InputDocument siap pakai.
  if (doc?.inputDocument) {return doc.inputDocument;}
  const raw = doc?.raw ?? (doc as MtcuteDoc | undefined);
  return new Api.InputDocument({
    id: raw?.id,
    accessHash: raw?.accessHash,
    fileReference: raw?.fileReference,
  });
}

// Klasifikasi media yang di-reply menjadi { kind, doc, isSticker }
function classifyMedia(msg: UserbotMessageLike) {
  // Di mtcute, `media` ADALAH objeknya sendiri dengan diskriminan `type`;
  // tidak ada `media.photo` / `media.document` seperti di TL mentah, sehingga
  // klasifikasi lama selalu mengembalikan null dan .kang menolak semua media.
  const media = (msg && msg.media) as unknown as MtcuteDoc | null | undefined;
  if (!media) {return null;}
  if (media.type === 'photo') {
    return { kind: 'static', doc: null, isSticker: false };
  }
  const doc = media;
  const mime = String(doc.mimeType || '');
  const fname = docFilename(doc).toLowerCase();
  if (doc.type === 'sticker') {
    if (mime.includes('tgsticker') || fname.endsWith('.tgs')) {
      return { kind: 'anim', doc, isSticker: true };
    }
    if (mime === 'video/webm' || fname.endsWith('.webm')) {
      return { kind: 'video', doc, isSticker: true };
    }
    return { kind: 'static', doc, isSticker: true };
  }
  if (mime.startsWith('image/')) {
    return { kind: 'static', doc, isSticker: false };
  }
  if (mime.startsWith('video/') || doc.isAnimation) {
    return { kind: 'video', doc, isSticker: false };
  }
  return null;
}

function packShortName(me: { id?: string | number; username?: string; firstName?: string }, pack: number, kind: string) {
  const suffix = me.username ? `_by_${me.username}` : `_by_user_${me.id}`;
  const kindTag = kind === 'anim' ? '_anim' : kind === 'video' ? '_video' : '';
  return `kang_${me.id}_v${pack}${kindTag}${suffix}`.toLowerCase();
}

function packTitle(me: { id?: string | number; username?: string; firstName?: string }, pack: number, kind: string) {
  const name = me.firstName || me.username || 'User';
  const tag = kind === 'anim' ? ' (Animated)' : kind === 'video' ? ' (Video)' : '';
  return `${name}'s Kang Pack Vol.${pack}${tag}`;
}

// Cari pack yang punya slot; buat volume baru kalau penuh.
async function resolvePack(client: CompatClient, me: { id?: string | number; username?: string; firstName?: string }, kind: string, startPack: number) {
  let pack = Math.max(1, startPack);
  for (let attempt = 0; attempt < 10; attempt++) {
    const shortName = packShortName(me, pack, kind);
    let existing = null;
    try {
      const res = await client.invoke(new Api.messages.GetStickerSet({
        stickerset: new Api.InputStickerSetShortName({ shortName }),
        hash: 0
      }));
      existing = (res as { set?: unknown } | undefined)?.set ?? null;
    } catch (e) {
      if (!/STICKERSET_INVALID|SHORTNAME|SHORT_NAME/i.test(errMsg(e))) {throw e;}
    }
    if (!existing) {
      return { pack, shortName, title: packTitle(me, pack, kind), existing: null };
    }
    if (((existing as { count?: number }).count || 0) < (PACK_LIMITS[kind] || PACK_LIMITS.static)) {
      return { pack, shortName, title: packTitle(me, pack, kind), existing };
    }
    pack += 1; // pack penuh -> volume berikutnya
  }
  throw new Error('Tidak ada slot pack yang tersedia');
}

async function invokeAddSticker(client: CompatClient, packInfo: { pack: number; shortName: string; title: string; existing: { id?: unknown; accessHash?: unknown } | null }, stickerItem: unknown) {
  if (packInfo.existing) {
    await client.invoke(new Api.stickers.AddStickerToSet({
      stickerset: new Api.InputStickerSetID({
        id: packInfo.existing.id,
        accessHash: packInfo.existing.accessHash
      }),
      sticker: stickerItem
    }));
    return;
  }
  await client.invoke(new Api.stickers.CreateStickerSet({
    userId: new Api.InputUserSelf(),
    title: packInfo.title,
    shortName: packInfo.shortName,
    stickers: [stickerItem]
  }));
}

// Upload file sementara ke Saved Messages untuk mendapat InputDocument,
// lalu langsung dihapus lagi. (Pola yang sama dengan kang.ts)
async function uploadTempAsDocument(client: CompatClient, filePath: string, attributes: unknown[] | null = null) {
  const sent = await client.sendFile('me', {
    file: filePath,
    forceDocument: true,
    attributes: attributes && attributes.length ? attributes : undefined
  });
  // sendFile() mengembalikan Message; medianya langsung objek dokumen mtcute.
  const doc = (sent && sent.media) as unknown as MtcuteDoc | undefined;
  if (!doc) {throw new Error('Upload ke Saved Messages gagal');}
  try { await client.deleteMessages('me', [sent.id], { revoke: true }); } catch (_e) { /* ignore */ }
  return inputDocFrom(doc);
}

// Fallback: re-upload ulang bytes dokumen sticker asli (kalau referensi
// langsung ditolak Telegram karena file_reference/ownership).
function makeStickerUploadFallback(client: CompatClient, currentMsg: UserbotMessageLike, kind: string, tmpFiles: string[]) {
  return async () => {
    const buf = await downloadMediaBuffer(client, currentMsg);
    if (!buf || !buf.length) {throw new Error('Gagal mengunduh media sticker');}
    const ext = kind === 'anim' ? '.tgs' : kind === 'video' ? '.webm' : '.webp';
    const p = tmpFile(ext);
    tmpFiles.push(p);
    fs.writeFileSync(p, buf);
    let attributes;
    if (kind === 'anim') {
      attributes = [new Api.DocumentAttributeAnimated(), new Api.DocumentAttributeFilename({ fileName: 'kang.tgs' })];
    } else if (kind === 'video') {
      const probe = await probeMedia(p);
      attributes = [
        new Api.DocumentAttributeVideo({
          duration: Math.min(VIDEO_STICKER_MAX_SEC, (probe && probe.duration) || VIDEO_STICKER_MAX_SEC),
          w: (probe && probe.w) || STICKER_MAX_EDGE,
          h: (probe && probe.h) || STICKER_MAX_EDGE
        }),
        new Api.DocumentAttributeFilename({ fileName: 'kang.webm' })
      ];
    } else {
      attributes = [new Api.DocumentAttributeFilename({ fileName: 'kang.webp' })];
    }
    return uploadTempAsDocument(client, p, attributes);
  };
}

// Foto/gambar biasa -> resize 512 via Jimp (fallback ffmpeg) -> upload.
async function buildStaticFromImage(client: CompatClient, currentMsg: UserbotMessageLike, tmpFiles: string[], telegramId: number) {
  const buf = await downloadMediaBuffer(client, currentMsg);
  if (!buf || !buf.length) {throw new Error('Gagal mengunduh media');}
  const srcPath = tmpFile('.bin');
  tmpFiles.push(srcPath);
  fs.writeFileSync(srcPath, buf);

  let outPath;
  try {
    const image = await Jimp.read(srcPath);
    image.scaleToFit({ w: STICKER_MAX_EDGE, h: STICKER_MAX_EDGE });
    outPath = tmpFile('.png');
    // Jimp mensyaratkan path bertipe template `${string}.${string}`.
    await image.write(outPath as `${string}.${string}`);
  } catch (e) {
    Logger.logUser(telegramId, `kang: Jimp gagal (${errMsg(e)}), mencoba ffmpeg`, 'WARN');
    outPath = tmpFile('.webp');
    await runFfmpeg([
      '-i', srcPath,
      '-vf', `scale=${STICKER_MAX_EDGE}:${STICKER_MAX_EDGE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-c:v', 'libwebp', '-lossless', '1',
      outPath
    ]);
  }
  tmpFiles.push(outPath);
  return uploadTempAsDocument(client, outPath);
}

// Video biasa -> konversi webm 512px (VP9, maks 3 detik) -> upload.
async function buildVideoFromMedia(client: CompatClient, currentMsg: UserbotMessageLike, tmpFiles: string[]) {
  const buf = await downloadMediaBuffer(client, currentMsg);
  if (!buf || !buf.length) {throw new Error('Gagal mengunduh media');}
  const srcPath = tmpFile('.bin');
  tmpFiles.push(srcPath);
  fs.writeFileSync(srcPath, buf);
  const outPath = tmpFile('.webm');
  tmpFiles.push(outPath);
  await runFfmpeg([
    '-i', srcPath,
    '-t', String(VIDEO_STICKER_MAX_SEC),
    '-vf', `scale=${STICKER_MAX_EDGE}:${STICKER_MAX_EDGE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-an',
    outPath
  ]);
  const probe = await probeMedia(outPath);
  const attributes = [
    new Api.DocumentAttributeVideo({
      duration: Math.min(VIDEO_STICKER_MAX_SEC, (probe && probe.duration) || VIDEO_STICKER_MAX_SEC),
      w: (probe && probe.w) || STICKER_MAX_EDGE,
      h: (probe && probe.h) || STICKER_MAX_EDGE
    }),
    new Api.DocumentAttributeFilename({ fileName: 'kang.webm' })
  ];
  return uploadTempAsDocument(client, outPath, attributes);
}

// Tambahkan satu stiker ke pack; kalau referensi langsung ditolak,
// coba sekali lagi lewat fallback re-upload.
async function addStickerToPack(client: CompatClient, packInfo: { pack: number; shortName: string; title: string; existing: { id?: unknown; accessHash?: unknown } | null }, candidate: { ref: unknown; fallback?: (() => Promise<unknown>) | null }, emoji: string) {
  const stickerItem = new Api.InputStickerSetItem({ document: candidate.ref, emoji });
  try {
    await invokeAddSticker(client, packInfo, stickerItem);
  } catch (e) {
    const retryable = /DOCUMENT_INVALID|FILE_REFERENCE|FILE_PARTS|PARTS_INVALID|MEDIA_INVALID/i.test(errMsg(e));
    if (!candidate.fallback || !retryable) {throw e;}
    const freshRef = await candidate.fallback();
    await invokeAddSticker(client, packInfo, new Api.InputStickerSetItem({ document: freshRef, emoji }));
  }
}

export default {
  name: 'stickers',
  version: '1.0.0',
  description: 'Kang sticker/foto/video ke pack pribadi & buat quote sticker via @QuotLyBot.',
  help: {
    title: 'Sticker & Quote Tools (.kang / .q / .quote)',
    description: 'Mencuri (kang) sticker/foto/video ke pack pribadi Anda dan membuat quote sticker dari pesan yang di-reply.',
    usage: '• Balas media lalu ketik `.kang [emoji] [nomor_pack]`\n• Balas pesan lalu ketik `.q` atau `.quote` [jumlah_pesan]',
    detail: '.kang menyalin media ke pack pribadi Anda secara instan: sticker webp/tgs/webm langsung disalin, foto & gambar di-resize 512px, video dikonversi webm maksimal 3 detik. `.q` atau `.quote` membuat quote stiker kutipan dari pesan yang di-reply via @QuotLyBot (bisa juga `.q N` untuk multi-quote N pesan berurutan, maks 10).'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, _settings: UserbotSettings, telegramId: number) {
    if (!message.out || !message.message) {return;}
    const text = message.message.trim();

    // ------------------------- .kang -------------------------
    if (/^\.kang(?:\s|$)/i.test(text)) {
      const parts = text.split(/\s+/).slice(1);
      let emojiArg = null;
      let startPack = 1;
      if (parts[0]) {
        if (/^\d+$/.test(parts[0])) {
          startPack = Math.max(1, parseInt(parts[0], 10));
        } else {
          emojiArg = parts[0];
          if (parts[1] && /^\d+$/.test(parts[1])) {
            startPack = Math.max(1, parseInt(parts[1], 10));
          }
        }
      }

      const replied = await message.getReplyMessage();
      if (!replied || !replied.media) {
        await editStatus(message, '❌ <b>Gagal:</b> Balas ke sebuah sticker/foto/video/gif untuk melakukan kang!');
        return;
      }

      // Kumpulkan item yang akan di-kang (dukung album foto/media group)
      let mediaMessages: UserbotMessageLike[] = [replied];
      if (replied.groupedId) {
        await editStatus(message, '⏳ <b>Menganalisis album media...</b>');
        try {
          const peer = message.peerId ?? message.chatId;
          const history = await client.getMessages(toPeer(peer), { limit: 20, offsetId: (replied.id ?? 0) + 10 });
          const grouped = (history || []).filter(m =>
            m && m.groupedId && String(m.groupedId) === String(replied.groupedId) && m.media
          );
          if (grouped.length > 0) {
            mediaMessages = grouped.sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0)) as unknown as UserbotMessageLike[];
          }
        } catch (e) {
          Logger.logUser(telegramId, `kang: album scan gagal (${errMsg(e)}), pakai pesan tunggal`, 'WARN');
        }
      }

      const items = [];
      for (const m of mediaMessages) {
        const c = classifyMedia(m);
        if (c) {items.push({ msg: m, cls: c });}
      }
      if (items.length === 0) {
        await editStatus(message, '❌ <b>Gagal:</b> Format media tidak didukung. Balas sticker (webp/tgs/webm), foto, gambar, atau video/gif.');
        return;
      }

      const me = await client.getMe();
      const total = items.length;
      const packCounters: Record<string, number> = { static: startPack, anim: startPack, video: startPack };
      const resultLinks = [];
      let successCount = 0;

      try {
        await editStatus(message, `📥 <b>Mencuri (kang) media...</b> [1/${escapeHtml(String(total))}]`);

        for (let i = 0; i < total; i++) {
          const { msg: currentMsg, cls } = items[i];
          const tmpFiles: string[] = [];
          try {
            if (i > 0) {
              await editStatus(message, `📥 <b>Mencuri (kang) media...</b> [${escapeHtml(String(i + 1))}/${escapeHtml(String(total))}]`);
            }

            // Tentukan emoji
            let emoji = isPictographic(emojiArg) ? emojiArg : '';
            if (!emoji && cls.isSticker && cls.doc) {
              const alt = stickerEmojiOf(cls.doc);
              if (isPictographic(alt)) {emoji = alt;}
            }
            if (!emoji) {
              emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            }

            // Siapkan referensi dokumen (langsung dari pesan, atau hasil upload)
            let candidate;
            if (cls.isSticker && cls.doc) {
              candidate = {
                ref: inputDocFrom(cls.doc),
                fallback: makeStickerUploadFallback(client, currentMsg, cls.kind, tmpFiles)
              };
            } else if (cls.kind === 'video') {
              candidate = { ref: await buildVideoFromMedia(client, currentMsg, tmpFiles), fallback: null };
            } else {
              candidate = { ref: await buildStaticFromImage(client, currentMsg, tmpFiles, telegramId), fallback: null };
            }

            // Resolve pack (per jenis) lalu tambahkan stiker
            const packInfo = await resolvePack(client, me as unknown as { id?: string | number; username?: string; firstName?: string }, cls.kind, packCounters[cls.kind] ?? 1);
            await addStickerToPack(client, packInfo, candidate, emoji);
            packCounters[cls.kind] = packInfo.pack;
            resultLinks.push({ kind: cls.kind, shortName: packInfo.shortName, pack: packInfo.pack });
            successCount++;
          } finally {
            for (const p of tmpFiles) {unlinkQuiet(p);}
          }

          if (i < total - 1) {
            await new Promise(r => setTimeout(r, 1000)); // jeda anti-flood
          }
        }

        // Ringkasan hasil + link pack per jenis
        const seen = new Set();
        const linkParts = [];
        for (const r of resultLinks) {
          const key = r.shortName;
          if (seen.has(key)) {continue;}
          seen.add(key);
          const label = r.kind === 'anim' ? 'Animated' : r.kind === 'video' ? 'Video' : 'Static';
          linkParts.push(
            `<a href="https://t.me/addstickers/${escapeHtml(r.shortName)}">Vol.${escapeHtml(String(r.pack))} (${label})</a>`
          );
        }
        const linksHtml = linkParts.slice(0, 5).join(' • ');
        await editStatus(
          message,
          `✅ <b>Kang Berhasil!</b>\n${escapeHtml(String(successCount))} stiker ditambahkan ke pack Anda.\n\n👉 ${linksHtml}`
        );
      } catch (err) {
        Logger.logUser(telegramId, `Error in stickers plugin (kang): ${errMsg(err)}`, 'ERROR');
        await editStatus(
          message,
          `❌ <b>Terjadi kesalahan saat kang:</b>\n<i>${escapeHtml(errMsg(err))}</i>`
        );
      }
      return;
    }

    // ------------------------- .q / .quote (single & multi-quote) -------------------------
    const qMatch = text.match(/^\.q(?:uote)?(?:\s+(\d+))?$/i);
    if (qMatch) {
      const replied = await message.getReplyMessage();
      if (!replied) {
        await editStatus(message, '❌ <b>Gagal:</b> Balas sebuah pesan (teks/media) untuk membuat quote!');
        return;
      }

      try {
        await editStatus(message, '⏳ <b>Membuat quote...</b>');

        // Pastikan @QuotLyBot tidak diblokir (pola dari PyroUbot)
        try {
          // mtcute: resolvePeer(); getInputEntity() adalah nama GramJS.
          const quotlyPeer = await client.resolvePeer(QUOTLY);
          await client.invoke(new Api.contacts.Unblock({ id: quotlyPeer }));
        } catch (_e) { /* ignore */ }

        // Kumpulkan pesan yang akan di-quote (multi-quote bila ada argumen angka)
        const n = qMatch[1] ? Math.min(10, Math.max(1, parseInt(qMatch[1], 10))) : 1;
        let targets: UserbotMessageLike[] = [replied];
        if (n > 1) {
          const peer = message.peerId ?? message.chatId;
          const ids = Array.from({ length: n }, (_, i) => (replied.id ?? 0) + i);
          const fetched = await client.getMessages(toPeer(peer), { ids });
          targets = ((fetched || []).filter(Boolean) as unknown as UserbotMessageLike[]).sort((a, b) => Number(a.id) - Number(b.id));
          if (targets.length === 0) {targets = [replied];}
        }

        // Forward ke @QuotLyBot satu per satu agar multi-quote terbentuk
        for (const t of targets) {
          // mtcute: forwardMessagesById({ fromChatId, toChatId, messages }).
          // Bentuk lama (peer posisional + fromPeer) tidak pernah valid.
          await client.forwardMessagesById({
            fromChatId: toPeer(message.peerId ?? message.chatId),
            toChatId: QUOTLY,
            messages: [Number(t.id ?? 0)],
          });
          await new Promise(r => setTimeout(r, 300));
        }

        // Tunggu balasan sticker dari @QuotLyBot (maksimal 15 detik)
        let quoteMsg = null;
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const history = await client.getMessages(QUOTLY, { limit: 1 });
          const quoteCandidate = history[0] as unknown as { media?: MtcuteDoc; date?: Date | number; id: number } | undefined;
          if (quoteCandidate?.media) {
            const mime = String(quoteCandidate.media.mimeType || '');
            const quoteTs = Math.floor(new Date(quoteCandidate.date ?? 0).getTime() / 1000);
            if (mime.startsWith('image/') && quoteTs >= Number(message.date) - 2) {
              quoteMsg = quoteCandidate;
              break;
            }
          }
        }

        if (!quoteMsg) {
          await editStatus(message, '❌ <b>Gagal:</b> @QuotLyBot tidak merespon. Coba lagi nanti.');
          return;
        }

        // Kirim sticker quote ke chat asal
        await client.sendMessage(toPeer(message.peerId), {
          message: '',
          file: quoteMsg.media,
          replyTo: message.replyToMsgId
        });
        try { await message.delete(); } catch (_e) { /* ignore */ }

        // Bersihkan riwayat chat dengan @QuotLyBot (pola PyroUbot)
        try {
          // mtcute: resolvePeer(); getInputEntity() adalah nama GramJS.
          const quotlyPeer = await client.resolvePeer(QUOTLY);
          await client.invoke(new Api.messages.DeleteHistory({
            peer: quotlyPeer,
            maxId: 0,
            revoke: true
          }));
        } catch (_e) { /* ignore */ }
      } catch (err) {
        Logger.logUser(telegramId, `Error in stickers plugin (q): ${errMsg(err)}`, 'ERROR');
        await editStatus(
          message,
          `❌ <b>Gagal membuat quote:</b>\n<i>${escapeHtml(errMsg(err))}</i>`
        );
      }
    }
  }
};
