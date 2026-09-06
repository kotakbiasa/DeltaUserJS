import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

const BROWER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default {
  name: 'ipinfo',
  version: '1.0.0',
  description: 'Info lokasi & ISP dari sebuah IP address.',
  help: {
    title: 'IP Info (.ipinfo)',
    description: 'Menampilkan info geolokasi, ISP, dan timezone dari sebuah IP.',
    usage: '`.ipinfo <ip>`',
    detail: 'Contoh: `.ipinfo 8.8.8.8`. Sumber: ip-api.com (free tier).'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.ipinfo(?:\s+(\S+))?$/i);
    if (!match) {return;}

    const ip = (match[1] || '').trim();
    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      await message.edit({
        text: `<blockquote>❌ <b>Format salah:</b> <code>.ipinfo &lt;ip&gt;</code>\nContoh: <code>.ipinfo 8.8.8.8</code></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `<blockquote>⏳ <b>Mengecek IP ${escapeHtml(ip)}...</b></blockquote>`,
      parseMode: 'html'
    });

    try {
      // ip-api free tier hanya HTTPS di pro; HTTP tetap dipakai sesuai kuota free
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
        headers: { 'User-Agent': BROWER_UA }
      });
      if (!res.ok) {
        throw new Error(`ip-api responded ${res.status}`);
      }
      const d = await res.json();
      if (d.status !== 'success') {
        throw new Error(d.message || 'lookup gagal');
      }

      const fields = [
        ['IP', d.query],
        ['Negara', d.country ? `${d.country} (${d.countryCode})` : null],
        ['Region', d.regionName],
        ['Kota', d.city],
        ['ZIP', d.zip],
        ['Koordinat', d.lat !== null && d.lat !== undefined ? `${d.lat}, ${d.lon}` : null],
        ['Timezone', d.timezone],
        ['ISP', d.isp],
        ['Org', d.org],
        ['AS', d.as]
      ];
      let body = '';
      for (const [k, v] of fields) {
        if (v !== null && v !== '') {
          body += `• <b>${k}</b>: <code>${escapeHtml(String(v))}</code>\n`;
        }
      }

      const mapUrl = d.lat !== null && d.lat !== undefined ? `https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=10/${d.lat}/${d.lon}` : null;
      if (d.lat !== undefined && d.lon !== undefined) {body += `\n🗺️ [Lihat di peta](${mapUrl})`;}

      await message.edit({
        text: `🌐 <b>IP Info — ${escapeHtml(ip)}</b>\n\n<blockquote>${body}</blockquote>`,
        parseMode: 'html',
        linkPreview: false
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in ipinfo plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal lookup IP:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
