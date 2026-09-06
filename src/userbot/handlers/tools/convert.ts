import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

const execFileAsync = promisify(execFile);

const FFMPEG = '/usr/bin/ffmpeg';
const FFPROBE = '/usr/bin/ffprobe';
const MAX_DURATION = 120; // detik — batas video pendek untuk togif
const TMP_DIR = path.join(os.tmpdir(), 'deltauserjs-convert');

/** Jalankan ffmpeg via execFile (tanpa shell). Melempar Error dengan stderr ringkas. */
async function runFfmpeg(args) {
  try {
    await execFileAsync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      timeout: 90_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err
      ? String(err.stderr).split('\n').filter(Boolean).slice(-2).join(' | ')
      : '';
    throw new Error(`ffmpeg gagal${stderr ? `: ${stderr}` : ''}`, { cause: err });
  }
}

/** Probe durasi video & keberadaan stream audio via ffprobe. */
async function probeVideo(filePath) {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath],
    { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
  );
  const data = JSON.parse(stdout);
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const video = streams.find((s) => s.codec_type === 'video');
  let duration = 0;
  const fmtDur = parseFloat(data.format && data.format.duration);
  if (!Number.isNaN(fmtDur) && fmtDur > 0) {
    duration = fmtDur;
  } else if (video && video.duration) {
    duration = parseFloat(video.duration) || 0;
  }
  return { hasAudio, duration, width: video ? video.width || 0 : 0, height: video ? video.height || 0 : 0 };
}

/** Hapus file temp dengan aman (abaikan error). */
function cleanup(...files) {
  for (const f of files) {
    if (!f) {continue;}
    try {
      if (fs.existsSync(f)) {fs.unlinkSync(f);}
    } catch (_e) { /* ignore */ }
  }
}

/** Pesan proses dengan blockquote (gaya plugin lain). */
function procText(text) {
  return `<blockquote>⏳ ${text}</blockquote>`;
}

async function editProcess(message, text) {
  await message.edit({ text: procText(text), parseMode: 'html' });
}

async function editError(message, text) {
  await message.edit({
    text: `<blockquote>❌ <b>Gagal:</b> ${escapeHtml(text)}</blockquote>`,
    parseMode: 'html',
  });
}

async function editSuccess(message, text) {
  await message.edit({
    text: `<blockquote>✅ <b>Berhasil!</b> ${text}</blockquote>`,
    parseMode: 'html',
  });
}

/** Ambil pesan yang di-reply (null jika tidak ada). */
async function getReplied(message) {
  try {
    return await message.getReplyMessage();
  } catch (_e) {
    return null;
  }
}

/** Download media sebagai Buffer (tolak jika kosong). */
async function downloadBuffer(client, replied) {
  const buffer = await client.downloadMedia(replied, {});
  if (!buffer || buffer.length === 0) {
    throw new Error('gagal mengunduh media');
  }
  return buffer;
}

/** Simpan Buffer ke file temp dengan ekstensi tertentu, kembalikan path. */
function bufferToTempFile(buffer, filename) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/** Reply target untuk pesan hasil (reply ke perintah .toxxx). */
function replyToId(message) {
  return message.replyToMsgId || message.id;
}

