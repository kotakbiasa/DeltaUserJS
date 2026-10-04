/**
 * Penjaga hasil pemecahan src/server/api.ts menjadi src/server/routes/*.ts.
 *
 * Yang dijaga di sini bukan isi tiap handler (itu tidak berubah), tapi hal-hal
 * yang bisa rusak diam-diam saat file dipecah: ada rute yang hilang, dua modul
 * mengklaim rute yang sama, atau modul baru lupa didaftarkan di router.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const routesDir = path.join(repoRoot, 'src/server/routes');

const routeFiles = fs.readdirSync(routesDir)
  .filter(f => f.endsWith('.ts') && f !== 'context.ts');

const read = (f) => fs.readFileSync(path.join(routesDir, f), 'utf8').replace(/\r\n/g, '\n');
const apiSrc = fs.readFileSync(path.join(repoRoot, 'src/server/api.ts'), 'utf8');

function routesIn(src) {
  return [...src.matchAll(/pathname === '([^']+)' && req\.method === '(\w+)'/g)]
    .map(m => `${m[2]} ${m[1]}`);
}

test('setiap modul rute mengekspor handler dan punya minimal satu rute', () => {
  assert.ok(routeFiles.length >= 9, 'modul rute harus terpecah, bukan satu file');

  for (const file of routeFiles) {
    const src = read(file);
    assert.match(
      src,
      /export async function handle\w+Routes\(ctx: RouteContext\): Promise<boolean>/,
      `${file} harus mengekspor handler dengan tanda tangan yang seragam`,
    );
    // Tanpa ini, request yang tidak cocok akan "tertelan" dan balasan 404
    // global tidak pernah terkirim.
    assert.ok(src.trimEnd().endsWith('return false;\n}'), `${file} harus diakhiri return false`);
    assert.ok(
      routesIn(src).length > 0 || src.includes('pathname.match('),
      `${file} harus menangani setidaknya satu rute`,
    );
  }
});

test('tidak ada dua modul yang mengklaim rute yang sama', () => {
  const seen = new Map();
  for (const file of routeFiles) {
    for (const route of routesIn(read(file))) {
      assert.equal(
        seen.get(route),
        undefined,
        `${route} diklaim oleh ${seen.get(route)} dan ${file} — hasilnya tergantung urutan`,
      );
      seen.set(route, file);
    }
  }
  // Jumlah rute eksak sebelum pemecahan; turun berarti ada yang hilang.
  assert.equal(seen.size, 26);
});

test('semua modul rute terdaftar di ROUTE_GROUPS', () => {
  const registered = [...apiSrc.matchAll(/handle(\w+)Routes,/g)].map(m => m[1].toLowerCase());
  const expected = routeFiles.map(f => f.replace('.ts', '')).sort();

  assert.deepEqual(registered.sort(), expected, 'modul rute baru harus ditambahkan ke ROUTE_GROUPS');
});

test('api.ts tinggal mengurus CORS, auth, dan error — bukan isi rute', () => {
  assert.ok(apiSrc.split('\n').length < 200, 'api.ts harus tetap ramping setelah dipecah');

  // Pemeriksaan ini yang membuat file tidak pelan-pelan gemuk lagi.
  assert.equal(routesIn(apiSrc).length, 0, 'tidak boleh ada handler rute tersisa di api.ts');

  for (const needle of ['validateTelegramInitData', 'OPTIONS', 'ApiRequestError', 'DigitalStoreError', 'Endpoint API tidak ditemukan']) {
    assert.ok(apiSrc.includes(needle), `api.ts tetap harus menangani ${needle}`);
  }
});

test('handler memakai konteks bersama, bukan variabel closure lama', () => {
  for (const file of routeFiles) {
    const src = read(file);
    const body = src.slice(src.indexOf('export async function'));
    assert.match(body, /const \{[^}]+\} = ctx;/, `${file} harus mengambil nilainya dari ctx`);
  }
});

test('helper bersama hanya didefinisikan sekali di context.ts', () => {
  const context = fs.readFileSync(path.join(routesDir, 'context.ts'), 'utf8');
  for (const helper of ['sendJson', 'readJsonBody', 'decodePathSegment', 'getCorsOrigin']) {
    assert.ok(context.includes(`export function ${helper}`) || context.includes(`export async function ${helper}`),
      `${helper} harus ada di context.ts`);

    for (const file of [...routeFiles, 'context.ts']) {
      if (file === 'context.ts') {continue;}
      const src = read(file);
      assert.ok(
        !src.includes(`function ${helper}(`),
        `${file} tidak boleh mendefinisikan ulang ${helper}`,
      );
    }
  }
});
