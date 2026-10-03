import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearRegistry,
  registerPlugin,
  parseCommandName,
  getPluginForCommand,
  indexedCommandCount,
  loadedPlugins,
} from '../dist/userbot/engine/pluginRegistry.js';
import { defineCommand } from '../dist/userbot/engine/defineCommand.js';
import calc from '../dist/userbot/handlers/util/calc.js';
import adzan from '../dist/userbot/handlers/util/adzan.js';
import gempa from '../dist/userbot/handlers/util/gempa.js';
import qr from '../dist/userbot/handlers/tools/qr.js';

function mockMessage(text, extra = {}) {
  return {
    out: true,
    message: text,
    chatId: 123,
    edits: [],
    async edit(opts) { this.edits.push(opts); },
    async delete() { this.deleted = true; },
    ...extra,
  };
}

async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

const noopClient = { sendMessage: async () => {} };

// ===========================================================================
// parseCommandName — dipakai dispatcher di client.ts
// ===========================================================================

test('parseCommandName extracts the command from a message', () => {
  assert.equal(parseCommandName('.qr halo'), 'qr');
  assert.equal(parseCommandName('.gempa'), 'gempa');
  assert.equal(parseCommandName('.QR halo'), 'qr', 'harus case-insensitive');
  assert.equal(parseCommandName('.clear_all'), 'clear_all');
});

test('parseCommandName returns null for non-commands', () => {
  assert.equal(parseCommandName('halo semua'), null);
  assert.equal(parseCommandName(''), null);
  assert.equal(parseCommandName(undefined), null);
  assert.equal(parseCommandName('..'), null);
  // Prefix lama yang sengaja disabotase client.ts tidak boleh dianggap command.
  assert.equal(parseCommandName('_\x00_.gempa'), null);
});

test('parseCommandName does not treat a longer word as the shorter command', () => {
  // ".qrcode" bukan ".qr" — dispatcher tidak boleh salah arahkan.
  assert.equal(parseCommandName('.qrcode x'), 'qrcode');
  assert.notEqual(parseCommandName('.qrcode x'), 'qr');
});

// ===========================================================================
// Indeks command
// ===========================================================================

test('registerPlugin indexes commands, clearRegistry empties the index', () => {
  clearRegistry();
  assert.equal(indexedCommandCount(), 0);

  registerPlugin(defineCommand({ name: 'alpha', run: () => {} }));
  registerPlugin(defineCommand({ name: 'multi', commands: ['beta', 'gamma'], run: () => {} }));
  // Plugin pasif gaya lama: tanpa metadata commands.
  registerPlugin({ name: 'passive', execute: () => {} });

  assert.equal(indexedCommandCount(), 3);
  assert.equal(getPluginForCommand('alpha').name, 'alpha');
  assert.equal(getPluginForCommand('beta').name, 'multi');
  assert.equal(getPluginForCommand('gamma').name, 'multi');
  assert.equal(getPluginForCommand('passive'), null, 'plugin tanpa metadata tidak diindeks');
  assert.equal(getPluginForCommand('tidakada'), null);
  assert.equal(loadedPlugins.length, 3);

  clearRegistry();
  assert.equal(indexedCommandCount(), 0);
  assert.equal(getPluginForCommand('alpha'), null);
});

test('a command claimed twice keeps the first plugin and still registers the second', () => {
  clearRegistry();
  registerPlugin(defineCommand({ name: 'first', commands: ['dup'], run: () => {} }));
  // Tidak boleh melempar — plugin kedua tetap termuat, hanya tidak ikut indeks.
  registerPlugin(defineCommand({ name: 'second', commands: ['dup'], run: () => {} }));

  assert.equal(getPluginForCommand('dup').name, 'first');
  assert.equal(loadedPlugins.length, 2);
  clearRegistry();
});

test('the dispatcher skip rule matches what the plugin would have done anyway', async () => {
  // Meniru logika di client.ts: plugin command yang bukan target dilewati.
  // Hasilnya harus sama dengan memanggilnya (regex internal tidak cocok).
  clearRegistry();
  let ranWhenCalled = false;
  const plugin = defineCommand({ name: 'alpha', run: () => { ranWhenCalled = true; } });
  registerPlugin(plugin);

  const msg = mockMessage('.beta sesuatu');
  const activeCommand = parseCommandName(msg.message);
  const target = getPluginForCommand(activeCommand);
  assert.notEqual(target, plugin, 'dispatcher akan melewati plugin ini');

  // Buktikan: andai tetap dipanggil, plugin memang tidak melakukan apa-apa.
  await plugin.execute(noopClient, msg, {}, 1);
  assert.equal(ranWhenCalled, false);
  assert.equal(msg.edits.length, 0);
  clearRegistry();
});

// ===========================================================================
// Fitur defineCommand tambahan
// ===========================================================================

