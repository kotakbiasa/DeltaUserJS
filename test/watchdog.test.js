/**
 * Watchdog reconnect (`src/userbot/engine/manager.ts`).
 *
 * AGENTS.md mensyaratkan exponential backoff dengan maksimal 3 percobaan.
 * Dulu watchdog mencoba ulang setiap siklus tanpa batas, dan sesi yang sudah
 * dicabut (AUTH_KEY_UNREGISTERED dkk.) tidak pernah dinonaktifkan.
 */
import './setupStubs.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import userbotManager, {
  WATCHDOG_MAX_RETRIES,
  backoffDelayMs,
  isDeadSessionError,
} from '../dist/userbot/engine/manager.js';
import { saveUserbotSession, deleteUserbot } from '../dist/infrastructure/database.js';
import { dbCache } from '../dist/infrastructure/dbCore.js';

test('isDeadSessionError mengenali sesi mati permanen', () => {
  assert.equal(isDeadSessionError('RPC_ERROR 401: AUTH_KEY_UNREGISTERED'), true);
  assert.equal(isDeadSessionError('SESSION_REVOKED'), true);
  assert.equal(isDeadSessionError('USER_DEACTIVATED_BAN'), true);
  assert.equal(isDeadSessionError('ETIMEDOUT connect'), false);
});

test('backoffDelayMs berlipat ganda per kegagalan', () => {
  assert.equal(backoffDelayMs(1, 1000), 1000);
  assert.equal(backoffDelayMs(2, 1000), 2000);
  assert.equal(backoffDelayMs(3, 1000), 4000);
});

async function withFailingStart(id, message, fn) {
  const original = userbotManager.startUserbot;
  let attempts = 0;
  userbotManager.startUserbot = async () => {
    attempts++;
    throw new Error(message);
  };
  try {
    await saveUserbotSession(id, '00000', `mock_session_${id}`);
    await fn(() => attempts);
  } finally {
    userbotManager.startUserbot = original;
    userbotManager.reconnectFailures.delete(id);
    deleteUserbot(id);
  }
}

test('watchdog menunggu backoff lalu menonaktifkan setelah batas retry', async () => {
  const id = 777001;
  await withFailingStart(id, 'ETIMEDOUT', async (attempts) => {
    userbotManager.watchdogBaseMs = 60_000;

    await userbotManager.checkAndReconnect();
    assert.equal(attempts(), 1);
    assert.equal(userbotManager.reconnectFailures.get(id)?.count, 1);

    // Siklus berikutnya masih dalam jeda backoff: tidak boleh mencoba lagi.
    await userbotManager.checkAndReconnect();
    assert.equal(attempts(), 1, 'backoff harus melewati siklus ini');

    // Paksa jeda habis sampai batas retry tercapai.
    for (let i = 1; i < WATCHDOG_MAX_RETRIES; i++) {
      userbotManager.reconnectFailures.get(id).nextAttemptAt = 0;
      await userbotManager.checkAndReconnect();
    }
    assert.equal(attempts(), WATCHDOG_MAX_RETRIES);
    assert.equal(dbCache.get(id)?.is_active, 0, 'userbot dinonaktifkan setelah batas retry');
    assert.equal(userbotManager.reconnectFailures.has(id), false);
  });
});

test('watchdog langsung menonaktifkan sesi yang dicabut', async () => {
  const id = 777002;
  await withFailingStart(id, 'AUTH_KEY_UNREGISTERED', async (attempts) => {
    await userbotManager.checkAndReconnect();
    assert.equal(attempts(), 1);
    assert.equal(dbCache.get(id)?.is_active, 0);
  });
});
