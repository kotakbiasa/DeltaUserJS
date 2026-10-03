import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineCommand, loadingText, usageText, errorText } from '../dist/userbot/engine/defineCommand.js';
import wiki from '../dist/userbot/handlers/util/wiki.js';
import weather from '../dist/userbot/handlers/util/weather.js';
import shortlink from '../dist/userbot/handlers/util/shortlink.js';
import paste from '../dist/userbot/handlers/util/paste.js';

/**
 * Pesan tiruan yang merekam setiap message.edit().
 * Bentuknya mengikuti objek message GramJS seperlunya saja.
 */
function mockMessage(text, extra = {}) {
  return {
    out: true,
    message: text,
    chatId: 123,
    replyToMsgId: undefined,
    edits: [],
    async edit(opts) { this.edits.push(opts); },
    async delete() { this.deleted = true; },
    ...extra,
  };
}

/** Ganti global fetch sementara, lalu kembalikan seperti semula. */
async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const noopClient = { sendMessage: async () => {} };

// ===========================================================================
// defineCommand — perilaku dasar
// ===========================================================================

test('ignores incoming messages (the !message.out guard)', async () => {
  let ran = false;
  const cmd = defineCommand({ name: 'x', run: () => { ran = true; } });
  const msg = mockMessage('.x halo', { out: false });

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(ran, false);
  assert.equal(msg.edits.length, 0);
});

test('ignores messages that do not match the command', async () => {
  let ran = false;
  const cmd = defineCommand({ name: 'x', run: () => { ran = true; } });
  const msg = mockMessage('.yolo');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(ran, false);
  assert.equal(msg.edits.length, 0);
});

test('matches case-insensitively and trims the argument', async () => {
  let seen = null;
  const cmd = defineCommand({ name: 'x', run: ({ arg }) => { seen = arg; } });

  await cmd.execute(noopClient, mockMessage('.X   halo dunia  '), {}, 1);
  assert.equal(seen, 'halo dunia');
});

test('exposes which alias matched for multi-command plugins', async () => {
  const seen = [];
  const cmd = defineCommand({
    name: 'multi',
    commands: ['eval', 'exec', 'sh'],
    run: ({ command }) => { seen.push(command); },
  });

  assert.deepEqual(cmd.commands, ['eval', 'exec', 'sh']);
  await cmd.execute(noopClient, mockMessage('.exec date'), {}, 1);
  await cmd.execute(noopClient, mockMessage('.SH date'), {}, 1);
  await cmd.execute(noopClient, mockMessage('.nope'), {}, 1);
  assert.deepEqual(seen, ['exec', 'sh']);
});

test('required arg shows the usage message and skips run()', async () => {
  let ran = false;
  const cmd = defineCommand({
    name: 'x',
    args: 'required',
    usage: '<code>.x &lt;arg&gt;</code>',
    run: () => { ran = true; },
  });
  const msg = mockMessage('.x');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(ran, false);
  assert.equal(msg.edits[0].text, '<blockquote>❌ <b>Format salah:</b> <code>.x &lt;arg&gt;</code></blockquote>');
  assert.equal(msg.edits[0].parseMode, 'html');
});

test('validate() rejection also shows the usage message', async () => {
  let ran = false;
  const cmd = defineCommand({
    name: 'x',
    args: 'required',
    usage: 'harus angka',
    validate: (arg) => /^\d+$/.test(arg),
    run: () => { ran = true; },
  });
  const msg = mockMessage('.x abc');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(ran, false);
  assert.match(msg.edits[0].text, /Format salah/);
});

test('resolveArg() fills in a missing argument', async () => {
  let seen = null;
  const cmd = defineCommand({
    name: 'x',
    args: 'required',
    usage: 'u',
    resolveArg: () => 'dari reply',
    run: ({ arg }) => { seen = arg; },
  });

  await cmd.execute(noopClient, mockMessage('.x'), {}, 1);
  assert.equal(seen, 'dari reply');
});

