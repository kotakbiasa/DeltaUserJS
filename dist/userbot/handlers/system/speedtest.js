import { runSpeedtest } from '../../../utils/speedtest.js';
import { escapeHtml } from '../../../utils/richMessage.js';
export default {
    name: 'speedtest',
    version: '2.0.0',
    description: 'Melakukan pengetesan kecepatan internet server.',
    help: {
        title: 'Speedtest',
        description: 'Mengetes kecepatan jaringan server yang sedang menjalankan bot ini menggunakan Cloudflare Speed Test.',
        usage: '`.speedtest` atau `.testspeed`',
        detail: 'Menampilkan Ping, Jitter, Download, Upload, dan informasi ISP server.'
    },
    async execute(client, message, _settings, _telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.(speedtest|testspeed)$/i);
        if (!match) {
            return;
        }
        await message.edit({
            text: `🚀 <b>Menjalankan Speedtest via Cloudflare...</b>\n<i>Mohon tunggu sebentar, ini mungkin memakan waktu hingga 30 detik.</i>`,
            parseMode: 'html'
        });
        try {
            const result = await runSpeedtest();
            const ping = result.ping.toFixed(2);
            const jitter = result.jitter.toFixed(2);
            const download = result.download.toFixed(2);
            const upload = result.upload.toFixed(2);
            const output = `🚀 <b>SPEEDTEST HASIL</b>\n` +
                `\n` +
                `🌐 <b>ISP:</b> <code>${escapeHtml(result.isp)}</code>\n` +
                `🏢 <b>Server:</b> <code>${escapeHtml(result.serverName)} - ${escapeHtml(result.serverLocation)}</code>\n` +
                `\n` +
                `🔻 <b>Download:</b> <code>${download} Mbps</code>\n` +
                `🔺 <b>Upload:</b> <code>${upload} Mbps</code>\n` +
                `🏓 <b>Ping:</b> <code>${ping} ms</code> (Jitter: <code>${jitter} ms</code>)\n` +
                `\n` +
                `📊 <a href="${result.resultUrl}">[Lihat Hasil di Web]</a>`;
            await message.edit({
                text: output,
                parseMode: 'html',
                linkPreview: { url: result.resultUrl }
            });
        }
        catch (err) {
            await message.edit({
                text: `<blockquote>❌ <b>Gagal menjalankan speedtest:</b>\n${err.message}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