test("args 'none' ignores the message when an argument is supplied", async () => {
  let ran = 0;
  const cmd = defineCommand({ name: 'x', args: 'none', run: () => { ran++; } });

  const bare = mockMessage('.x');
  await cmd.execute(noopClient, bare, {}, 1);
  assert.equal(ran, 1);

  const withArg = mockMessage('.x ekstra');
  await cmd.execute(noopClient, withArg, {}, 1);
  assert.equal(ran, 1, 'argumen tak terduga harus diabaikan diam-diam');
  assert.equal(withArg.edits.length, 0, 'tidak boleh ada pesan error');
});

test('defaultArg fills in when the user supplies nothing', async () => {
  let seen = null;
  const cmd = defineCommand({ name: 'x', defaultArg: 'Jakarta', run: ({ arg }) => { seen = arg; } });

  await cmd.execute(noopClient, mockMessage('.x'), {}, 1);
  assert.equal(seen, 'Jakarta');
  await cmd.execute(noopClient, mockMessage('.x Bandung'), {}, 1);
  assert.equal(seen, 'Bandung');
});

test("loadingStyle 'plain' omits the blockquote wrapper", async () => {
  const cmd = defineCommand({ name: 'x', loading: 'Memuat...', loadingStyle: 'plain', run: () => 'ok' });
  const msg = mockMessage('.x');

  await cmd.execute(noopClient, msg, {}, 1);
  assert.equal(msg.edits[0].text, '⏳ <b>Memuat...</b>');
});

// ===========================================================================
// Paritas plugin batch kedua (string disalin dari implementasi pre-migrasi)
// ===========================================================================

test('calc: result, usage, and error text are unchanged', async () => {
  const ok = mockMessage('.calc 5 + 10 * 2');
  await calc.execute(noopClient, ok, {}, 1);
  assert.equal(
    ok.edits.at(-1).text,
    '🧮 <b>Kalkulator</b>\n\n<blockquote><code>5 + 10 * 2</code> = <b>25</b></blockquote>'
  );

  const missing = mockMessage('.calc');
  await calc.execute(noopClient, missing, {}, 1);
  assert.equal(
    missing.edits[0].text,
    '<blockquote>❌ <b>Format salah:</b> <code>.calc &lt;ekspresi&gt;</code>\nContoh: <code>.calc 5 + 10 * 2</code></blockquote>'
  );

  const bad = mockMessage('.calc 1/0');
  await calc.execute(noopClient, bad, {}, 1);
  assert.equal(bad.edits.at(-1).text, '<blockquote>❌ <b>Error:</b> Pembagian dengan nol</blockquote>');

  const unsafe = mockMessage('.calc process.exit(1)');
  await calc.execute(noopClient, unsafe, {}, 1);
  assert.match(unsafe.edits.at(-1).text, /Karakter tidak diizinkan/);
});

test('adzan: defaults to Jakarta and keeps its unwrapped loading line', async () => {
  const msg = mockMessage('.adzan');
  await withFetch(
    async (url) => {
      assert.match(url, /city=Jakarta/);
      return { ok: true, status: 200, json: async () => ({ code: 200, data: { date: { readable: '03 Oct 2026' }, timings: { Sunrise: '05:50 (WIB)', Fajr: '04:30', Dhuhr: '11:50', Asr: '15:10', Maghrib: '17:55', Isha: '19:05' } } }) };
    },
    () => adzan.execute(noopClient, msg, {}, 1)
  );

  assert.equal(msg.edits[0].text, '⏳ <b>Mencari jadwal sholat untuk Jakarta...</b>');
  assert.match(msg.edits.at(-1).text, /^🕌 <b>Jadwal Shalat Hari Ini<\/b>/);
  assert.match(msg.edits.at(-1).text, /<b>Terbit  :<\/b> <code>05:50<\/code>/, 'keterangan (WIB) harus dibuang');
});

test('adzan: an unknown city gets the dedicated message, not the generic error', async () => {
  const msg = mockMessage('.adzan Kotantahberantah');
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ code: 404 }) }),
    () => adzan.execute(noopClient, msg, {}, 1)
  );
  assert.equal(
    msg.edits.at(-1).text,
    '<blockquote>❌ <b>Tidak Dapat Menemukan Kota:</b> <code>Kotantahberantah</code></blockquote>'
  );
});

test('gempa: takes no argument and ignores anything extra', async () => {
  const withArg = mockMessage('.gempa besar');
  let fetched = false;
  await withFetch(
    async () => { fetched = true; return { ok: true, status: 200, json: async () => ({}) }; },
    () => gempa.execute(noopClient, withArg, {}, 1)
  );
  assert.equal(fetched, false);
  assert.equal(withArg.edits.length, 0);
});

