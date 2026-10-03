import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { sleep } from '../dist/utils/async.js';
import { fetchWithTimeout, fetchJson, fetchText, withTimeout } from '../dist/utils/http.js';
import { formatBytes, formatBytesFixed, formatBytesShort } from '../dist/utils/format.js';

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

test('sleep resolves after roughly the requested delay', async () => {
  const start = Date.now();
  await sleep(60);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 50, `expected >= 50ms, got ${elapsed}ms`);
});

// ---------------------------------------------------------------------------
// formatBytes variants — these must stay byte-identical to the local copies
// they replaced, otherwise user-visible text changes.
// ---------------------------------------------------------------------------

test('formatBytes trims trailing zeros (utils/format original behaviour)', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1024 ** 3), '1 GB');
});

test('formatBytesFixed keeps 2 decimals (BackupService/backup.ts original behaviour)', () => {
  // Reference implementation copied verbatim from the two deleted duplicates.
  const original = (bytes) => {
    if (bytes === 0) {return '0 B';}
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  for (const n of [0, 1, 999, 1024, 1536, 1048576, 1073741824, 5e9, 1.1e12]) {
    assert.equal(formatBytesFixed(n), original(n), `mismatch for ${n}`);
  }
  assert.equal(formatBytesFixed(1024), '1.00 KB');
});

test('formatBytesShort keeps 1 decimal and caps at GB (dashboard formatBytesRef behaviour)', () => {
  // Reference implementation copied verbatim from the deleted formatBytesRef.
  const original = (bytes) => {
    if (!bytes) {return '0 B';}
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  for (const n of [0, 1, 999, 1024, 1536, 1048576, 1073741824, 5e12]) {
    assert.equal(formatBytesShort(n), original(n), `mismatch for ${n}`);
  }
  // Caps at GB instead of rolling over to TB.
  assert.ok(formatBytesShort(5e12).endsWith(' GB'));
});

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

/** Start a throwaway local server; `handler` decides how it responds. */
function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('fetchWithTimeout aborts a hanging request and reports a readable error', async () => {
  // Server accepts the connection then never responds — the exact scenario
  // that used to hang a handler forever.
  const { server, url } = await startServer(() => { /* no response, ever */ });

  try {
    await assert.rejects(
      () => fetchWithTimeout(url, {}, 150),
      (err) => {
        assert.match(err.message, /melebihi batas waktu/);
        assert.ok(err.cause, 'original AbortError should be preserved as cause');
        return true;
      }
    );
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('fetchWithTimeout returns non-2xx responses instead of throwing', async () => {
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(404);
    res.end('nope');
  });

  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('fetchWithTimeout passes method, headers, and body through unchanged', async () => {
  let seen = null;
  const { server, url } = await startServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = { method: req.method, ua: req.headers['user-agent'], body };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'User-Agent': 'DeltaUserJS/1.0' },
      body: 'halo'
    }, 5000);
    assert.equal(res.status, 200);
    assert.equal(seen.method, 'POST');
    assert.equal(seen.ua, 'DeltaUserJS/1.0');
    assert.equal(seen.body, 'halo');
  } finally {
    server.close();
  }
});

test('fetchWithTimeout respects a caller-supplied signal', async () => {
  const { server, url } = await startServer(() => { /* hang */ });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 100);

  try {
    // Caller owns the signal, so our timeout must not interfere and the
    // native AbortError must surface unwrapped.
    await assert.rejects(
      () => fetchWithTimeout(url, { signal: ctrl.signal }, 60_000),
      (err) => {
        assert.doesNotMatch(err.message, /melebihi batas waktu/);
        return true;
      }
    );
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('fetchJson and fetchText throw on non-2xx, parse on success', async () => {
  const { server, url } = await startServer((req, res) => {
    if (req.url === '/bad') {
      res.writeHead(500);
      res.end('boom');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"hello":"world"}');
  });

  try {
    assert.deepEqual(await fetchJson(url, {}, 5000), { hello: 'world' });
    assert.equal(await fetchText(url, {}, 5000), '{"hello":"world"}');
    await assert.rejects(() => fetchJson(`${url}/bad`, {}, 5000), /HTTP 500/);
    await assert.rejects(() => fetchText(`${url}/bad`, {}, 5000), /HTTP 500/);
  } finally {
    server.close();
  }
});

test('withTimeout produces a signal that aborts and a done() that cancels it', async () => {
  const t = withTimeout(50);
  assert.equal(t.signal.aborted, false);
  await sleep(90);
  assert.equal(t.signal.aborted, true);

  // done() must stop the timer so a finished request leaves nothing pending.
  const t2 = withTimeout(50);
  t2.done();
  await sleep(90);
  assert.equal(t2.signal.aborted, false);
});
