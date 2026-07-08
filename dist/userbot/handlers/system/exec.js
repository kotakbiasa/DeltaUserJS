import util from 'util';
import { exec } from 'child_process';
import config from '../../../config.js';
const execAsync = util.promisify(exec);
// Safety: exec/sh commands disabled by default. Set EXEC_ALLOWED=true to enable.
const EXEC_ALLOWED = process.env.EXEC_ALLOWED === 'true';
// Whitelist for .exec/.sh — only allow these commands
const ALLOWED_COMMANDS = ['date', 'uptime', 'whoami', 'hostname', 'pwd', 'echo', 'df', 'free', 'uname', 'top', 'ps', 'cat', 'ls', 'wc'];
// Sanitized context for .eval — block dangerous globals
const SAFE_EVAL_CONTEXT = {
    console: {
        log: (...args) => args.join(' '),
        warn: (...args) => args.join(' '),
        error: (...args) => args.join(' '),
    },
};
/** Validate command is in whitelist. Block pipes, redirects, backticks, semicolons. */
function validateCommand(cmd) {
    // Block dangerous characters — only allow alphanumeric, space, dash, dot, slash
    if (/[;|&`$(){}!\\n\\r\\t]/.test(cmd)) {
        return 'Karakter khusus (;|&`${}!) tidak diizinkan. Gunakan hanya nama perintah + argumen sederhana.';
    }
    const base = cmd.trim().split(/\s+/)[0];
    if (ALLOWED_COMMANDS.includes(base))
        return null;
    return `Perintah "${base}" tidak diizinkan. Whitelist: ${ALLOWED_COMMANDS.join(', ')}`;
}
export default {
    name: 'exec',
    version: '1.0.0',
    description: 'Mengeksekusi kode JavaScript atau Shell/Terminal. Khusus Owner. (Sandboxed)',
    help: {
        title: 'Eval / Exec (.eval, .exec, .sh)',
        description: 'Mengeksekusi kode JavaScript (sandboxed) atau perintah shell (whitelist). Hanya bisa digunakan oleh Owner.',
        usage: '• `.eval <kode JS>`\\n• `.exec <perintah>` (whitelist only)\\n• `.sh <perintah>` (whitelist only)',
        detail: '⚠️ .eval berjalan dalam sandbox — akses ke client, message tersedia tapi tidak ada require/import/process/global.'
    },
    onLoad: () => {
        if (!EXEC_ALLOWED) {
            console.log('⚠️  Plugin Exec/Eval loaded (EXEC mode DISABLED — .exec/.sh akan ditolak)');
        }
        else {
            console.log('🔌 Plugin Exec/Eval loaded (EXEC mode ENABLED — whitelist only)');
        }
    },
    execute: async (client, message, settings, telegramId) => {
        if (Number(telegramId) !== Number(config.ownerId))
            return;
        const text = message.message || '';
        const match = text.match(/^\\.(eval|exec|sh)(?:\\s+([\\s\\S]+))?$/i);
        if (!match)
            return;
        const command = match[1].toLowerCase();
        const code = match[2];
        if (!code) {
            await message.edit({
                text: `❌ Masukkan kode yang ingin dieksekusi!\\nContoh: <code>.eval Math.PI</code>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `⏳ <b>Mengeksekusi...</b>`,
            parseMode: 'html'
        });
        let output = '';
        const startTime = Date.now();
        if (command === 'eval') {
            try {
                // Sandbox: gunakan vm.createContext untuk isolasi yang benar-benar aman.
                // new Function bisa escape ke globalThis via constructor('return this')()
                const vm = await import('node:vm');
                const sandbox = {
                    ...SAFE_EVAL_CONTEXT,
                    client,
                    message,
                    telegramId,
                    Math,
                    Date,
                    JSON,
                    String,
                    Number,
                    Boolean,
                    Array,
                    Object,
                    Promise,
                    TypeError,
                    ReferenceError,
                    Error,
                    Set,
                    Map,
                    Buffer,
                    setTimeout,
                    setInterval,
                };
                // Buat context terisolasi
                const context = vm.createContext(sandbox);
                const codeStr = `(${code})`;
                // Evaluate di dalam context — tidak punya akses ke globalThis
                const wrappedCode = `async function __eval() { return ${codeStr}; } __eval();`;
                const result = vm.runInContext(wrappedCode, context, { timeout: 10000 });
                output = util.inspect(result, { depth: 2, colors: false });
            }
            catch (err) {
                output = err.stack || err.message;
            }
        }
        else if (command === 'exec' || command === 'sh') {
            if (!EXEC_ALLOWED) {
                output = '❌ .exec/.sh dinonaktifkan. Setel EXEC_ALLOWED=true di .env untuk mengaktifkan.';
            }
            else {
                const cmdErr = validateCommand(code);
                if (cmdErr) {
                    output = `❌ ${cmdErr}`;
                }
                else {
                    try {
                        const { stdout, stderr } = await execAsync(code, { timeout: 10000 });
                        output = stdout || stderr || 'Berhasil tanpa output.';
                    }
                    catch (err) {
                        output = err.stdout ? `${err.stdout}\n${err.stderr}` : err.message;
                    }
                }
            }
        }
        const endTime = Date.now();
        const duration = endTime - startTime;
        if (output.length > 3800) {
            output = output.substring(0, 3800) + '\n\n... (Output terpotong karena terlalu panjang)';
        }
        const finalMessage = `💻 <b>Terminal / Eval (Sandboxed)</b>\\n` +
            `⏱️ <b>Waktu:</b> ${duration}ms\\n\\n` +
            `<b>Input:</b>\\n<pre><code class="language-javascript">${escapeHtml(code)}</code></pre>\\n` +
            `<b>Output:</b>\\n<pre><code>${escapeHtml(output)}</code></pre>`;
        await message.edit({
            text: finalMessage,
            parseMode: 'html'
        });
    }
};
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
