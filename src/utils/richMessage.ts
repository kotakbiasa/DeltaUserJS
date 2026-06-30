// @ts-nocheck
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
 * @param {string} content - HTML (default) or Markdown content.
 * @param {object} [opts]
 * @param {boolean} [opts.markdown=false] - Treat `content` as Markdown instead of HTML.
 * @param {boolean} [opts.isRtl] - Render right-to-left.
 * @param {boolean} [opts.skipEntityDetection] - Disable auto entity detection.
 * @returns {import('grammy/types').InputRichMessage}
 */
export function buildRich(content: any, { markdown = false, isRtl, skipEntityDetection }: any = {}): any {
  const rich = markdown
    ? { markdown: String(content ?? '') }
    : { html: String(content ?? '') };
  if (isRtl) rich.is_rtl = true;
  if (skipEntityDetection) rich.skip_entity_detection = true;
  return rich;
}

/**
 * Split rich-only options from plain send options (reply_markup, reply_parameters, ...).
 * @param {object} options
 */
function splitOptions(options = {}) {
  const { markdown = false, isRtl, skipEntityDetection, ...sendOptions } = options;
  return { richOpts: { markdown, isRtl, skipEntityDetection }, sendOptions };
}

/**
 * Reply with a rich message, falling back to a classic message on failure.
 * @param {import('grammy').Context} ctx
 * @param {string} content - HTML (default) or Markdown content.
 * @param {object} [options] - markdown/isRtl/skipEntityDetection + any send option (reply_markup, reply_parameters, ...).
 * @returns {Promise<import('grammy/types').Message>}
 */
export async function replyRich(ctx, content, options = {}) {
  const { richOpts, sendOptions } = splitOptions(options);
  try {
    return await ctx.replyWithRichMessage(buildRich(content, richOpts), sendOptions);
  } catch (err) {
    return ctx.reply(String(content ?? ''), {
      parse_mode: richOpts.markdown ? 'Markdown' : 'HTML',
      ...sendOptions,
    });
  }
}

/**
 * Send a rich message to an explicit chat, falling back to a classic message.
 * @param {import('grammy').Api} api
 * @param {number|string} chatId
 * @param {string} content
 * @param {object} [options]
 * @returns {Promise<import('grammy/types').Message>}
 */
export async function sendRich(api, chatId, content, options = {}) {
  const { richOpts, sendOptions } = splitOptions(options);
  try {
    return await api.sendRichMessage(chatId, buildRich(content, richOpts), sendOptions);
  } catch (err) {
    return api.sendMessage(chatId, String(content ?? ''), {
      parse_mode: richOpts.markdown ? 'Markdown' : 'HTML',
      ...sendOptions,
    });
  }
}

/**
 * Edit the current message to rich content, falling back to a classic edit.
 * @param {import('grammy').Context} ctx
 * @param {string} content
 * @param {object} [options]
 */
export async function editRich(ctx, content, options = {}) {
  const { richOpts, sendOptions } = splitOptions(options);
  try {
    return await ctx.editMessageText(buildRich(content, richOpts), sendOptions);
  } catch (err) {
    return ctx.editMessageText(String(content ?? ''), {
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
    .replace(/>/g, '&gt;');
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
export const quote = (t, { expandable = false } = {}) =>
  `<blockquote${expandable ? ' expandable' : ''}>${t}</blockquote>`;

/** Bullet list from an array of (already-formatted) items. */
export const list = (items = []) =>
  `<ul>${items.map((it) => `<li>${it}</li>`).join('')}</ul>`;

/** Section heading (rich-message only; degrades to bold text in classic mode). */
export const heading = (t) => `<h3>${t}</h3>`;

/** Collapsible details block (rich-message only). */
export const details = (summary, body, { open = false } = {}) =>
  `<details${open ? ' open' : ''}><summary>${summary}</summary>${body}</details>`;

export default {
  buildRich,
  replyRich,
  sendRich,
  editRich,
  escapeHtml,
  b, i, u, s, code, pre, spoiler, link, quote, list, heading, details,
};
