/**
 * Rich Message helper (Telegram Bot API 10.1 / grammY 1.44+).
 *
 * Bot API 10.1 introduced Rich Messages. grammY exposes them via:
 *   - ctx.replyWithRichMessage(rich_message, other?)
 *   - ctx.api.sendRichMessage(chat_id, rich_message, other?)
 *   - ctx.editMessageText(string | rich_message, other?)
 *
 * The send-side payload is an `InputRichMessage`:
 *   { html?: string, markdown?: string, is_rtl?: boolean, skip_entity_detection?: boolean }
 *
 * Rich-message HTML is a *superset* of classic Bot API HTML: in addition to
 * <b> <i> <u> <s> <code> <pre> <a> <blockquote> <tg-spoiler>, it also supports
 * <h1>..<h6>, <ul>/<ol>/<li>, <details>, <tg-collage>, <tg-reference>, anchors, etc.
 *
 * These helpers wrap the rich-message API with a graceful fallback to a classic
 * message (parse_mode HTML/Markdown) so the bot keeps working on clients or chats
 * that do not yet support rich messages. Stick to the classic-safe tags below in
 * content that must survive the fallback; richer tags are fine but are dropped to
 * their text content by Telegram in classic mode.
 *
 * @module utils/richMessage
 */
/**
 * Build an InputRichMessage payload.
 */
export function buildRich(content, opts) {
    const rich = (opts?.markdown
        ? { markdown: String(content ?? '') }
        : { html: String(content ?? '') });
    if (opts?.isRtl) {
        rich.is_rtl = true;
    }
    if (opts?.skipEntityDetection) {
        rich.skip_entity_detection = true;
    }
    return rich;
}
/**
 * Split rich-only options from plain send options (reply_markup, reply_parameters, ...).
 */
function splitOptions(options = {}) {
    const opts = options;
    const markdown = opts.markdown ?? false;
    const isRtl = opts.isRtl;
    const skipEntityDetection = opts.skipEntityDetection;
    const sendOptions = {};
    for (const [k, v] of Object.entries(options)) {
        if (k !== 'markdown' && k !== 'isRtl' && k !== 'skipEntityDetection') {
            sendOptions[k] = v;
        }
    }
    return { richOpts: { markdown, isRtl, skipEntityDetection }, sendOptions };
}
/**
 * Reply with a rich message, falling back to a classic message on failure.
 */
export async function replyRich(ctx, content, options) {
    const { richOpts, sendOptions } = splitOptions(options);
    try {
        return await ctx.replyWithRichMessage(buildRich(content, richOpts), sendOptions);
    }
    catch (err) {
        console.log(`[REPLY-DEBUG] replyWithRichMessage gagal: ${err?.message} — fallback ke classic`);
        const stripped = stripRichTags(content);
        return ctx.reply(stripped, {
            parse_mode: richOpts.markdown ? 'Markdown' : 'HTML',
            ...sendOptions,
        });
    }
}
/**
 * Send a rich message to an explicit chat, falling back to a classic message.
 */
export async function sendRich(api, chatId, content, options) {
    const { richOpts, sendOptions } = splitOptions(options);
    try {
        return await api.sendRichMessage(chatId, buildRich(content, richOpts), sendOptions);
    }
    catch (_err) {
        const stripped = stripRichTags(content);
        return api.sendMessage(chatId, stripped, {
            parse_mode: richOpts.markdown ? 'Markdown' : 'HTML',
            ...sendOptions,
        });
    }
}
/**
 * Edit the current message to rich content, falling back to a classic edit.
 */
export async function editRich(ctx, content, options) {
    const { richOpts, sendOptions } = splitOptions(options);
    try {
        return await ctx.editMessageText(buildRich(content, richOpts), sendOptions);
    }
    catch (_err) {
        const stripped = stripRichTags(content);
        return ctx.editMessageText(stripped, {
            parse_mode: richOpts.markdown ? 'Markdown' : 'HTML',
            ...sendOptions,
        });
    }
}
// ---------------------------------------------------------------------------
// Small HTML builders for composing rich content safely.
// ---------------------------------------------------------------------------
/** Escape text for safe inclusion in HTML rich content. */
export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
export const b = (t) => `<b>${t}</b>`;
export const i = (t) => `<i>${t}</i>`;
export const u = (t) => `<u>${t}</u>`;
export const s = (t) => `<s>${t}</s>`;
export const code = (t) => `<code>${t}</code>`;
export const pre = (t, lang) => `<pre${lang ? ` language="${lang}"` : ''}>${t}</pre>`;
export const spoiler = (t) => `<tg-spoiler>${t}</tg-spoiler>`;
export const link = (text, url) => `<a href="${url}">${text}</a>`;
/** A block quote. Pass `{ expandable: true }` for a collapsible quote. */
export const quote = (t, { expandable = false } = {}) => `<blockquote${expandable ? ' expandable' : ''}>${t}</blockquote>`;
/** Bullet list from an array of (already-formatted) items. */
export const list = (items = []) => `<ul>${items.map((it) => `<li>${it}</li>`).join('')}</ul>`;
/** Section heading (rich-message only; degrades to bold text in classic mode). */
export const heading = (t) => `<h3>${t}</h3>`;
/** Collapsible details block (rich-message only). */
export const details = (summary, body, { open = false } = {}) => `<details${open ? ' open' : ''}><summary>${summary}</summary>${body}</details>`;
/** Build a simple table (rich-message only; degrades to preformatted in classic). */
export function table(rows, opts) {
    const { header = true, bordered = true, striped = false } = opts || {};
    const attrs = [];
    if (bordered) {
        attrs.push('bordered');
    }
    if (striped) {
        attrs.push('striped');
    }
    const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
    let html = `<table${attrStr}>`;
    rows.forEach((row, i) => {
        const isHeader = header && i === 0;
        const tag = isHeader ? 'th' : 'td';
        html += `<tr>${row.map(cell => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
    });
    html += '</table>';
    return html;
}
/** Strip rich-only tags for classic fallback. */
export function stripRichTags(html) {
    return html
        .replace(/<\/?h[1-6][^>]*>/g, '')
        .replace(/<\/?details[^>]*>/g, '')
        .replace(/<\/?summary[^>]*>/g, '')
        .replace(/<\/?ul[^>]*>/g, '')
        .replace(/<\/?ol[^>]*>/g, '')
        .replace(/<\/?li[^>]*>/g, '\n• ')
        .replace(/<\/?table[^>]*>/g, '')
        .replace(/<\/?tr[^>]*>/g, '\n')
        .replace(/<\/?th[^>]*>/g, '')
        .replace(/<\/?td[^>]*>/g, ' | ')
        .replace(/<\/?blockquote[^>]*>/g, '')
        .replace(/<\/?tg-spoiler[^>]*>/g, '')
        .replace(/<\/?tg-collage[^>]*>/g, '')
        .replace(/<\/?tg-reference[^>]*>/g, '')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
}
export default {
    buildRich,
    replyRich,
    sendRich,
    editRich,
    escapeHtml,
    stripRichTags,
    table,
    b, i, u, s, code, pre, spoiler, link, quote, list, heading, details,
};