test('loading text is edited before run(), final string after', async () => {
  const cmd = defineCommand({
    name: 'x',
    loading: 'Memproses...',
    finalExtra: { linkPreview: false },
    run: () => 'selesai',
  });
  const msg = mockMessage('.x');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(msg.edits.length, 2);
  assert.equal(msg.edits[0].text, '<blockquote>⏳ <b>Memproses...</b></blockquote>');
  assert.equal(msg.edits[1].text, 'selesai');
  assert.equal(msg.edits[1].linkPreview, false);
});

test('run() returning void leaves the message to the plugin', async () => {
  const cmd = defineCommand({
    name: 'x',
    run: async ({ edit }) => { await edit('ditangani sendiri'); },
  });
  const msg = mockMessage('.x');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.deepEqual(msg.edits.map((e) => e.text), ['ditangani sendiri']);
});

test('a thrown error becomes the standard error message, HTML-escaped', async () => {
  const cmd = defineCommand({
    name: 'x',
    errorTitle: 'Gagal sesuatu',
    run: () => { throw new Error('pecah <b>bold</b>'); },
  });
  const msg = mockMessage('.x');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(
    msg.edits.at(-1).text,
    '<blockquote>❌ <b>Gagal sesuatu:</b> pecah &lt;b&gt;bold&lt;/b&gt;</blockquote>'
  );
});

test('text builders match the hand-written format exactly', () => {
  assert.equal(loadingText('Memuat...'), '<blockquote>⏳ <b>Memuat...</b></blockquote>');
  assert.equal(usageText('<code>.x</code>'), '<blockquote>❌ <b>Format salah:</b> <code>.x</code></blockquote>');
  assert.equal(errorText('Gagal', 'alasan'), '<blockquote>❌ <b>Gagal:</b> alasan</blockquote>');
});

// ===========================================================================
// Paritas plugin yang dimigrasi — string di bawah ini disalin verbatim dari
// implementasi manual sebelum migrasi (commit 1660a1b).
// ===========================================================================

test('weather: usage, loading, and error text are unchanged', async () => {
  const missing = mockMessage('.weather');
  await weather.execute(noopClient, missing, {}, 1);
  assert.equal(
    missing.edits[0].text,
    '<blockquote>❌ <b>Format salah:</b> <code>.weather &lt;kota&gt;</code>\nContoh: <code>.weather Jakarta</code></blockquote>'
  );

  const msg = mockMessage('.weather Jakarta');
  await withFetch(
    async () => ({ ok: false, status: 503 }),
    () => weather.execute(noopClient, msg, {}, 1)
  );
  assert.equal(msg.edits[0].text, '<blockquote>⏳ <b>Mengecek cuaca Jakarta...</b></blockquote>');
  assert.equal(msg.edits[1].text, '<blockquote>❌ <b>Gagal cek cuaca:</b> wttr.in responded 503</blockquote>');
});

test('weather: success output is unchanged', async () => {
  const msg = mockMessage('.weather Makassar');
  await withFetch(
    async () => ({ ok: true, status: 200, text: async () => 'Makassar: 🌦 +27°C\n' }),
    () => weather.execute(noopClient, msg, {}, 1)
  );
  assert.equal(
    msg.edits.at(-1).text,
    '🌤️ <b>Cuaca Makassar</b>\n\n<blockquote>Makassar: 🌦 +27°C</blockquote>'
  );
});

test('weather: city name is HTML-escaped in both loading and result', async () => {
  const msg = mockMessage('.weather <script>');
  await withFetch(
    async () => ({ ok: true, status: 200, text: async () => 'ok' }),
    () => weather.execute(noopClient, msg, {}, 1)
  );
  assert.ok(!msg.edits[0].text.includes('<script>'));
  assert.match(msg.edits[0].text, /&lt;script&gt;/);
});

test('shortlink: rejects a non-http argument with the usage message', async () => {
  const msg = mockMessage('.shortlink ftp://nope');
  await shortlink.execute(noopClient, msg, {}, 1);
  assert.equal(
    msg.edits[0].text,
    '<blockquote>❌ <b>Format salah:</b> <code>.shortlink &lt;url&gt;</code>\nURL harus diawali http:// atau https://</blockquote>'
  );
});

