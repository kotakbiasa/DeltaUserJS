// @ts-nocheck
import { getUserbotSession } from '../../../infrastructure/database.js';
import userbotManager from '../../../userbot/engine/manager.js';
import { getService, downloadMedia } from '../../../domain/services/downloader/index.js';
import crypto from 'crypto';
export function registerGuestHandler(bot) {
    bot.use(async (ctx, next) => {
        const guestMsg = ctx.update.guest_message;
        if (!guestMsg)
            return next();
        try {
            const guestQueryId = guestMsg.guest_query_id;
            const callerUser = guestMsg.guest_bot_caller_user;
            const text = (guestMsg.text || '').trim().toLowerCase();
            if (!guestQueryId || !callerUser)
                return;
            const telegramId = callerUser.id;
            const userSession = getUserbotSession(telegramId);
            const botUsername = ctx.me?.username || 'Bot';
            let url = '';
            const cmdParts = text.split(/\s+/);
            if (text.startsWith('dl ')) {
                url = cmdParts.length > 1 ? cmdParts[1] : '';
            }
            if (url) {
                const service = getService(url);
                if (!url || !service) {
                    await ctx.api.answerGuestQuery(guestQueryId, {
                        text: `❌ <b>URL tidak valid/tidak didukung!</b>\nLink ini tidak didukung oleh Downloader.`,
                        parse_mode: 'HTML',
                    });
                    return;
                }
                await ctx.api.answerGuestQuery(guestQueryId, {
                    text: `⏳ <b>Mendownload Media...</b>\n\nMohon tunggu sebentar, file akan dikirim ke chat pribadi Anda.`,
                    parse_mode: 'HTML',
                });
                try {
                    const id = crypto.randomBytes(4).toString('hex');
                    const { filePath: filePathsRaw, metadata: meta } = await downloadMedia(url, id);
                    // Normalize to array
                    const filePaths = Array.isArray(filePathsRaw) ? filePathsRaw : [filePathsRaw];
                    if (meta.isSlideshow || (meta.mediaUrls && meta.mediaUrls.length > 1)) {
                        // Instagram / Tiktok Slideshows
                        const mediaGroup = meta.mediaUrls.map((mediaUrl, i) => {
                            let title = meta.title || '';
                            if (title.length > 900)
                                title = title.slice(0, 900) + '...';
                            return {
                                type: 'photo',
                                media: mediaUrl,
                                caption: i === 0 ? `<blockquote expandable>${title}</blockquote>\n\n<i>Diunduh via @${botUsername}</i>` : '',
                                parse_mode: 'HTML'
                            };
                        });
                        const sentMsg = await ctx.api.sendMediaGroup(telegramId, mediaGroup);
                        await ctx.api.sendMessage(telegramId, `🔗 <b>Link Sumber</b>`, {
                            reply_to_message_id: sentMsg[0].message_id,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[{ text: 'Source', url: url }]]
                            }
                        });
                    }
                    else {
                        // Video or single photo
                        const ext = meta.ext === 'mp4' ? 'Video' : 'Foto';
                        const method = meta.ext === 'mp4' ? 'sendVideo' : 'sendPhoto';
                        let title = meta.title || '';
                        if (title.length > 900)
                            title = title.slice(0, 900) + '...';
                        const { InputFile } = await import('grammy');
                        await ctx.api[method](telegramId, new InputFile(filePaths[0]), {
                            caption: `<blockquote expandable>${title}</blockquote>\n\n<i>Diunduh via @${botUsername}</i>`,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[{ text: 'Source', url: url }]]
                            }
                        });
                    }
                }
                catch (err) {
                    await ctx.api.sendMessage(telegramId, `❌ <b>Gagal Mendownload:</b>\n\n${err.message}`, { parse_mode: 'HTML' });
                }
                return;
            }
            if (text.startsWith('status')) {
                const running = userbotManager.isRunning(telegramId);
                await ctx.api.answerGuestQuery(guestQueryId, {
                    text: `🤖 <b>${ctx.me?.first_name || 'Bot'} Status</b>\n\nUserbot: ${userSession ? (running ? '🟢 Running' : '🔴 Stopped') : 'Belum terdaftar'}\nOwner: <b>${callerUser.first_name}</b>`,
                    parse_mode: 'HTML',
                });
                return;
            }
            if (text.startsWith('verify')) {
                await ctx.api.answerGuestQuery(guestQueryId, {
                    text: userSession
                        ? `✅ <b>Verified ${ctx.me?.first_name || 'Bot'} User</b>\n\nAkun <b>${callerUser.first_name}</b> memiliki sesi aktif.`
                        : `⚠️ <b>Belum Terverifikasi</b>\n\nAkun <b>${callerUser.first_name}</b> belum punya sesi aktif.`,
                    parse_mode: 'HTML',
                });
                return;
            }
            if (text.startsWith('stop')) {
                if (!userSession) {
                    await ctx.api.answerGuestQuery(guestQueryId, { text: '❌ Anda belum mendaftarkan userbot.', parse_mode: 'HTML' });
                    return;
                }
                if (userbotManager.isRunning(telegramId))
                    await userbotManager.stopUserbot(telegramId);
                await ctx.api.answerGuestQuery(guestQueryId, {
                    text: '🛑 <b>Emergency Stop</b>\n\nUserbot berhasil dimatikan.',
                    parse_mode: 'HTML',
                });
                return;
            }
            await ctx.api.answerGuestQuery(guestQueryId, {
                text: `📖 <b>${ctx.me?.first_name || 'Bot'} Guest Commands</b>\n\n@${botUsername} status\n@${botUsername} verify\n@${botUsername} stop\n@${botUsername} dl [url]`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: 'Buka Panel', url: `https://t.me/${botUsername}` }]] },
            });
        }
        catch (err) {
            console.error('Guest mode error:', err);
        }
    });
}
