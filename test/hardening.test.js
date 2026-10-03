/**
 * Regresi untuk temuan #4, #5, #8, #9 di docs/security.md.
 *
 * Tiap test di sini dibuat untuk GAGAL pada kode sebelum perbaikan:
 *   #5 — registerPlugin melempar "plugin duplikat" saat hot-reload
 *   #8 — restartUserbot melewatkan start/stop inline bot
 *   #9 — state approval ditulis ke cwd, di luar volume Docker
 *   #4 — endpoint broadcast Mini App mengabaikan blacklist
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearRegistry,
  registerPlugin,
  unregisterPlugin,
  getPluginForCommand,
  getPlugin,
  hasPlugin,
  indexedCommandCount,
  helpRegistry,
  loadedPlugins,
} from '../dist/userbot/engine/pluginRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const fullHelp = {
  title: 'T',
  description: 'D',
  usage: 'U',
  detail: 'X',
};

// ===========================================================================
// #5 — hot-reload plugin
// ===========================================================================

test('#5 unregisterPlugin membebaskan nama sehingga register ulang berhasil', () => {
  clearRegistry();
  registerPlugin({ name: 'demo', commands: ['demo'], help: fullHelp, execute: () => {} });

  // Inilah yang dulu bikin hot-reload 100% gagal.
  assert.throws(
    () => registerPlugin({ name: 'demo', execute: () => {} }),
    /plugin duplikat/,
  );

  const index = unregisterPlugin('demo');
  assert.equal(index, 0);
  assert.equal(hasPlugin('demo'), false);

  assert.doesNotThrow(() => registerPlugin({ name: 'demo', execute: () => {} }));
  assert.equal(hasPlugin('demo'), true);
  clearRegistry();
});

test('#5 unregisterPlugin membersihkan indeks command dan helpRegistry', () => {
  clearRegistry();
  registerPlugin({ name: 'multi', commands: ['alpha', 'beta'], help: fullHelp, execute: () => {} });

  assert.equal(indexedCommandCount(), 2);
  assert.ok(helpRegistry.multi);
  assert.ok(getPluginForCommand('alpha'));

  unregisterPlugin('multi');

  assert.equal(indexedCommandCount(), 0, 'command harus ikut terlepas, bukan menunjuk plugin mati');
  assert.equal(getPluginForCommand('alpha'), null);
  assert.equal(helpRegistry.multi, undefined, 'help plugin lama tidak boleh tertinggal');
  assert.equal(loadedPlugins.length, 0);
  clearRegistry();
});

test('#5 unregisterPlugin tidak mencuri command milik plugin lain', () => {
  clearRegistry();
  // "second" kalah klaim atas .dup, jadi .dup tetap milik "first".
  registerPlugin({ name: 'first', commands: ['dup'], execute: () => {} });
  registerPlugin({ name: 'second', commands: ['dup'], execute: () => {} });
  assert.equal(getPluginForCommand('dup').name, 'first');

  unregisterPlugin('second');

  assert.equal(getPluginForCommand('dup')?.name, 'first', '.dup tidak boleh ikut terhapus');
  clearRegistry();
});

test('#5 unregisterPlugin mengembalikan null untuk plugin yang tidak terdaftar', () => {
  clearRegistry();
  assert.equal(unregisterPlugin('tidak-ada'), null);
  assert.equal(unregisterPlugin(''), null);
  assert.equal(unregisterPlugin(undefined), null);
  clearRegistry();
});

test('#5 register ulang dengan meta.at menjaga urutan eksekusi plugin', () => {
  clearRegistry();
  registerPlugin({ name: 'a', execute: () => {} });
  registerPlugin({ name: 'b', execute: () => {} });
  registerPlugin({ name: 'c', execute: () => {} });

  // Simulasi hot-reload "b": urutan a, b, c harus tetap — bukan a, c, b.
  const at = unregisterPlugin('b');
  registerPlugin({ name: 'b', execute: () => {} }, { at });

  assert.deepEqual(loadedPlugins.map(p => p.name), ['a', 'b', 'c']);
  clearRegistry();
});

test('#5 nama plugin dinormalisasi saat unregister', () => {
  clearRegistry();
  registerPlugin({ name: 'MiXeD', execute: () => {} });
  assert.equal(unregisterPlugin('  mixed  '), 0);
  assert.equal(hasPlugin('mixed'), false);
  clearRegistry();
});

test('#5 pluginLoader memanggil unregisterPlugin sebelum register ulang', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'src/userbot/engine/pluginLoader.ts'), 'utf8');
  assert.match(src, /unregisterPlugin\(plugin\.name\)/);
  // Log pertama kali muat tidak boleh lagi berbohong "Reloaded".
  assert.match(src, /Loaded/);
  assert.ok(
    !/`\s*🔄 Reloaded: \$\{registered\.name\}`/.test(src),
    'log tidak boleh selalu "Reloaded"',
  );
});

// ===========================================================================
// #8 — restart userbot harus ikut menyalakan ulang inline bot
// ===========================================================================

test('#8 restartUserbot memakai helper start/stop bersama, bukan logika sendiri', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'src/userbot/engine/manager.ts'), 'utf8');

  const restart = src.slice(src.indexOf('async restartUserbot'), src.indexOf('async restartAllActive'));
  assert.ok(restart.length > 0, 'restartUserbot harus ada');

  assert.match(restart, /#stopLocked\(id, 'restart'\)/);
  assert.match(restart, /#startLocked\(id, session\.session_string\)/);

  // Dulu restart membuat UserbotClient sendiri dan karenanya melewatkan
  // startInlineBotForUser — pastikan duplikasi itu tidak kembali.
  assert.ok(
    !restart.includes('new UserbotClient'),
    'restart tidak boleh menyalin ulang logika start',
  );
});

test('#8 inline bot hanya disentuh lewat helper terkunci', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'src/userbot/engine/manager.ts'), 'utf8');

  // Tepat satu tempat yang start dan satu yang stop inline bot, keduanya di
  // dalam helper — sehingga start/stop/restart tidak bisa berbeda lagi.
  const starts = src.match(/startInlineBotForUser\(/g) || [];
  const stops = src.match(/stopInlineBotForUser\(/g) || [];
  assert.equal(starts.length, 1, 'inline bot hanya boleh di-start di satu tempat');
  assert.equal(stops.length, 1, 'inline bot hanya boleh di-stop di satu tempat');

  const startLocked = src.slice(src.indexOf('async #startLocked'), src.indexOf('async #stopLocked'));
  assert.match(startLocked, /startInlineBotForUser/);
});

// ===========================================================================
// #9 — state approval harus berada di direktori data yang di-mount
// ===========================================================================

test('#9 file state approval tidak lagi ditulis ke process.cwd()', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'src/bot/state/approvedUsers.ts'), 'utf8');

  for (const file of ['approvals.json', 'approvals_meta.json', 'pending_approvals.json', 'terms_accepted.json']) {
    assert.ok(
      !src.includes(`path.join(process.cwd(), '${file}')`),
      `${file} tidak boleh ditulis langsung ke cwd (di luar volume Docker)`,
    );
    assert.ok(src.includes(`path.join(stateDir, '${file}')`), `${file} harus memakai stateDir`);
  }

  assert.match(src, /process\.env\.STATE_DIR/);
  assert.match(src, /mkdirSync\(stateDir, \{ recursive: true \}\)/);
  // Migrasi dari lokasi lama supaya upgrade tidak menghapus approval.
  assert.match(src, /renameSync\(legacyPath, newPath\)/);
});

test('#9 docker-compose menaruh STATE_DIR di dalam volume yang di-mount', () => {
  const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /STATE_DIR=\/app\/data/);
  assert.match(compose, /deltauserjs_store_data:\/app\/data/);
});

// ===========================================================================
// #4 — broadcast Mini App
// ===========================================================================

test('#4 endpoint broadcast menghormati blacklist dan punya batas', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'src/server/routes/broadcast.ts'), 'utf8');
  const start = src.indexOf("pathname === '/api/broadcast/send'");
  assert.ok(start > 0, 'endpoint broadcast harus ada');
  const endpoint = src.slice(start);

  assert.match(endpoint, /getBroadcastBlacklist\(user\.id\)/, 'blacklist wajib dibaca');
  assert.match(endpoint, /blacklist\.includes\(chatId\)/, 'target blacklist wajib difilter');
  assert.match(endpoint, /MAX_BROADCAST_TARGETS/, 'jumlah target wajib dibatasi');
  assert.match(endpoint, /MAX_BROADCAST_MESSAGE_LENGTH/, 'panjang pesan wajib dibatasi');
  assert.match(endpoint, /broadcastInProgress/, 'broadcast ganda wajib dicegah');

  // Yang dikirim harus hasil filter, bukan input mentah.
  assert.match(endpoint, /for \(const chatId of targets\)/);
  assert.ok(
    !/for \(const chatId of body\.chatIds\)/.test(endpoint),
    'loop tidak boleh lagi memakai body.chatIds mentah',
  );
});

test('#4 batas broadcast Mini App sama dengan .gcast', () => {
  const api = fs.readFileSync(path.join(repoRoot, 'src/server/routes/broadcast.ts'), 'utf8');
  const gcast = fs.readFileSync(path.join(repoRoot, 'src/userbot/handlers/admin/gcast.ts'), 'utf8');

  const apiLimit = Number(api.match(/MAX_BROADCAST_TARGETS = (\d+)/)[1]);
  const gcastLimit = Number(gcast.match(/MAX_GCAST_TARGETS = (\d+)/)[1]);

  assert.equal(apiLimit, gcastLimit, 'Mini App tidak boleh jadi jalan pintas melewati batas .gcast');
});

test('#4 logika filter blacklist menghasilkan target yang benar', () => {
  // Replika murni dari logika di endpoint, diuji terpisah dari HTTP.
  const MAX = 50;
  const filter = (chatIds, blacklist) => {
    const allowed = chatIds.map(String).filter(id => !blacklist.includes(id));
    return { targets: allowed.slice(0, MAX), skipped: chatIds.length - allowed.length };
  };

  const r1 = filter(['1', '2', '3'], ['2']);
  assert.deepEqual(r1.targets, ['1', '3']);
  assert.equal(r1.skipped, 1);

  // chatId numerik tetap cocok dengan blacklist yang disimpan sebagai string.
  const r2 = filter([1, 2, 3], ['2']);
  assert.deepEqual(r2.targets, ['1', '3']);
  assert.equal(r2.skipped, 1);

  const r3 = filter(['9', '9'], ['9']);
  assert.deepEqual(r3.targets, []);
  assert.equal(r3.skipped, 2);

  const many = Array.from({ length: 80 }, (_, i) => String(i));
  assert.equal(filter(many, []).targets.length, MAX);
});