test('shortlink: success output and linkPreview flag are unchanged', async () => {
  const msg = mockMessage('.shortlink https://contoh.com/panjang');
  await withFetch(
    async () => ({ ok: true, status: 200, text: async () => 'https://tinyurl.com/abc\n' }),
    () => shortlink.execute(noopClient, msg, {}, 1)
  );
  const final = msg.edits.at(-1);
  assert.equal(
    final.text,
    '🔗 <b>Shortlink</b>\n\n<blockquote><code>https://tinyurl.com/abc</code></blockquote>\n<i>Asli:</i> https://contoh.com/panjang'
  );
  assert.equal(final.linkPreview, false);
});

test('paste: oversize input is rejected before any network call', async () => {
  const big = 'a'.repeat(500 * 1024 + 1);
  const msg = mockMessage(`.paste ${big}`);
  let fetched = false;

  await withFetch(
    async () => { fetched = true; return { ok: true, status: 200, text: async () => 'x' }; },
    () => paste.execute(noopClient, msg, {}, 1)
  );

  assert.equal(fetched, false);
  assert.match(msg.edits.at(-1).text, /^<blockquote>❌ <b>Terlalu besar:<\/b> \d+ bytes \(maksimal 500KB \/ 512000 bytes\)<\/blockquote>$/);
});

test('paste: falls back to the replied-to message', async () => {
  const msg = mockMessage('.paste', {
    replyToMsgId: 42,
    getReplyMessage: async () => ({ message: '  isi dari reply  ' }),
  });
  let sentBody = null;

  await withFetch(
    async (_url, init) => { sentBody = init.body; return { ok: true, status: 200, text: async () => 'https://paste.rs/ab' }; },
    () => paste.execute(noopClient, msg, {}, 1)
  );

  assert.equal(sentBody, 'isi dari reply');
  assert.equal(msg.edits.at(-1).text, '📝 <b>Paste</b>\n\n🔗 https://paste.rs/ab');
});

test('paste: no argument and no reply shows the usage message', async () => {
  const msg = mockMessage('.paste');
  await paste.execute(noopClient, msg, {}, 1);
  assert.equal(
    msg.edits[0].text,
    '<blockquote>❌ <b>Format salah:</b> <code>.paste &lt;teks&gt;</code>\nAtau reply sebuah pesan teks lalu kirim <code>.paste</code></blockquote>'
  );
});

test('wiki: 404 produces the dedicated not-found message, not the generic error', async () => {
  const msg = mockMessage('.wiki Tidakada');
  await withFetch(
    async () => ({ ok: false, status: 404 }),
    () => wiki.execute(noopClient, msg, {}, 1)
  );
  assert.equal(
    msg.edits.at(-1).text,
    '<blockquote>❌ <b>Artikel tidak ditemukan:</b> <i>Tidakada</i></blockquote>'
  );
});

test('wiki: plain summary is edited in place with linkPreview disabled', async () => {
  const msg = mockMessage('.wiki Indonesia');
  await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        title: 'Indonesia',
        extract: 'Negara di Asia Tenggara.',
        content_urls: { desktop: { page: 'https://id.wikipedia.org/wiki/Indonesia' } },
      }),
    }),
    () => wiki.execute(noopClient, msg, {}, 1)
  );

  const final = msg.edits.at(-1);
  assert.equal(
    final.text,
    '📚 <b>Wikipedia</b>\n\n<blockquote><b>Indonesia</b>\nNegara di Asia Tenggara.</blockquote>\n\n🔗 https://id.wikipedia.org/wiki/Indonesia'
  );
  assert.equal(final.linkPreview, false);
});

test('wiki: a thumbnail sends a new photo and deletes the command message', async () => {
  const msg = mockMessage('.wiki Indonesia');
  let sent = null;
  const client = { sendMessage: async (chatId, opts) => { sent = { chatId, opts }; } };

  await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        title: 'Indonesia',
        extract: 'Ringkasan.',
        thumbnail: { source: 'https://example.com/a.png' },
      }),
    }),
    () => wiki.execute(client, msg, {}, 1)
  );

  assert.equal(sent.chatId, 123);
  assert.equal(sent.opts.file.source, 'https://example.com/a.png');
  assert.equal(sent.opts.linkPreview, false);
  assert.equal(msg.deleted, true);
  // Hanya pesan loading yang di-edit; hasil akhir dikirim sebagai pesan baru.
  assert.equal(msg.edits.length, 1);
});
