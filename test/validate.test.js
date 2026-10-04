/**
 * Lapisan validasi argumen perintah userbot (`src/userbot/engine/validate.ts`).
 *
 * Fokus pengujian adalah input yang DULU lolos: `parseInt('5abc')` jadi 5,
 * `Number('')` jadi 0, dan durasi tanpa batas atas yang membuat timer Node
 * meledak seketika (delay > 2^31-1 ms diam-diam dijadikan 1 ms).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TIMER_MS,
  parseIntArg,
  parseTelegramIdArg,
  parseDurationMsArg,
  parseChoiceArg,
  parseTextArg,
  validationErrorText,
} from '../dist/userbot/engine/validate.js';

test('parseIntArg menerima bilangan bulat dalam rentang', () => {
  const r = parseIntArg('5', { min: 1, max: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.value, 5);
});

test('parseIntArg menolak angka berekor huruf yang dulu lolos lewat parseInt', () => {
  assert.equal(parseInt('5abc', 10), 5); // perilaku lama
  const r = parseIntArg('5abc');
  assert.equal(r.ok, false);
  assert.match(r.error, /angka bulat/i);
});

test('parseIntArg menolak kosong, desimal, dan di luar rentang', () => {
  assert.equal(parseIntArg('').ok, false);
  assert.equal(parseIntArg('   ').ok, false);
  assert.equal(parseIntArg('1.5').ok, false);
  assert.equal(parseIntArg('0', { min: 1 }).ok, false);
  assert.equal(parseIntArg('101', { max: 100 }).ok, false);
  assert.equal(parseIntArg('999999999999999999999').ok, false);
});

test('parseIntArg memakai label pada pesan error', () => {
  const r = parseIntArg('abc', { label: 'Batas limit flood' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Batas limit flood/);
});

test('parseTelegramIdArg menerima ID positif maupun grup bertanda minus', () => {
  assert.equal(parseTelegramIdArg('12345').value, 12345);
  assert.equal(parseTelegramIdArg('-1001234567890').value, -1001234567890);
});

test('parseTelegramIdArg menolak nol, kosong, dan non-angka', () => {
  assert.equal(Number(''), 0); // perilaku lama yang berbahaya
  assert.equal(parseTelegramIdArg('').ok, false);
  assert.equal(parseTelegramIdArg('0').ok, false);
  assert.equal(parseTelegramIdArg('@user').ok, false);
  assert.ok(Number.isNaN(Number('abc')));
  assert.equal(parseTelegramIdArg('abc').ok, false);
});

test('parseDurationMsArg menjumlahkan satuan gabungan', () => {
  assert.equal(parseDurationMsArg('45s').value, 45_000);
  assert.equal(parseDurationMsArg('1h30m').value, 90 * 60 * 1000);
  assert.equal(parseDurationMsArg('2d12h').value, 60 * 60 * 60 * 1000);
  assert.equal(parseDurationMsArg(' 1H 30M ').value, 90 * 60 * 1000);
});

test('parseDurationMsArg menolak format salah', () => {
  assert.equal(parseDurationMsArg('').ok, false);
  assert.equal(parseDurationMsArg('30').ok, false);
  assert.equal(parseDurationMsArg('30x').ok, false);
  assert.equal(parseDurationMsArg('0s').ok, false);
});

test('parseDurationMsArg membatasi durasi agar timer Node tidak meledak', () => {
  // Node memakai penghitung 32-bit: delay di atas MAX_TIMER_MS dijalankan
  // seketika, bukan ditolak. Validasi harus menahannya lebih dulu.
  const overflow = parseDurationMsArg('365d');
  assert.equal(overflow.ok, false);
  assert.match(overflow.error, /maksimal/i);

  const atLimit = parseDurationMsArg('24d');
  assert.equal(atLimit.ok, true);
  assert.ok(atLimit.value <= MAX_TIMER_MS);
});

test('parseDurationMsArg menghormati maxMs khusus pemanggil', () => {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  assert.equal(parseDurationMsArg('8d', { maxMs: sevenDays }).ok, false);
  assert.equal(parseDurationMsArg('7d', { maxMs: sevenDays }).value, sevenDays);
});

test('parseChoiceArg case-insensitive dan menyebut pilihan yang sah', () => {
  assert.equal(parseChoiceArg('KICK', ['mute', 'kick']).value, 'kick');
  const r = parseChoiceArg('ban', ['mute', 'kick']);
  assert.equal(r.ok, false);
  assert.match(r.error, /mute/);
  assert.match(r.error, /kick/);
});

test('parseTextArg menolak teks kosong dan terlalu panjang', () => {
  assert.equal(parseTextArg('   ').ok, false);
  assert.equal(parseTextArg('  halo  ').value, 'halo');
  assert.equal(parseTextArg('abcdef', { maxLength: 3 }).ok, false);
});

test('validationErrorText menyertakan contoh penggunaan bila diberikan', () => {
  const withUsage = validationErrorText('Menit minimal 1.', '.loop <menit> <pesan>');
  assert.match(withUsage, /Input Tidak Valid/);
  assert.match(withUsage, /Menit minimal 1\./);
  assert.match(withUsage, /\.loop &lt;menit&gt;|\.loop <menit>/);
  assert.doesNotMatch(validationErrorText('Menit minimal 1.'), /Penggunaan/);
});
