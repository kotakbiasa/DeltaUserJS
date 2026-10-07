import util from 'util';
import { execFile } from 'child_process';
import config from '../../../config.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';

const execFileAsync = util.promisify(execFile);

// Safety: exec/sh commands disabled by default. Set EXEC_ALLOWED=true to enable.
const EXEC_ALLOWED = process.env.EXEC_ALLOWED === 'true';

// Whitelist for .exec/.sh — only allow these commands (no cat to prevent reading secrets)
const ALLOWED_COMMANDS = ['date', 'uptime', 'whoami', 'hostname', 'pwd', 'echo', 'df', 'free', 'uname', 'top', 'ps', 'wc'];

/**
 * Karakter yang ditolak sebelum perintah dijalankan.
 *
 * Perintah dijalankan lewat execFile (tanpa shell), jadi karakter ini
 * sebenarnya sudah kehilangan makna khususnya. Pemeriksaan tetap
 * dipertahankan sebagai lapis kedua, dan agar user mendapat pesan jelas
 * alih-alih argumen literal yang membingungkan.
 *
 * Catatan: `<` dan `>` dulu TIDAK ada di daftar ini walau komentar kodenya
 * mengklaim redirect diblokir, sehingga `echo x >> ~/.bashrc` lolos.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[;|&`$(){}!<>*?[\]~\n\r\t\x00-\x1f\x7f]/;

/** Validate command is in whitelist. Block pipes, redirects, globs, backticks, semicolons, newlines. */
export function validateCommand(cmd: string): string | null {
  if (FORBIDDEN_CHARS.test(cmd)) {
    return 'Karakter khusus (;|&`${}!<>*?[]~ kontrol) tidak diizinkan. Gunakan hanya nama perintah + argumen sederhana.';
  }
  const base = cmd.trim().split(/\s+/)[0];
  if (ALLOWED_COMMANDS.includes(base)) {return null;}
  return `Perintah "${base}" tidak diizinkan. Whitelist: ${ALLOWED_COMMANDS.join(', ')}`;
}

export default {
  name: 'exec',
  version: '2.0.0',
  description: 'Mengeksekusi perintah Shell/Terminal dari whitelist. Khusus Owner.',
  ownerOnly: true,
  help: {
    title: 'Exec (.exec, .sh)',
    description: 'Menjalankan perintah shell dari daftar putih. Hanya bisa digunakan oleh Owner.',
    usage: '• `.exec <perintah>` (whitelist only)\n• `.sh <perintah>` (whitelist only)',
    detail: `⚠️ Dijalankan tanpa shell (execFile), jadi pipe, redirect, dan glob tidak berfungsi. Whitelist: ${ALLOWED_COMMANDS.join(', ')}. Perlu EXEC_ALLOWED=true di .env.`
  },
  onLoad: () => {
    if (!EXEC_ALLOWED) {
      Logger.logSystem('⚠️  Plugin Exec loaded (EXEC mode DISABLED — .exec/.sh akan ditolak)', 'WARN');
    } else {
      Logger.logSystem('🔌 Plugin Exec loaded (EXEC mode ENABLED — whitelist only)', 'INFO');
    }
  },
  execute: async (client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) => {
    if (Number(telegramId) !== Number(config.ownerId)) {return;}
    // Jangan pernah bereaksi pada pesan orang lain. Sebelumnya tidak ada cek
    // ini; yang menyelamatkan hanyalah message.edit() yang kebetulan gagal.
    if (!message.out || !message.message) {return;}

    const text = message.message || '';
    const match = text.match(/^\.(exec|sh)(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const code = match[2];

    if (!code) {
      await message.edit({
        text: `❌ Masukkan perintah yang ingin dijalankan!\nContoh: <code>.exec uptime</code>`,
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `⏳ <b>Mengeksekusi...</b>`,
      parseMode: 'html'
    });

    let output: string;
    const startTime = Date.now();

    if (!EXEC_ALLOWED) {
      output = '❌ .exec/.sh dinonaktifkan. Setel EXEC_ALLOWED=true di .env untuk mengaktifkan.';
    } else {
      const cmdErr = validateCommand(code);
      if (cmdErr) {
        output = `❌ ${cmdErr}`;
      } else {
        try {
          // execFile tanpa shell: argumen diteruskan apa adanya, tidak ada
          // interpretasi metakarakter oleh /bin/sh.
          const [file, ...args] = code.trim().split(/\s+/);
          const { stdout, stderr } = await execFileAsync(file, args, { timeout: 10000 });
          output = stdout || stderr || 'Berhasil tanpa output.';
        } catch (err) {
          output = (err as { stdout?: string; stderr?: string; message?: string }).stdout
            ? `${(err as { stdout?: string; stderr?: string }).stdout}\n${(err as { stdout?: string; stderr?: string }).stderr}`
            : (err instanceof Error ? err.message : String(err));
        }
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (output.length > 3800) {
      output = output.substring(0, 3800) + '\n\n... (Output terpotong karena terlalu panjang)';
    }

    const finalMessage = `💻 <b>Terminal</b>\n` +
      `⏱️ <b>Waktu:</b> ${duration}ms\n\n` +
      `<b>Input:</b>\n<pre><code class="language-bash">${escapeHtml(code)}</code></pre>\n` +
      `<b>Output:</b>\n<pre><code>${escapeHtml(output)}</code></pre>`;

    await message.edit({
      text: finalMessage,
      parseMode: 'html'
    });
  }
};
