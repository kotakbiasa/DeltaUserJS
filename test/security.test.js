import { test } from 'node:test';
import assert from 'node:assert/strict';

import execPlugin, { validateCommand } from '../dist/userbot/handlers/system/exec.js';
import config from '../dist/config.js';

// Semua tes di bawah berjalan SEBAGAI owner — kalau tidak, plugin menolak di
// baris pertama dan tes jadi hijau palsu.
const OWNER = Number(config.ownerId);

function mockMessage(text, extra = {}) {
  return {
    out: true,
    message: text,
    edits: [],
    async edit(opts) { this.edits.push(opts); },
    ...extra,
  };
}

// ===========================================================================
// Temuan #1 — .eval dihapus total
//
// Dulu: objek host (client, message, Object, Promise, Math, ...) dilempar ke
// dalam vm context, sehingga `Object.constructor('return process')()` keluar
// dari sandbox dan memberi RCE penuh. Diverifikasi bisa dieksekusi nyata.
// ===========================================================================

test('.eval is gone — the command is no longer recognised', async () => {
  const msg = mockMessage('.eval 1+1');
  await execPlugin.execute({}, msg, {}, OWNER);
  assert.equal(msg.edits.length, 0, '.eval tidak boleh direspons sama sekali');
});

test('.eval cannot be reached through casing or extra whitespace', async () => {
  for (const text of ['.EVAL 1+1', '.Eval process.exit(1)', '.eval', '.eval   Object.constructor("return process")()']) {
    const msg = mockMessage(text);
    await execPlugin.execute({}, msg, {}, OWNER);
    assert.equal(msg.edits.length, 0, `masih merespons: ${text}`);
  }
});

test('the vm sandbox escape vector is no longer present in the source', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/userbot/handlers/system/exec.ts', import.meta.url), 'utf8');

  assert.ok(!src.includes('node:vm'), 'import vm harus hilang');
  assert.ok(!src.includes('createContext'), 'vm.createContext harus hilang');
  assert.ok(!src.includes('runInContext'), 'vm.runInContext harus hilang');
  assert.ok(!src.includes('SAFE_EVAL_CONTEXT'), 'konteks sandbox harus hilang');
  assert.ok(!/\beval\b/.test(src.replace(/EXEC_ALLOWED/g, '')), 'tidak boleh ada sisa kata eval');
});

// ===========================================================================
// Temuan #2 — whitelist .exec
//
// Dulu: regex tidak memuat < dan >, padahal komentarnya mengklaim redirect
// diblokir. `echo hi >> ~/.bashrc` lolos = tulis file arbitrer.
// ===========================================================================

test('redirects are rejected (the gap that used to let through file writes)', () => {
  for (const cmd of ['echo hi > /tmp/x', 'echo hi >> ~/.bashrc', 'wc < /etc/passwd', 'echo a>b']) {
    assert.notEqual(validateCommand(cmd), null, `masih lolos: ${cmd}`);
  }
});

test('globs and other shell metacharacters are rejected', () => {
  const blocked = [
    'echo *', 'echo ?', 'echo ~', 'echo [a-z]',
    'date; rm -rf /', 'echo $(id)', 'echo `id`', 'date && whoami',
    'date | wc', 'echo {a,b}', 'echo !!', 'date\nwhoami',
  ];
  for (const cmd of blocked) {
    assert.notEqual(validateCommand(cmd), null, `masih lolos: ${cmd}`);
  }
});

test('whitelisted commands with simple arguments still pass', () => {
  for (const cmd of ['date', 'uptime', 'whoami', 'df -h', 'free -m', 'uname -a', 'echo halo dunia']) {
    assert.equal(validateCommand(cmd), null, `seharusnya diizinkan: ${cmd}`);
  }
});

test('non-whitelisted commands are rejected by name', () => {
  for (const cmd of ['cat /etc/passwd', 'curl https://evil.test', 'rm -rf /', 'bash', 'node -e 1']) {
    const err = validateCommand(cmd);
    assert.notEqual(err, null, `masih lolos: ${cmd}`);
    assert.match(err, /tidak diizinkan/);
  }
});

