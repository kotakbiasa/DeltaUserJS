import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from '../../../utils/logger.js';

const execFileAsync = promisify(execFile);

const ZIP_BIN = '/usr/bin/zip';
const UNZIP_BIN = '/usr/bin/unzip';
const PYTHON_BIN = '/usr/bin/python3';
const TMP_DIR = path.join(os.tmpdir(), 'deltauserjs-ziptools');
const MAX_SIZE = 1900 * 1024 * 1024; // ~1.9 GB — batas aman unggah Telegram (bot 2 GB)

const fileExists = (p: string): boolean => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch (_e) {
    return false;
  }
};

const hasZipBin = fileExists(ZIP_BIN);
const hasUnzipBin = fileExists(UNZIP_BIN);
// /usr/bin/python3 tersedia di host (python3.12); fallback dipakai hanya jika zip binary absen.
const hasPython = fileExists(PYTHON_BIN);

interface RunResult {
  ok: boolean;
  stderr: string;
}

/** execFile tanpa shell; stderr diambil dari error bila exit non-zero. */
async function run(bin: string, args: string[]): Promise<RunResult> {
  try {
    await execFileAsync(bin, args, {
      timeout: 5 * 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, stderr: '' };
  } catch (err) {
    const e = err as { stderr?: unknown; message?: unknown };
    const stderr = typeof e?.stderr === 'string' && e.stderr
      ? e.stderr.split('\n').filter(Boolean).slice(-2).join(' | ')
      : (typeof e?.message === 'string' ? e.message.split('\n').filter(Boolean).slice(-1).join('') : '');
    return { ok: false, stderr };
  }
}

/** Hapus path (file atau folder) dengan aman, abaikan error. */
function rmrf(p: string | null): void {
  if (!p) {return;}
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  } catch (_e) { /* ignore */ }
}

function procText(text: string): string {
  return `<blockquote>⏳ ${text}</blockquote>`;
}

async function editProcess(message: any, text: string): Promise<void> {
  await message.edit({ text: procText(text), parseMode: 'html' });
}

async function editError(message: any, text: string): Promise<void> {
  await message.edit({
    text: `<blockquote>❌ <b>Gagal:</b> ${text}</blockquote>`,
    parseMode: 'html',
  });
}

async function editSuccess(message: any, text: string): Promise<void> {
  await message.edit({
    text: `<blockquote>✅ <b>Berhasil!</b> ${text}</blockquote>`,
    parseMode: 'html',
  });
}

async function getReplied(message: any): Promise<any | null> {
  try {
    return await message.getReplyMessage();
  } catch (_e) {
    return null;
  }
}

function replyToId(message: any): number {
  return message.replyToMsgId || message.id;
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;}
  if (bytes >= 1024 * 1024) {return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;}
  if (bytes >= 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${bytes} B`;
}

/** Download media replied ke file temp; lempar Error bila gagal/kosong. */
async function downloadToTemp(client: any, replied: any, filename: string): Promise<string> {
  const buffer = await client.downloadMedia(replied, {});
  if (!buffer || buffer.length === 0) {
    throw new Error('gagal mengunduh media');
  }
  if (buffer.length > MAX_SIZE) {
    throw new Error(`file terlalu besar (${humanSize(buffer.length)}, maksimal ${humanSize(MAX_SIZE)})`);
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ============================================================
// .zip — reply file/dokumen → zip jadi arsip → kirim
// ============================================================
async function handleZip(client: any, message: any, telegramId: number): Promise<void> {
  const replied = await getReplied(message);
  if (!replied || !replied.media) {
    await editError(message, 'Balas sebuah file/dokumen untuk di-zip! (semua file mendukung)');
    return;
  }
  const doc = replied.document;
  if (!doc) {
    await editError(message, 'Balas sebuah file/dokumen untuk di-zip! (bukan foto/video tanpa dokumen)');
    return;
  }
  const rawName: string = (typeof replied.file?.name === 'string' && replied.file.name)
    ? replied.file.name
    : 'file';
  const baseName = rawName.replace(/\.[^.]*$/, '') || 'file';
  const stamp = Date.now();
  const safeBase = baseName.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'file';

  await editProcess(message, '<b>Mengunduh file...</b>');

  let tmpFile: string | null = null;
  let outPath: string | null = null;
  try {
    tmpFile = await downloadToTemp(client, replied, `zip_${stamp}_${path.basename(safeBase)}`);

    await editProcess(message, '<b>Membuat arsip zip...</b>');
    outPath = path.join(TMP_DIR, `zip_${stamp}_${safeBase}.zip`);
    if (hasZipBin) {
      const r = await run(ZIP_BIN, ['-j', '-q', outPath, tmpFile]);
      if (!r.ok) {throw new Error(`zip gagal${r.stderr ? `: ${r.stderr}` : ''}`);}
    } else if (hasPython) {
      const r = await run(PYTHON_BIN, ['-m', 'zipfile', '-c', outPath, tmpFile]);
      if (!r.ok) {throw new Error(`zipfile gagal${r.stderr ? `: ${r.stderr}` : ''}`);}
    } else {
      throw new Error('binary zip tidak tersedia dan python3 tidak ditemukan');
    }

    await editProcess(message, '<b>Mengunggah arsip...</b>');
    await client.sendFile(message.chatId, {
      file: outPath,
      forceDocument: true,
      caption: `<code>${safeBase}.zip</code>`,
      parseMode: 'html',
      replyTo: replyToId(message),
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, 'File di-zip dan dikirim sebagai dokumen.');
  } catch (err) {
    Logger.logUser(telegramId, `Error in zip.cmd: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    rmrf(tmpFile);
    rmrf(outPath);
  }
}

