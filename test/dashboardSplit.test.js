/**
 * Penjaga hasil pemecahan src/bot/ui/keyboards/dashboard.ts (2.821 baris)
 * menjadi dashboard/{shared,panels,keyboards,handlers}.ts.
 *
 * Risiko utama pemecahan ini bukan logika di dalam fungsi (tidak berubah),
 * tapi permukaan ekspornya: dashboard.ts dipakai bot/index.ts dan
 * bot/handlers/callbacks.ts lewat ~72 nama. Satu nama hilang = runtime error
 * di panel yang mungkin jarang dibuka, dan tsc tidak selalu menangkapnya
 * karena pemanggilnya memakai tipe `any` di banyak tempat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as dashboard from '../dist/bot/ui/keyboards/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const dashDir = path.join(repoRoot, 'src/bot/ui/keyboards/dashboard');
const routesDir = path.join(dashDir, 'routes');

/** Persis nama yang diekspor dashboard.ts sebelum dipecah. */
const EXPECTED_EXPORTS = [
  'PLUGIN_CATEGORIES', 'applyButtonStylesToPayload',
  'formatModuleName', 'formatTelegramPremiumBadge', 'getCombinedAdminUsers',
  'getPluginCategory', 'isOwner', 'isTelegramPremium',
  'keyboardAccessDenied', 'keyboardAdmin', 'keyboardAdminBackup',
  'keyboardAdminBroadcast', 'keyboardAdminFleet', 'keyboardAdminPending',
  'keyboardAdminSettings', 'keyboardAdminUserDetail', 'keyboardAdminUsers',
  'keyboardBack', 'keyboardBuySubscription', 'keyboardDangerDelete',
  'keyboardHelpBack', 'keyboardHelpCenter', 'keyboardInlineHelper',
  'keyboardMain', 'keyboardPanelMenu', 'keyboardPluginStudio',
  'keyboardPrefixPicker', 'keyboardRegister', 'keyboardSettings',
  'keyboardSubscription', 'keyboardTermsDeclined', 'keyboardTermsOfService',
  'keyboardUserLoops', 'keyboardUserbot', 'keyboardUserbotDiag',
  'panelAccessDenied', 'panelAdmin', 'panelAdminBackup',
  'panelAdminBroadcast', 'panelAdminFleet', 'panelAdminPending',
  'panelAdminSettings', 'panelAdminUserDetail', 'panelAdminUsers',
  'panelBuySubscription', 'panelDangerDelete', 'panelDonate', 'panelHealth',
  'panelHelpCommands', 'panelHelpFaq', 'panelHelpQuickstart',
  'panelInlineHelper', 'panelMain', 'panelMenuList', 'panelPluginDetail',
  'panelPlugins', 'panelPrefixPicker', 'panelQuickHelp', 'panelRegister',
  'panelSettings', 'panelStats', 'panelSubscription', 'panelTermsDeclined',
  'panelTermsOfService', 'panelUserLoops', 'panelUserbot',
  'panelUserbotDiag', 'pluginCategoryInfo', 'pluginPageInfo',
  'registerRichHandlers', 'sendAccessDeniedRich',
];

test('barrel dashboard.ts mengekspor semua nama yang dulu ada', () => {
  for (const name of EXPECTED_EXPORTS) {
    assert.ok(name in dashboard, `export "${name}" hilang setelah pemecahan`);
    assert.notEqual(dashboard[name], undefined, `export "${name}" bernilai undefined`);
  }
});

test('barrel tidak membocorkan helper internal ke permukaan publik', () => {
  // CombinedAdminUser adalah interface (hanya tipe), jadi tidak muncul runtime.
  const runtimeExports = Object.keys(dashboard).sort();
  const extra = runtimeExports.filter(n => !EXPECTED_EXPORTS.includes(n));

  assert.deepEqual(extra, [], 'helper internal seperti badge/userInfo tidak boleh ikut terekspor');
});

