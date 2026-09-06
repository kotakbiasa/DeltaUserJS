import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
const BROWER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export default {
    name: 'gempa',
    version: '1.0.0',
    description: 'Info gempa terkini dari BMKG.',
    help: {
        title: 'Gempa Terkini (.gempa)',
        description: 'Menampilkan info gempa bumi terkini dari data resmi BMKG.',
        usage: '`.gempa`',
        detail: 'Mengambil data autogempa.json BMKG. Tidak perlu parameter.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        if (message.message.trim().toLowerCase() !== '.gempa') {
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Mengecek gempa terkini dari BMKG...</b></blockquote>`,
            parseMode: 'html'
        });
        try {
            const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', {
                headers: { 'User-Agent': BROWER_UA }
            });
            if (!res.ok) {
                throw new Error(`BMKG responded ${res.status}`);
            }
            const data = await res.json();
            const g = data?.Infogempa?.gempa;
            if (!g) {
                throw new Error('Format data BMKG tidak dikenal');
            }
            const magnitud = escapeHtml(g.Magnitude ?? '-');
            const kedalaman = escapeHtml(g.Kedalaman ?? '-');
            const wilayah = escapeHtml(g.Wilayah ?? '-');
            const waktu = escapeHtml(`${g.Tanggal ?? ''} ${g.Jam ?? ''}`.trim());
            const potensi = escapeHtml(g.Potensi ?? '-');
            const dirasakan = escapeHtml(g.Dirasakan ?? 'Tidak dirasakan');
            const shakeMap = g.Shakemap
                ? `https://data.bmkg.go.id/DataMKG/TEWS/${encodeURIComponent(g.Shakemap)}`
                : null;
            const text = `🌍 <b>Gempa Terkini — BMKG</b>\n\n` +
                `<blockquote>` +
                `• <b>Waktu</b>: ${waktu}\n` +
                `• <b>Magnitudo</b>: ${magnitud}\n` +
                `• <b>Kedalaman</b>: ${kedalaman}\n` +
                `• <b>Lokasi</b>: ${wilayah}\n` +
                `• <b>Potensi</b>: ${potensi}\n` +
                `• <b>Dirasakan</b>: ${dirasakan}\n` +
                `</blockquote>`;
            if (shakeMap) {
                await client.sendMessage(message.chatId, {
                    message: text,
                    file: { source: shakeMap },
                    parseMode: 'html',
                    replyTo: message.replyToMsgId
                });
            }
            else {
                await message.edit({ text, parseMode: 'html' });
            }
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in gempa plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal mengambil data BMKG:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
