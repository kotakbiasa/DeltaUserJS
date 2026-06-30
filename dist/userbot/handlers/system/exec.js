import util from 'util';
import { exec } from 'child_process';
import config from '../../../config.js';
const execAsync = util.promisify(exec);
export default {
    name: 'exec',
    version: '1.0.0',
    description: 'Mengeksekusi kode JavaScript atau Shell/Terminal. Khusus Owner.',
    help: {
        title: 'Eval / Exec (.eval, .exec, .sh)',
        description: 'Mengeksekusi kode JavaScript atau perintah Shell/Terminal langsung dari chat Telegram.',
        usage: '• `.eval <kode JS>`\n• `.exec <perintah shell>`\n• `.sh <perintah shell>`',
        detail: 'Kode dieksekusi dalam konteks async dengan akses ke `client` (teleproto) dan `message`. Hanya bisa digunakan oleh Owner.'
    },
    onLoad: () => {
        console.log('🔌 Plugin Exec/Eval loaded.');
    },
    execute: async (client, message, settings, telegramId) => {
        // PROTEKSI: Hanya eksekusi jika pengirim adalah Owner!
        if (Number(telegramId) !== Number(config.ownerId))
            return;
        const text = message.message || '';
        // Pattern untuk menangkap .eval <kode>, .exec <kode>, .sh <kode>
        const match = text.match(/^\.(eval|exec|sh)(?:\s+([\s\S]+))?$/i);
        if (!match)
            return;
        const command = match[1].toLowerCase();
        const code = match[2];
        if (!code) {
            await message.edit({
                text: `❌ Masukkan kode yang ingin dieksekusi!\nContoh: <code>.${command} console.log('test')</code>`,
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
                // Membungkus eval di dalam async context agar bisa menggunakan 'await'
                const asyncFunc = new Function('client', 'message', 'telegramId', 'require', `return (async () => { ${code} })();`);
                // Custom require (bisa dipakai untuk import fungsi helper)
                const customRequire = (moduleName) => {
                    // Memungkinkan module tertentu, namun batasi jika diperlukan
                    return require(moduleName);
                };
                const result = await asyncFunc(client, message, telegramId, customRequire);
                output = util.inspect(result, { depth: 2 });
            }
            catch (err) {
                output = err.stack || err.message;
            }
        }
        else if (command === 'exec' || command === 'sh') {
            try {
                const { stdout, stderr } = await execAsync(code, { timeout: 15000 }); // timeout 15 detik
                output = stdout || stderr || 'Berhasil dieksekusi tanpa output.';
            }
            catch (err) {
                output = err.stdout ? `${err.stdout}\n${err.stderr}` : err.message;
            }
        }
        const endTime = Date.now();
        const duration = endTime - startTime;
        // Batasi panjang pesan Telegram (Maks ~4000 karakter)
        if (output.length > 3800) {
            output = output.substring(0, 3800) + '\n\n... (Output terpotong karena terlalu panjang)';
        }
        const finalMessage = `💻 <b>Terminal / Eval</b>\n` +
            `⏱️ <b>Waktu:</b> ${duration}ms\n\n` +
            `<b>Input:</b>\n<pre><code class="language-javascript">${escapeHtml(code)}</code></pre>\n` +
            `<b>Output:</b>\n<pre><code>${escapeHtml(output)}</code></pre>`;
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