// ============================================================
// .toimg — sticker (webp/tgs) / gif / animasi → foto
// ============================================================
async function handleToImg(client, message, telegramId) {
  const replied = await getReplied(message);
  if (!replied || !replied.media) {
    await editError(message, 'Balas sebuah sticker atau GIF untuk diubah ke foto!');
    return;
  }
  const doc = replied.document;
  const isSticker = !!replied.sticker;
  const isGif = !!replied.gif;
  const isWebpDoc = !!(doc && doc.mimeType === 'image/webp');
  if (!isSticker && !isGif && !isWebpDoc) {
    await editError(message, 'Media yang dibalas bukan sticker/GIF. Gunakan .toimg pada sticker webp atau GIF.');
    return;
  }

  await editProcess(message, '<b>Mengunduh media...</b>');

  let tmpPath = null;
  try {
    const buffer = await downloadBuffer(client, replied);
    const stickerAnim = isSticker && doc && (doc.mimeType === 'application/x-tgsticker');
    tmpPath = bufferToTempFile(buffer, `toimg_${Date.now()}.webp`);

    // Sticker webp statis bisa langsung dikirim sebagai photo — Telegram
    // menerimanya. Sticker animasi (tgs) dan GIF dikonversi ke PNG dulu.
    if (!stickerAnim && !isGif) {
      await client.sendFile(message.chatId, {
        file: tmpPath,
        forceDocument: false,
        replyTo: replyToId(message),
      });
    } else {
      await editProcess(message, '<b>Mengonversi ke gambar...</b>');
      const pngPath = path.join(TMP_DIR, `toimg_${Date.now()}.png`);
      try {
        await runFfmpeg(['-i', tmpPath, '-frames:v', '1', pngPath]);
        await client.sendFile(message.chatId, {
          file: pngPath,
          forceDocument: false,
          replyTo: replyToId(message),
        });
        cleanup(pngPath);
      } catch (err) {
        cleanup(pngPath);
        throw err;
      }
    }
    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, 'Media dikirim sebagai foto.');
  } catch (err) {
    Logger.logUser(telegramId, `Error in convert.toimg: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    cleanup(tmpPath);
  }
}

// ============================================================
// .tosticker — foto / video pendek → sticker webp
// ============================================================
async function handleToSticker(client, message, telegramId) {
  const replied = await getReplied(message);
  if (!replied || !replied.media) {
    await editError(message, 'Balas sebuah foto atau video pendek untuk diubah ke sticker!');
    return;
  }
  const isPhoto = !!replied.photo;
  const video = replied.video || replied.videoNote || replied.gif;
  const isVideo = !!video;
  if (!isPhoto && !isVideo) {
    await editError(message, 'Media yang dibalas bukan foto/video. Gunakan .tosticker pada foto atau video pendek.');
    return;
  }

  await editProcess(message, '<b>Mengunduh media...</b>');

  let tmpPath = null;
  let outPath = null;
  try {
    const buffer = await downloadBuffer(client, replied);
    tmpPath = bufferToTempFile(buffer, `tostick_${Date.now()}${isPhoto ? '.img' : '.mp4'}`);
    outPath = path.join(TMP_DIR, `tostick_${Date.now()}.webp`);

    if (isPhoto) {
      // Foto: cukup konversi/resize ke webp 512 via ffmpeg
      await editProcess(message, '<b>Mengonversi ke webp...</b>');
      await runFfmpeg([
        '-i', tmpPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos',
        '-c:v', 'libwebp', '-quality', '90',
        outPath,
      ]);
    } else {
      // Video pendek: konversi ke animated webp (sticker video)
      await editProcess(message, '<b>Mengecek durasi video...</b>');
      const info = await probeVideo(tmpPath);
      if (info.duration > MAX_DURATION) {
        await editError(message, `Video terlalu panjang (${info.duration.toFixed(1)}s). Maksimal ${MAX_DURATION}s untuk sticker.`);
        return;
      }
      await editProcess(message, '<b>Mengonversi video ke webp animasi...</b>');
      await runFfmpeg([
        '-t', String(MAX_DURATION),
        '-i', tmpPath,
        '-vf', `fps=15,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos`,
        '-c:v', 'libwebp', '-quality', '80', '-loop', '0', '-an',
        outPath,
      ]);
    }

    await editProcess(message, '<b>Mengunggah sticker...</b>');
    await client.sendFile(message.chatId, {
      file: outPath,
      forceDocument: false,
      replyTo: replyToId(message),
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, 'Media dikirim sebagai sticker.');
  } catch (err) {
    Logger.logUser(telegramId, `Error in convert.tosticker: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    cleanup(tmpPath, outPath);
  }
}

