import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EMOJIS,
  formatTgEmoji,
  escapeHtmlPreservingTgEmoji,
  parseTgEmojiTemplate,
  getCustomEmoji,
  getAllEmojis,
  extractEmojiFromContext,
  animateEmojisWithRestrictedPack,
  animateBotApiPayload,
  stripTgEmojiTags
} from '../dist/utils/customEmoji.js';

test('formatTgEmoji formats tag properly', () => {
  const tag = formatTgEmoji('5368324170671202286', '🔥');
  assert.equal(tag, '<tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji>');
});

test('escapeHtmlPreservingTgEmoji protects against XSS while preserving valid custom emoji tags', () => {
  const input = 'Hello <tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji> & <script>alert("hack")</script>';
  const output = escapeHtmlPreservingTgEmoji(input);
  assert.ok(output.includes('<tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji>'));
  assert.ok(output.includes('&amp;'));
  assert.ok(output.includes('&lt;script&gt;'));
  assert.ok(!output.includes('<script>'));
});

test('stripTgEmojiTags restores fallback characters for non-Premium accounts', () => {
  const input = 'Status: <tg-emoji emoji-id="123456789">💎</tg-emoji> siap';
  assert.equal(stripTgEmojiTags(input), 'Status: 💎 siap');
});

test('parseTgEmojiTemplate converts {emoji:id} and {emoji:id:char}', () => {
  const input = 'Status: {emoji:5368324170671202286:🚀} dan {emoji:123456789}';
  const output = parseTgEmojiTemplate(input);
  assert.equal(
    output,
    'Status: <tg-emoji emoji-id="5368324170671202286">🚀</tg-emoji> dan <tg-emoji emoji-id="123456789">⭐</tg-emoji>'
  );
});

test('getCustomEmoji returns default, custom, and alias fallbacks correctly', () => {
  assert.equal(getCustomEmoji(null, 'ping'), DEFAULT_EMOJIS.ping);

  const mockSettings = {
    custom_emojis: {
      ping: '<tg-emoji emoji-id="111">🏓</tg-emoji>',
      proses: '<tg-emoji emoji-id="222">⏳</tg-emoji>'
    }
  };

  assert.equal(getCustomEmoji(mockSettings, 'ping'), '<tg-emoji emoji-id="111">🏓</tg-emoji>');
  // alias check: 'loading' falls back to 'proses'
  assert.equal(getCustomEmoji(mockSettings, 'loading'), '<tg-emoji emoji-id="222">⏳</tg-emoji>');
  // not set falls back to default
  assert.equal(getCustomEmoji(mockSettings, 'done'), DEFAULT_EMOJIS.done);
});

test('getAllEmojis lists all supported keys with active values', () => {
  const mockSettings = {
    custom_emojis: {
      speed: '<tg-emoji emoji-id="999">🚀</tg-emoji>'
    }
  };
  const list = getAllEmojis(mockSettings);
  assert.ok(list.speed.isCustom);
  assert.equal(list.speed.value, '<tg-emoji emoji-id="999">🚀</tg-emoji>');
  assert.ok(!list.ping.isCustom);
  assert.equal(list.ping.value, DEFAULT_EMOJIS.ping);
});

test('extractEmojiFromContext parses tag, numeric ID, shortcode, and entities', () => {
  // Direct tag
  const fromTag = extractEmojiFromContext('<tg-emoji emoji-id="555555">😎</tg-emoji>');
  assert.ok(fromTag?.isCustomEmoji);
  assert.equal(fromTag?.documentId, '555555');

  // Shortcode
  const fromShortcode = extractEmojiFromContext('{emoji:777777:🎉}');
  assert.ok(fromShortcode?.isCustomEmoji);
  assert.equal(fromShortcode?.documentId, '777777');
  assert.equal(fromShortcode?.char, '🎉');

  // Pure numeric ID
  const fromNumeric = extractEmojiFromContext('5368324170671202286');
  assert.ok(fromNumeric?.isCustomEmoji);
  assert.equal(fromNumeric?.documentId, '5368324170671202286');

  // From message entities
  const mockMessage = {
    message: 'Check this ⭐ out',
    entities: [
      {
        className: 'MessageEntityCustomEmoji',
        offset: 11,
        length: 1,
        documentId: 888888n
      }
    ]
  };
  const fromEntity = extractEmojiFromContext('', mockMessage);
  assert.ok(fromEntity?.isCustomEmoji);
  assert.equal(fromEntity?.documentId, '888888');
});