// ============================================================
// .unzip — reply arsip zip → extract → kirim isi satu per satu
// ============================================================
async function handleUnzip(client: any, message: any, telegramId: number): Promise<void> {
  const replied = await getReplied(message);
  if (!replied || !replied.media || !replied.document) {
    await editError(message, 'Balas sebuah arsip .zip untuk diekstrak!');
    return;
  }
  const doc = replied.document;
  const mime: string = typeof doc.mimeType === 'string' ? doc.mimeType : '';
  const fname: string = (typeof replied.file?.name === 'string' && replied.file.name)
    ? replied.file.name.toLowerCase()
    : '';
  const looksZip = fname.endsWith('.zip') || mime === 'application/zip' || mime === 'application/x-zip-compressed';
  if (!looksZip) {
    await editError(message, 'Media yang dibalas bukan arsip .zip (cek nama file/mime).');
    return;
  }

  const stamp = Date.now();
  const sentNames: string[] = [];

  await editProcess(message, '<b>Mengunduh arsip...</b>');

  let zipPath: string | null = null;
  let extractDir: string | null = null;
  try {
    zipPath = await downloadToTemp(client, replied, `unzip_${stamp}.zip`);

    await editProcess(message, '<b>Mengekstrak arsip...</b>');
    extractDir = path.join(TMP_DIR, `unzip_${stamp}`);
    fs.mkdirSync(extractDir, { recursive: true });
    if (hasUnzipBin) {
      const r = await run(UNZIP_BIN, ['-o', '-qq', zipPath, '-d', extractDir]);
      if (!r.ok) {throw new Error(`unzip gagal${r.stderr ? `: ${r.stderr}` : ''}`);}
    } else if (hasPython) {
      const r = await run(PYTHON_BIN, ['-m', 'zipfile', '-e', zipPath, extractDir]);
      if (!r.ok) {throw new Error(`zipfile gagal${r.stderr ? `: ${r.stderr}` : ''}`);}
    } else {
      throw new Error('binary unzip tidak tersedia dan python3 tidak ditemukan');
    }

    // Kumpulkan semua file hasil ekstraksi (walk rekursif).
    const files: string[] = [];
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          files.push(full);
        }
      }
    };
    walk(extractDir);
    files.sort();

    if (files.length === 0) {
      await editError(message, 'Arsip kosong — tidak ada file hasil ekstraksi.');
      return;
    }

    await editProcess(message, `<b>Mengirim ${files.length} file...</b>`);
    for (const f of files) {
      try {
        const st = fs.statSync(f);
        if (st.size > MAX_SIZE) {continue;}
        const rel = path.relative(extractDir, f);
        await client.sendFile(message.chatId, {
          file: f,
          forceDocument: true,
          caption: `<code>${rel.replace(/[<>&]/g, '')}</code>`,
          parseMode: 'html',
          replyTo: replyToId(message),
        });
        sentNames.push(rel);
      } catch (sendErr) {
        Logger.logUser(telegramId, `zip.unzip: gagal kirim ${f}: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`, 'WARN');
      }
    }

    if (sentNames.length === 0) {
      await editError(message, 'Tidak ada file yang berhasil dikirim (semua terlalu besar atau error unggah).');
      return;
    }

    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, `${sentNames.length} file diekstrak & dikirim.`);
  } catch (err) {
    Logger.logUser(telegramId, `Error in zip.unzip: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    rmrf(zipPath);
    rmrf(extractDir);
  }
}

// ============================================================
// .dozip <nama> — reply file → zip dengan nama kustom → kirim
// ============================================================
async function handleDoZip(client: any, message: any, arg: string, telegramId: number): Promise<void> {
  const customName = arg.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80);
  if (!customName) {
    await editError(message, 'Sertakan nama arsip! Contoh: <code>.dozip backup</code>');
    return;
  }
  const replied = await getReplied(message);
  if (!replied || !replied.media || !replied.document) {
    await editError(message, 'Balas sebuah file/dokumen lalu ketik .dozip <nama>!');
    return;
  }

  const stamp = Date.now();

  await editProcess(message, '<b>Mengunduh file...</b>');

  let tmpFile: string | null = null;
  let outPath: string | null = null;
  try {
    tmpFile = await downloadToTemp(client, replied, `dozip_${stamp}_file`);

    await editProcess(message, `<b>Membuat arsip <code>${customName}.zip</code>...</b>`);
    outPath = path.join(TMP_DIR, `dozip_${stamp}.zip`);
    if (hasZipBin) {
      const r = await run(ZIP_BIN, ['-j', '-q', outPath, tmpFile]);
      if (!r.ok) {throw new Error(`zip gagal${r.stderr ? `: ${r.stderr}` : ''}`);}
    } else if (hasPython) {
      const r = await run(PYTHON_BIN, ['-m', 'zipfile', '-c', outPath, tmpFile]);
      if (!r.ok) {throw new Error(`zipfile gagal${r.stderr ? `: ${r.stderr}` : ''}`);}
    } else {
      throw new Error('binary zip tidak tersedia dan python3 tidak ditemukan');
    }

    await editProcess(message, '<b>Mengunggah arsip...</b>');
    await client.sendFile(message.chatId, {
      file: outPath,
      forceDocument: true,
      caption: `<code>${customName}.zip</code>`,
      parseMode: 'html',
      replyTo: replyToId(message),
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
    await editSuccess(message, `File di-zip sebagai <code>${customName}.zip</code> dan dikirim.`);
  } catch (err) {
    Logger.logUser(telegramId, `Error in zip.dozip: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    await editError(message, err instanceof Error ? err.message : String(err));
  } finally {
    rmrf(tmpFile);
    rmrf(outPath);
  }
}