test('gempa: renders the BMKG summary and sends the shakemap as a photo', async () => {
  const payload = {
    Infogempa: {
      gempa: {
        Magnitude: '5.2', Kedalaman: '10 km', Wilayah: 'Laut Banda',
        Tanggal: '03 Okt 2026', Jam: '12:00 WIB', Potensi: 'Tidak berpotensi tsunami',
        Dirasakan: 'II Ambon', Shakemap: 'map.jpg',
      },
    },
  };

  const plain = mockMessage('.gempa');
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ Infogempa: { gempa: { ...payload.Infogempa.gempa, Shakemap: undefined } } }) }),
    () => gempa.execute(noopClient, plain, {}, 1)
  );
  assert.match(plain.edits.at(-1).text, /🌍 <b>Gempa Terkini — BMKG<\/b>/);
  assert.match(plain.edits.at(-1).text, /• <b>Magnitudo<\/b>: 5\.2/);

  const withMap = mockMessage('.gempa');
  let sent = null;
  const client = { sendMessage: async (chatId, opts) => { sent = { chatId, opts }; } };
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => payload }),
    () => gempa.execute(client, withMap, {}, 1)
  );
  assert.equal(sent.opts.file.source, 'https://data.bmkg.go.id/DataMKG/TEWS/map.jpg');
  // Pesan command tidak dihapus di jalur ini — sama seperti sebelum migrasi.
  assert.equal(withMap.deleted, undefined);
});

test('qr: usage message and photo upload path are unchanged', async () => {
  const missing = mockMessage('.qr');
  await qr.execute(noopClient, missing, {}, 1);
  assert.equal(
    missing.edits[0].text,
    '<blockquote>❌ <b>Format salah:</b> <code>.qr &lt;teks&gt;</code>\nContoh: <code>.qr halo semua</code></blockquote>'
  );

  const msg = mockMessage('.qr halo');
  let sent = null;
  const client = { sendMessage: async (chatId, opts) => { sent = { chatId, opts }; } };
  await withFetch(
    async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(200).buffer }),
    () => qr.execute(client, msg, {}, 1)
  );
  assert.equal(msg.edits[0].text, '<blockquote>⏳ <b>Membuat QR Code...</b></blockquote>');
  assert.equal(sent.opts.file.filename, 'qr.png');
  assert.equal(sent.opts.message, '🔗 <b>QR Code</b>\n<blockquote>halo</blockquote>');
  assert.equal(msg.deleted, true);
});

test('qr: a too-small response is reported as a failure', async () => {
  const msg = mockMessage('.qr halo');
  await withFetch(
    async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(10).buffer }),
    () => qr.execute(noopClient, msg, {}, 1)
  );
  assert.equal(
    msg.edits.at(-1).text,
    '<blockquote>❌ <b>Gagal membuat QR:</b> QR terlalu kecil / tidak valid</blockquote>'
  );
});

// ===========================================================================
// Temuan #3 — rate limit hanya untuk command sendiri
// ===========================================================================

test('rate limit only counts the userbot own commands', async () => {
  const { shouldCountForRateLimit } = await import('../dist/userbot/engine/rateLimiter.js');

  // Dihitung: command yang kita kirim sendiri.
  assert.equal(shouldCountForRateLimit({ out: true, message: '.ping' }), true);
  assert.equal(shouldCountForRateLimit({ out: true, message: '.gcast halo' }), true);

  // TIDAK dihitung: pesan orang lain, berapa pun banyaknya. Inilah yang dulu
  // membuat grup ramai mematikan anti-flood, welcome, dan keyword filter.
  assert.equal(shouldCountForRateLimit({ out: false, message: '.ping' }), false);
  assert.equal(shouldCountForRateLimit({ out: false, message: 'halo semua' }), false);

  // TIDAK dihitung: obrolan biasa kita sendiri.
  assert.equal(shouldCountForRateLimit({ out: true, message: 'halo semua' }), false);

  // TIDAK dihitung: prefix lama yang sudah disabotase client.ts.
  assert.equal(shouldCountForRateLimit({ out: true, message: '_\x00_.ping' }), false);

  // Pesan tanpa teks (foto/stiker) tidak boleh bikin crash.
  assert.equal(shouldCountForRateLimit({ out: true }), false);
  assert.equal(shouldCountForRateLimit(null), false);
});

test('a burst of incoming group messages no longer exhausts the quota', async () => {
  const { shouldCountForRateLimit } = await import('../dist/userbot/engine/rateLimiter.js');

  // 100 pesan masuk dari anggota grup — limitnya 30 per 10 detik.
  const incoming = Array.from({ length: 100 }, (_, i) => ({ out: false, message: `obrolan ${i}` }));
  const counted = incoming.filter(shouldCountForRateLimit).length;
  assert.equal(counted, 0, 'tidak satu pun pesan masuk boleh memakan kuota');
});