test('animateEmojisWithRestrictedPack animates standard emojis to RestrictedEmoji pack', () => {
  const input = '🏓 Pong! 🚀 Speed ⏰ Time ✅ Selesai ❌ Gagal ⏳ Proses ⚡ Kilat';
  const output = animateEmojisWithRestrictedPack(input);
  assert.ok(output.includes('<tg-emoji emoji-id="5269563867305879894">🏓</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5445284980978621387">🚀</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5413704112220949842">⏰</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5465665476971471368">❌</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5451732530048802485">⏳</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5431449001532594346">⚡</tg-emoji>'));
});

test('animateEmojisWithRestrictedPack preserves existing <tg-emoji> and does not double-wrap', () => {
  const input = 'Sudah custom: <tg-emoji emoji-id="999999">🔥</tg-emoji> dan biasa 🏓';
  const output = animateEmojisWithRestrictedPack(input);
  assert.ok(output.includes('<tg-emoji emoji-id="999999">🔥</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5269563867305879894">🏓</tg-emoji>'));
  assert.ok(!output.includes('<tg-emoji emoji-id="999999"><tg-emoji'));
});

test('animateEmojisWithRestrictedPack protects <code> and <pre> blocks', () => {
  const input = 'Teks luar 🏓 <code>.ping 🏓</code> dan <pre>raw 🚀</pre>';
  const output = animateEmojisWithRestrictedPack(input);
  assert.ok(output.includes('<tg-emoji emoji-id="5269563867305879894">🏓</tg-emoji>'));
  assert.ok(output.includes('<code>.ping 🏓</code>'));
  assert.ok(output.includes('<pre>raw 🚀</pre>'));
});

test('animateEmojisWithRestrictedPack handles aliases and VS16 variation selectors', () => {
  // ❤️ with VS16 and without, ⚠️ warning, ⚙️ settings, 📢 broadcast, 🔒 lock
  const input = '❤️ Cinta ⚠️ Warning ⚙️ Config 📢 Info 🔒 Kunci';
  const output = animateEmojisWithRestrictedPack(input);
  assert.ok(output.includes('<tg-emoji emoji-id="5449505950283078474">❤</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5467928559664242360">❗</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5449428597922079323">🧰</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5469903029144657419">📣</tg-emoji>'));
  assert.ok(output.includes('<tg-emoji emoji-id="5472308992514464048">🔐</tg-emoji>'));
});

test('animateBotApiPayload applies premium emoji to Master Bot text and captions', () => {
  const messagePayload = { text: '✅ Siap' };
  animateBotApiPayload('sendMessage', messagePayload);
  assert.equal(messagePayload.parse_mode, 'HTML');
  assert.ok(messagePayload.text.includes('<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>'));

  const mediaPayload = { media: [{ type: 'photo', media: 'file-id', caption: '🚀 Upload' }] };
  animateBotApiPayload('sendMediaGroup', mediaPayload);
  assert.ok(mediaPayload.media[0].caption.includes('<tg-emoji emoji-id="5445284980978621387">🚀</tg-emoji>'));
  assert.equal(mediaPayload.media[0].parse_mode, 'HTML');

  const richPayload = { rich_message: { html: '<p>✅ Dashboard siap</p>' } };
  animateBotApiPayload('sendRichMessage', richPayload);
  assert.ok(richPayload.rich_message.html.includes('<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>'));
});

test('animateBotApiPayload does not corrupt Markdown payloads', () => {
  const markdownPayload = { text: '✅ **done**', parse_mode: 'MarkdownV2' };
  animateBotApiPayload('sendMessage', markdownPayload);
  assert.equal(markdownPayload.text, '✅ **done**');

  const rawPayload = { text: '✅ raw', parse_mode: undefined };
  animateBotApiPayload('sendMessage', rawPayload);
  assert.ok(rawPayload.text.includes('<tg-emoji'));
});
