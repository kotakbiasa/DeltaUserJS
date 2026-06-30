import util from 'util';
import crypto from 'crypto';
import { InlineKeyboard } from 'grammy';
import config from '../../../config.js';
// Cache untuk menyimpan hasil eval yang panjang
// Karena ini hanya untuk owner, memory footprint sangat kecil
const evalCache = new Map();
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
export function registerEvalHandlers(bot) {
    bot.on('message:text', async (ctx, next) => {
        // PROTEKSI: Hanya eksekusi jika pengirim adalah Owner!
        if (Number(ctx.from.id) !== Number(config.ownerId))
            return next();
        const text = ctx.message.text;
        if (!text.startsWith('> ') && text !== '>')
            return next();
        const code = text.slice(text.startsWith('> ') ? 2 : 1).trim();
        if (!code)
            return next();
        try {
            // Membungkus eval di dalam async context
            const asyncFunc = new Function('ctx', 'bot', 'require', `return (async () => { ${code} })();`);
            // Custom require handler (jika butuh panggil modul bawaan)
            const customRequire = (moduleName) => {
                return require(moduleName);
            };
            const result = await asyncFunc(ctx, bot, customRequire);
            let output = '';
            if (typeof result === 'object' && result !== null) {
                try {
                    // Format rapi dengan indentasi 2 spasi
                    output = JSON.stringify(result, null, 2);
                }
                catch (e) {
                    // Fallback jika terjadi circular JSON structure
                    output = util.inspect(result, { depth: 4 });
                }
            }
            else {
                output = String(result);
            }
            // Paginasi: Batas aman teks Telegram sekitar 4096 karakter
            const maxLength = 3500;
            const pages = [];
            for (let i = 0; i < output.length; i += maxLength) {
                pages.push(output.substring(i, i + maxLength));
            }
            if (pages.length <= 1) {
                await ctx.replyWithRichMessage({ html: `<details><summary><b>Lihat Input Kode</b></summary><pre><code class="language-javascript">${escapeHtml(code)}</code></pre></details><b>Output</b>\n<pre><code class="language-json">${escapeHtml(pages[0] || 'undefined')}</code></pre>` });
            }
            else {
                const uuid = crypto.randomBytes(4).toString('hex');
                evalCache.set(uuid, { pages, code });
                const keyboard = new InlineKeyboard()
                    .text('_<', `eval:prev:${uuid}:0`)
                    .text('>_', `eval:next:${uuid}:0`);
                await ctx.replyWithRichMessage({ html: `<details><summary><b>Lihat Input Kode</b></summary><pre><code class="language-javascript">${escapeHtml(code)}</code></pre></details><b>Output (Halaman 1/${pages.length})</b>\n<pre><code class="language-json">${escapeHtml(pages[0])}</code></pre>` }, {
                    reply_markup: keyboard
                });
            }
        }
        catch (err) {
            await ctx.replyWithRichMessage({ html: `<b>Error</b>\n<pre><code class="language-javascript">${escapeHtml(err.stack || err.message)}</code></pre>` });
        }
    });
    // --- PAGINATION CALLBACKS ---
    bot.callbackQuery(/^eval:(prev|next):([a-f0-9]+):(\d+)$/, async (ctx) => {
        // Hanya respon ke owner
        if (Number(ctx.from.id) !== Number(config.ownerId)) {
            return ctx.answerCallbackQuery({ text: '❌ Anda bukan owner!', show_alert: true });
        }
        const action = ctx.match[1];
        const uuid = ctx.match[2];
        const currentIndex = parseInt(ctx.match[3], 10);
        const cacheData = evalCache.get(uuid);
        if (!cacheData) {
            return ctx.answerCallbackQuery({ text: '❌ Data output sudah kadaluarsa (hilang dari memori bot).', show_alert: true });
        }
        const { pages, code } = cacheData;
        let newIndex = action === 'next' ? currentIndex + 1 : currentIndex - 1;
        // Loop around
        if (newIndex < 0)
            newIndex = pages.length - 1;
        if (newIndex >= pages.length)
            newIndex = 0;
        const keyboard = new InlineKeyboard()
            .text('_<', `eval:prev:${uuid}:${newIndex}`)
            .text('>_', `eval:next:${uuid}:${newIndex}`);
        try {
            await ctx.editMessageText({ html: `<details><summary><b>Lihat Input Kode</b></summary><pre><code class="language-javascript">${escapeHtml(code)}</code></pre></details><b>Output (Halaman ${newIndex + 1}/${pages.length})</b>\n<pre><code class="language-json">${escapeHtml(pages[newIndex])}</code></pre>` }, {
                reply_markup: keyboard
            });
            await ctx.answerCallbackQuery();
        }
        catch (err) {
            if (err.message.includes('message is not modified')) {
                await ctx.answerCallbackQuery(); // abaikan jika sama
            }
            else {
                await ctx.answerCallbackQuery({ text: `❌ Error: ${err.message}` });
            }
        }
    });
}