// ===========================================================================
// Backup command execution
// ===========================================================================

test('backup commands pass arguments without a shell', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/services/BackupService.ts', import.meta.url), 'utf8');

  assert.match(src, /import \{ execFile \} from 'child_process'/);
  assert.doesNotMatch(src, /import \{ exec \} from 'child_process'/);
  assert.match(src, /execFileAsync\(\s*'mongodump'/s);
  assert.match(src, /execFileAsync\(\s*'mongorestore'/s);
  assert.doesNotMatch(src, /mongodump --uri=/);
  assert.doesNotMatch(src, /mongorestore --uri=/);
});

// ===========================================================================
// Temuan #7 — guard message.out
// ===========================================================================

test('exec ignores other people messages even for the owner id', async () => {
  const incoming = mockMessage('.exec uptime', { out: false });
  await execPlugin.execute({}, incoming, {}, OWNER);
  assert.equal(incoming.edits.length, 0);
});

test('exec ignores non-owner senders', async () => {
  const msg = mockMessage('.exec uptime');
  await execPlugin.execute({}, msg, {}, OWNER + 12345);
  assert.equal(msg.edits.length, 0);
});

// ===========================================================================
// .exec tetap berfungsi, dan tetap ditolak saat EXEC_ALLOWED belum diset
// ===========================================================================

test('exec refuses to run while EXEC_ALLOWED is unset', async () => {
  // Nilai EXEC_ALLOWED dibaca saat modul dimuat; di test env selalu false.
  const msg = mockMessage('.exec uptime');
  await execPlugin.execute({}, msg, {}, OWNER);

  assert.equal(msg.edits[0].text, '⏳ <b>Mengeksekusi...</b>');
  assert.match(msg.edits.at(-1).text, /EXEC_ALLOWED=true/);
  assert.match(msg.edits.at(-1).text, /💻 <b>Terminal<\/b>/);
});

test('exec without an argument explains itself', async () => {
  const msg = mockMessage('.exec');
  await execPlugin.execute({}, msg, {}, OWNER);
  assert.match(msg.edits[0].text, /Masukkan perintah/);
});

test('.sh is still accepted as an alias', async () => {
  const msg = mockMessage('.sh uptime');
  await execPlugin.execute({}, msg, {}, OWNER);
  assert.ok(msg.edits.length > 0);
});

// ===========================================================================
// Temuan #6 — ENCRYPTION_KEY
// ===========================================================================

test('crypto reports whether the key came from the environment', async () => {
  const { hasPersistentEncryptionKey } = await import('../dist/utils/crypto.js');
  // Di test env ENCRYPTION_KEY tidak diset, jadi flag ini harus false —
  // inilah kondisi yang membuat src/index.ts menolak boot.
  assert.equal(typeof hasPersistentEncryptionKey, 'boolean');
  assert.equal(hasPersistentEncryptionKey, Boolean(process.env.ENCRYPTION_KEY));
});

test('encrypt/decrypt still round-trips with the in-process key', async () => {
  const { encrypt, decrypt, isEncrypted } = await import('../dist/utils/crypto.js');
  const secret = 'session-string-rahasia-123';
  const enc = encrypt(secret);

  assert.notEqual(enc, secret);
  assert.equal(isEncrypted(enc), true);
  assert.equal(decrypt(enc), secret);
});

test('decrypt throws on a tampered payload instead of returning garbage', async () => {
  const { encrypt, decrypt } = await import('../dist/utils/crypto.js');
  const enc = encrypt('rahasia');
  const [nonce, tag, ct] = enc.split(':');
  const tampered = `${nonce}:${tag}:${ct.slice(0, -2)}${ct.slice(-2) === 'ff' ? 'ee' : 'ff'}`;

  assert.throws(() => decrypt(tampered));
});
