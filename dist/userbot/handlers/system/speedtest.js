import speedTest from 'speedtest-net';
import { escapeHtml } from '../../../utils/richMessage.js';
export default {
    name: 'speedtest',
    version: '1.0.0',
    description: 'Melakukan pengetesan kecepatan internet server.',
    help: {
        title: 'Speedtest',
        description: 'Mengetes kecepatan jaringan server yang sedang menjalankan bot ini menggunakan layanan Ookla Speedtest.',
        usage: '`.speedtest` atau `.testspeed`',
        detail: 'Menampilkan Ping, Jitter, Download, Upload, dan informasi ISP server.'
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message)
            return;
        const match = message.message.match(/^\.(speedtest|testspeed)$/i);
        if (!match)
            return;
        await message.edit({
            text: `🚀 <b>Menjalankan Speedtest Ookla...</b>\n<i>Mohon tunggu sebentar, ini mungkin memakan waktu hingga 20 detik.</i>`,
            parseMode: 'html'
        });
        try {
            // Menjalankan speedtest-net, auto-accept license needed for ookla cli
            const result = await speedTest({ acceptLicense: true, acceptGdpr: true });
            const ping = result.ping.latency.toFixed(2);
            const jitter = result.ping.jitter.toFixed(2);
            // Kecepatan dari bytes/sec ke Mbps
            const download = (result.download.bandwidth / 125000).toFixed(2);
            const upload = (result.upload.bandwidth / 125000).toFixed(2);
            const isp = result.isp;
            const serverName = result.server.name;
            const serverLoc = result.server.location;
            const serverCountry = result.server.country;
            const resultUrl = result.result.url;
            const output = `🚀 <b>SPEEDTEST HASIL</b>\n` +
                `\n` +
                `🌐 <b>ISP:</b> <code>${escapeHtml(isp)}</code>\n` +
                `🏢 <b>Server:</b> <code>${escapeHtml(serverName)} - ${escapeHtml(serverLoc)}, ${escapeHtml(serverCountry)}</code>\n` +
                `\n` +
                `🔻 <b>Download:</b> <code>${download} Mbps</code>\n` +
                `🔺 <b>Upload:</b> <code>${upload} Mbps</code>\n` +
                `🏓 <b>Ping:</b> <code>${ping} ms</code> (Jitter: <code>${jitter} ms</code>)\n` +
                `\n` +
                `📊 <a href="${resultUrl}">[Lihat Hasil di Web]</a>`;
            await message.edit({
                text: output,
                parseMode: 'html',
                linkPreview: { url: resultUrl }
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