// ============================================================
// .toaudio — video / voice → audio mp3 (dikirim sebagai voice note)
// ============================================================
async function handleToAudio(client, message, telegramId) {
  const replied = await getReplied(message);
  if (!replied || !replied.media) {
    await editError(message, 'Balas sebuah video/voice untuk diekstrak audionya!');
    return;
  }
  const hasVideo = !!(replied.video || replied.videoNote || replied.gif);
  const hasVoice = !!(replied.voice || replied.audio);
  const hasAudioDoc = !!(replied.document && typeof replied.document.mimeType === 'string' && replied.document.mimeType.startsWith('audio/'));
  if (!hasVideo && !hasVoice && !hasAudioDoc) {
    await editError(message, 'Media yang dibalas bukan video/voice. Gunakan .toaudio pada video atau pesan suara.');
    return;
  }

  await editProcess(message, '<b>Mengunduh media...</b>');

  let tmpPath = null;
  let outPath = null;
  try {
    const buffer = await downloadBuffer(client, replied);
    tmpPath = bufferToTempFile(buffer, `toaudio_${Date.now()}`);
    outPath = path.join(TMP_DIR, `toaudio_${Date.now()}.mp3`);

    await editProcess(message, '<b>Mengekstrak audio (mp3)...</b>');
    // -vn buang video, -q:a 0 kualitas VBR tertinggi (pola modul convert.py asli)
    await runFfmpeg(['-i', tmpPath, '-vn', '-map', 'a:0', '-acodec', 'libmp3lame', '-q:a', '0', outPath]);

    await editProcess(message, '<b>Mengunggah voice note...</b>');
    await client.sendFile(message.chatId, {
      file: outPath,
      voiceNote: true,
      replyTo: replyToId(message),
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, 'Audio dikirim sebagai voice note (mp3).');
  } catch (err) {
    Logger.logUser(telegramId, `Error in convert.toaudio: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    cleanup(tmpPath, outPath);
  }
}

// ============================================================
// .togif — video pendek TANPA audio → mp4 animasi
// ============================================================
async function handleToGif(client, message, telegramId) {
  const replied = await getReplied(message);
  if (!replied || !replied.media) {
    await editError(message, 'Balas sebuah video pendek untuk diubah ke animasi!');
    return;
  }
  const video = replied.video || replied.videoNote || replied.gif;
  if (!video) {
    await editError(message, 'Media yang dibalas bukan video. Gunakan .togif pada video pendek tanpa audio.');
    return;
  }

  await editProcess(message, '<b>Mengunduh video...</b>');

  let tmpPath = null;
  let outPath = null;
  try {
    const buffer = await downloadBuffer(client, replied);
    tmpPath = bufferToTempFile(buffer, `togif_${Date.now()}.mp4`);

    await editProcess(message, '<b>Mengecek durasi & stream audio...</b>');
    const info = await probeVideo(tmpPath);
    if (info.duration > MAX_DURATION) {
      await editError(message, `Video terlalu panjang (${info.duration.toFixed(1)}s). Maksimal ${MAX_DURATION}s untuk animasi.`);
      return;
    }
    if (info.hasAudio) {
      await editError(message, 'Video memiliki audio — .togif hanya untuk video tanpa audio. Gunakan .toaudio untuk mengekstrak audionya.');
      return;
    }

    await editProcess(message, '<b>Mengonversi ke animasi (mp4, -an)...</b>');
    outPath = path.join(TMP_DIR, `togif_${Date.now()}_anim.mp4`);
    await runFfmpeg([
      '-i', tmpPath,
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-movflags', 'faststart',
      outPath,
    ]);

    await editProcess(message, '<b>Mengunggah animasi...</b>');
    await client.sendFile(message.chatId, {
      file: outPath,
      forceDocument: false,
      attributes: [new Api.DocumentAttributeAnimated()],
      replyTo: replyToId(message),
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, 'Video dikirim sebagai animasi (GIF).');
  } catch (err) {
    Logger.logUser(telegramId, `Error in convert.togif: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    cleanup(tmpPath, outPath);
  }
}

// ============================================================
// Plugin utama — satu file, multi command (.toimg/.tosticker/.toaudio/.togif)
// ============================================================
export default {
  name: 'convert',
  version: '1.0.0',
  description: 'Konversi media: sticker↔foto, foto/video→sticker, video→audio, video→animasi.',
  help: {
    title: 'Media Convert (.toimg / .tosticker / .toaudio / .togif)',
    description: 'Konversi media yang dibalas: sticker jadi foto, foto/video jadi sticker, video jadi voice note mp3, atau video jadi animasi.',
    usage: '• `.toimg` — balas sticker/GIF → kirim sebagai foto.\n• `.tosticker` — balas foto/video pendek → kirim sebagai sticker webp.\n• `.toaudio` — balas video/voice → ekstrak audio mp3, kirim sebagai voice note.\n• `.togif` — balas video pendek TANPA audio → kirim sebagai animasi (GIF).',
    detail: 'Semua konversi memakai ffmpeg (v6) di server: foto→webp 512px, video→animated webp 15fps, audio diekstrak ke mp3 (libmp3lame), video→mp4 H.264 tanpa audio. Maksimal durasi video: 120 detik. Pesan perintah otomatis dihapus setelah sukses.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().toLowerCase().match(/^\.to(img|sticker|audio|gif)\b/);
    if (!match) {return;}

    switch (match[1]) {
      case 'img':
        await handleToImg(client, message, telegramId);
        break;
      case 'sticker':
        await handleToSticker(client, message, telegramId);
        break;
      case 'audio':
        await handleToAudio(client, message, telegramId);
        break;
      case 'gif':
        await handleToGif(client, message, telegramId);
        break;
    }
  }
};
