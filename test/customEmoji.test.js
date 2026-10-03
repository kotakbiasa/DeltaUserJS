import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EMOJIS,
  formatTgEmoji,
  escapeHtmlPreservingTgEmoji,
  parseTgEmojiTemplate,
  getCustomEmoji,
  getAllEmojis,
  extractEmojiFromContext
} from '../dist/utils/customEmoji.js';
import { parseRichText } from '../dist/utils/richParser.js';

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

test('parseRichText supports custom emoji shortcodes', () => {
  const result = parseRichText('Halo {first_name}! {emoji:5368324170671202286:💎}', {
    id: 123,
    first_name: 'Alex'
  });
  assert.ok(result.text.includes('Halo Alex!'));
  assert.ok(result.text.includes('<tg-emoji emoji-id="5368324170671202286">💎</tg-emoji>'));
});