test('dashboard.ts tinggal barrel tipis, bukan implementasi', () => {
  const barrel = fs.readFileSync(path.join(repoRoot, 'src/bot/ui/keyboards/dashboard.ts'), 'utf8');

  assert.ok(barrel.split('\n').length < 120, 'barrel harus tetap tipis');
  assert.ok(!/\bfunction\s+\w+\s*\(/.test(barrel), 'tidak boleh ada implementasi tersisa di barrel');
  assert.match(barrel, /from '\.\/dashboard\/shared\.js'/);
  assert.match(barrel, /from '\.\/dashboard\/handlers\.js'/);
});

test('tiap modul dashboard tetap di bawah batas yang wajar', () => {
  const files = fs.readdirSync(dashDir).filter(f => f.endsWith('.ts'));
  assert.deepEqual(files.sort(), [
    'handlers.ts', 'keyboards.ts', 'panels.ts', 'richRuntime.ts', 'shared.ts',
  ]);

  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));
  assert.deepEqual(routeFiles.sort(), [
    'account.ts', 'admin.ts', 'info.ts', 'misc.ts', 'navigation.ts',
    'plugins.ts', 'settings.ts', 'types.ts',
  ]);

  for (const [dir, file] of [...files.map(f => [dashDir, f]), ...routeFiles.map(f => [routesDir, f])]) {
    const count = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').length;
    assert.ok(count < 600, `${file} ${count} baris — pecah lagi sebelum tumbuh seperti dulu`);
  }
});

/**
 * Penjaga pemecahan router `rich:` dari handlers.ts ke routes/*.ts.
 *
 * Router lama adalah satu rantai if sepanjang ~790 baris. Setelah dipecah,
 * risikonya adalah sebuah action ikut terhapus atau ditangani dua modul
 * sekaligus — keduanya tidak terdeteksi tsc karena action hanyalah string.
 */
test('semua action rich: tetap terdaftar tepat satu kali di routes/', () => {
  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts') && f !== 'types.ts');

  const seen = new Map();
  for (const file of routeFiles) {
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    for (const m of src.matchAll(/action === '([^']+)'|action\.startsWith\('([^']+)'/g)) {
      const action = m[1] ?? m[2];
      assert.ok(!seen.has(action), `action "${action}" ditangani dua kali: ${seen.get(action)} dan ${file}`);
      seen.set(action, file);
    }
  }

  // Jumlah persis sebelum pemecahan. Naikkan dengan sadar saat menambah menu.
  assert.equal(seen.size, 83, 'jumlah action berubah — pastikan tidak ada yang hilang saat refaktor');

  // Sampel lintas-grup: hilangnya salah satu ini bikin menu mati total.
  for (const action of ['main', 'ubot', 'settings', 'admin', 'otp', 'qr', 'toggle_power']) {
    assert.ok(seen.has(action), `action inti "${action}" hilang dari routes/`);
  }
});

test('handlers.ts hanya mendelegasikan, tidak lagi memuat isi router', () => {
  const src = fs.readFileSync(path.join(dashDir, 'handlers.ts'), 'utf8');

  for (const fn of [
    'handleNavigationRoutes', 'handlePluginsRoutes', 'handleSettingsRoutes',
    'handleAccountRoutes', 'handleInfoRoutes', 'handleAdminRoutes', 'handleMiscRoutes',
  ]) {
    assert.match(src, new RegExp(`${fn}\\(ctx\\)`), `router tidak memanggil ${fn}`);
  }

  assert.ok(!/if \(action === '/.test(src), 'cabang action harus tinggal di routes/, bukan di handlers.ts');
});

test('panel dan keyboard menghasilkan output yang sama untuk ctx yang sama', () => {
  // Pemeriksaan nyata (bukan baca source): panggil beberapa builder dan
  // pastikan bentuk keluarannya tetap seperti yang diharapkan pemanggil.
  const kb = dashboard.keyboardBack('main');
  assert.ok(Array.isArray(kb.inline_keyboard), 'keyboardBack harus mengembalikan inline_keyboard');

  // Perilaku apa adanya dari sebelum pemecahan — bukan perilaku yang
  // diinginkan, tapi persis yang dipakai UI sekarang.
  assert.equal(dashboard.formatModuleName('my_plugin_name'), 'My_plugin_name');
  assert.equal(dashboard.formatModuleName('antipm'), 'AntiPM');
  assert.equal(dashboard.formatModuleName('afk'), 'AFK', 'nama <= 3 huruf jadi kapital semua');
  assert.equal(dashboard.formatModuleName(''), '');
  assert.ok(dashboard.formatTelegramPremiumBadge(true).length > 0);

  const info = dashboard.pluginPageInfo(1);
  assert.deepEqual(Object.keys(info).sort(), ['category', 'page', 'plugins', 'total', 'totalPages']);
  assert.ok(info.totalPages >= 1, 'selalu minimal satu halaman walau registry kosong');
});
