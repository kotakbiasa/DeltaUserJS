import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
export default {
    name: 'ghuser',
    version: '1.0.0',
    description: 'Info profil GitHub user.',
    help: {
        title: 'GitHub User (.ghuser)',
        description: 'Menampilkan profil seorang user GitHub.',
        usage: '`.ghuser <username>`',
        detail: 'Contoh: `.ghuser octocat`. Data dari api.github.com.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.ghuser(?:\s+(\S+))?$/i);
        if (!match) {
            return;
        }
        const username = (match[1] || '').trim();
        if (!username) {
            await message.edit({
                text: `<blockquote>❌ <b>Format salah:</b> <code>.ghuser &lt;username&gt;</code>\nContoh: <code>.ghuser octocat</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Mencari profil GitHub ${escapeHtml(username)}...</b></blockquote>`,
            parseMode: 'html'
        });
        try {
            const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
                headers: { 'User-Agent': 'DeltaUserJS' }
            });
            if (res.status === 404) {
                await message.edit({
                    text: `<blockquote>❌ <b>User tidak ditemukan:</b> <code>${escapeHtml(username)}</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            if (!res.ok) {
                throw new Error(`GitHub API responded ${res.status}`);
            }
            const d = await res.json();
            const bio = d.bio ? `\n• <b>Bio</b>: <i>${escapeHtml(d.bio)}</i>` : '';
            const company = d.company ? `\n• <b>Company</b>: ${escapeHtml(d.company)}` : '';
            const loc = d.location ? `\n• <b>Lokasi</b>: ${escapeHtml(d.location)}` : '';
            const blog = d.blog ? `\n• <b>Blog</b>: ${escapeHtml(d.blog)}` : '';
            const twitter = d.twitter_username ? `\n• <b>Twitter</b>: @${escapeHtml(d.twitter_username)}` : '';
            const text = `👤 <b>GitHub — ${escapeHtml(d.name || d.login)}</b>\n\n` +
                `<blockquote>` +
                `• <b>Username</b>: <code>${escapeHtml(d.login)}</code>\n` +
                `• <b>ID</b>: <code>${d.id}</code>${bio}${company}${loc}${blog}${twitter}\n` +
                `• <b>Repos</b>: <code>${d.public_repos}</code> publik\n` +
                `• <b>Followers</b>: <code>${d.followers}</code> | <b>Following</b>: <code>${d.following}</code>\n` +
                `• <b>Sejak</b>: ${new Date(d.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}` +
                `</blockquote>\n\n🔗 ${d.html_url}`;
            if (d.avatar_url) {
                await client.sendMessage(message.chatId, {
                    message: text,
                    file: { source: d.avatar_url },
                    parseMode: 'html',
                    linkPreview: false,
                    replyTo: message.replyToMsgId
                });
                try {
                    await message.delete();
                }
                catch (_e) { /* ignore */ }
            }
            else {
                await message.edit({ text, parseMode: 'html', linkPreview: false });
            }
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in ghuser plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal lookup GitHub:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
