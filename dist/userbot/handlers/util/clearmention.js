import { Api } from 'teleproto';
import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
// ============================================================
// Clear Mention — hapus badge angka mention/tag
// Command:
//   .clearmention        — bersihkan badge mention di chat ini
//   .clearmention all    — bersihkan badge mention di semua chat
// Memakai raw API messages.ReadMentions (konsep dari Dragon).
// Mode "all" mengiterasi getDialogs() dengan jeda + update progres
// agar tidak kena FloodWait (pola sama dengan clearnotif.ts).
// ============================================================
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const SWEEP_EVERY = 5; // update progres tiap N chat
const SWEEP_DELAY = 1500; // jeda antar batch (ms)
export default {
    name: 'clearmention',
    version: '1.0.0',
    description: 'Membersihkan badge mention/tag: chat ini saja, atau semua chat sekaligus via ReadMentions.',
    help: {
        title: '🧹 Clear Mention (.clearmention)',
        description: 'Menghapus badge angka mention (@tag) yang menumpuk, chat ini saja atau di semua chat.',
        usage: '• `.clearmention` — bersihkan badge mention di chat ini\n' +
            '• `.clearmention all` — bersihkan badge mention di semua chat',
        detail: 'Memakai raw API messages.ReadMentions sehingga badge mention hilang langsung. ' +
            'Mode "all" hanya menyentuh chat yang benar-benar punya unreadMentionsCount > 0, ' +
            'dengan jeda antar batch untuk menghindari FloodWait.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.clearmention(?:\s+(\S+))?\s*$/i);
        if (!match) {
            return;
        }
        const arg = (match[1] || '').toLowerCase();
        if (arg && arg !== 'all') {
            await message.edit({
                text: '<blockquote>📚 <b>Penggunaan:</b> <code>.clearmention</code> (chat ini) atau <code>.clearmention all</code></blockquote>',
                parseMode: 'html'
            });
            return;
        }
        try {
            if (!arg) {
                // ---- Chat ini saja ----
                await client.invoke(new Api.messages.ReadMentions({ peer: message.chatId }));
                await message.edit({
                    text: '<blockquote>🧹 Badge mention di chat ini telah dibersihkan.</blockquote>',
                    parseMode: 'html'
                });
                return;
            }
            // ---- Semua chat ----
            let counter = 0;
            await message.edit({ text: '⏳ <b>Menyapu badge mention di semua chat...</b>', parseMode: 'html' });
            const dialogs = await client.getDialogs();
            for (const dialog of dialogs) {
                if (!(dialog.unreadMentionsCount > 0)) {
                    continue;
                }
                try {
                    await client.invoke(new Api.messages.ReadMentions({ peer: dialog.entity || dialog.id }));
                    counter++;
                }
                catch (_e) {
                    // Abaikan dialog yang tidak mendukung ReadMentions, lanjut ke berikutnya
                }
                if (counter % SWEEP_EVERY === 0) {
                    await message.edit({
                        text: `⏳ <b>Menyapu badge mention di semua chat...</b>\n\n✅ <b>Dibersihkan:</b> <code>${escapeHtml(String(counter))}</code> chat`,
                        parseMode: 'html'
                    }).catch(() => { });
                    await sleep(SWEEP_DELAY);
                }
            }
            await message.edit({
                text: `<blockquote>🧹 <b>Selesai!</b> ${escapeHtml(String(counter))} chat dengan mention telah dibersihkan.</blockquote>`,
                parseMode: 'html'
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in clearmention plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal membersihkan mention:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