// ============================================================
// Plugin utama — .zip / .unzip / .dozip
// ============================================================
export default {
  name: 'zip',
  version: '1.0.0',
  description: 'Zip & unzip file via arsip .zip langsung dari chat.',
  help: {
    title: 'Zip Tools (.zip / .unzip / .dozip)',
    description: 'Kompres file menjadi arsip .zip atau ekstrak arsip .zip yang dibalas.',
    usage: '• `.zip` — balas file/dokumen → di-zip jadi arsip, dikirim sebagai dokumen.\n• `.unzip` — balas arsip .zip → diekstrak, isinya dikirim satu per satu.\n• `.dozip <nama>` — balas file lalu ketik command ini → di-zip dengan nama yang diberikan.',
    detail: 'Memakai binary zip/unzip di /usr/bin bila tersedia; fallback otomatis ke python3 -m zipfile (create/extract). Arsip temp dibersihkan otomatis.'
  },
  async execute(client: any, message: any, _settings: unknown, telegramId: number): Promise<void> {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.dozip(?:\s+([\s\S]+))?$/i)
      ?? message.message.trim().match(/^\.(zip|unzip)\b\s*$/i);
    if (!match) {return;}

    if (match[0].toLowerCase().startsWith('.dozip')) {
      await handleDoZip(client, message, (match[1] || '').trim(), telegramId);
      return;
    }
    const cmd = (match[1] || '').toLowerCase();
    if (cmd === 'zip') {
      await handleZip(client, message, telegramId);
    } else if (cmd === 'unzip') {
      await handleUnzip(client, message, telegramId);
    }
  }
};
