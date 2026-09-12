import assert from 'node:assert';
import {
  createVoucher,
  getVoucher,
  redeemVoucher,
  deleteVoucher,
  getAllVouchers,
} from '../dist/services/VoucherService.js';
import { UserbotClient } from '../dist/userbot/engine/client.js';
import userbotManager from '../dist/userbot/engine/manager.js';
import {
  startLoop,
  stopLoop,
  loopStore,
} from '../dist/userbot/handlers/util/loop.js';
import {
  hasAcceptedTerms,
  setAcceptedTerms,
} from '../dist/bot/state/approvedUsers.js';
import config from '../dist/config.js';

async function runFeatureTests() {
  console.log('🧪 Running Tests for Feature 2, 3 & 4...\n');
  let passed = 0;

  // ==========================================
  // FEATURE 2: VOUCHER SYSTEM TESTS
  // ==========================================
  console.log('--- [Feature 2: Sistem Kode Voucher] ---');

  // Test 1: Create voucher
  const v1 = await createVoucher({
    code: 'TEST-PROMO-30',
    days: 30,
    maxUses: 2,
    createdBy: 999999,
  });
  assert.strictEqual(v1.success, true, 'Voucher creation should succeed');
  assert.strictEqual(v1.voucher.code, 'TEST-PROMO-30');
  console.log('  ✅ createVoucher: creates a valid voucher code');
  passed++;

  // Test 2: Reject duplicate voucher code
  const vDup = await createVoucher({
    code: 'TEST-PROMO-30',
    days: 10,
  });
  assert.strictEqual(vDup.success, false, 'Duplicate voucher should be rejected');
  console.log('  ✅ createVoucher: prevents duplicate voucher code');
  passed++;

  // Test 3: Reject invalid voucher code
  const vShort = await createVoucher({ code: 'a' });
  assert.strictEqual(vShort.success, false, 'Short code should be rejected');
  console.log('  ✅ createVoucher: validates code format and length');
  passed++;

  // Test 4: Redeem voucher user 1
  const r1 = await redeemVoucher('TEST-PROMO-30', 11111);
  assert.strictEqual(r1.success, true, 'First user redemption should succeed');
  assert.strictEqual(r1.daysAdded, 30);
  console.log('  ✅ redeemVoucher: redeems voucher successfully and grants duration');
  passed++;

  // Test 5: Reject duplicate redemption by same user
  const r1Again = await redeemVoucher('TEST-PROMO-30', 11111);
  assert.strictEqual(r1Again.success, false, 'Same user cannot redeem twice');
  console.log('  ✅ redeemVoucher: prevents multiple redemptions by the same user');
  passed++;

  // Test 6: Redeem voucher user 2 (quota maxed out)
  const r2 = await redeemVoucher('TEST-PROMO-30', 22222);
  assert.strictEqual(r2.success, true, 'Second user redemption should succeed');
  console.log('  ✅ redeemVoucher: allows second user up to maxUses quota');
  passed++;

  // Test 7: Reject redemption when quota exhausted
  const r3 = await redeemVoucher('TEST-PROMO-30', 33333);
  assert.strictEqual(r3.success, false, 'Third user should fail when quota is 2');
  console.log('  ✅ redeemVoucher: blocks redemption when quota is exhausted');
  passed++;

  // Test 8: Expired voucher
  const vExp = await createVoucher({
    code: 'TEST-EXPIRED',
    days: 7,
    expiresAt: Date.now() - 10000,
  });
  assert.strictEqual(vExp.success, true);
  const rExp = await redeemVoucher('TEST-EXPIRED', 44444);
  assert.strictEqual(rExp.success, false, 'Expired voucher should not be redeemable');
  console.log('  ✅ redeemVoucher: checks and enforces voucher expiration date');
  passed++;

  // Test 9: Delete voucher
  const delRes = await deleteVoucher('TEST-PROMO-30');
  assert.strictEqual(delRes, true, 'Voucher should be deleted');
  await deleteVoucher('TEST-EXPIRED');
  console.log('  ✅ deleteVoucher: successfully deletes voucher');
  passed++;

  // ==========================================
  // FEATURE 3: SMART FLOODWAIT GUARD TESTS
  // ==========================================
  console.log('\n--- [Feature 3: Smart FloodWait Protection & Health Guard] ---');

  const mockClient = new UserbotClient(777888, 'mock_session_string');
  assert.strictEqual(mockClient.isFloodWaiting(), false);
  assert.strictEqual(mockClient.getFloodWaitSecondsLeft(), 0);
  console.log('  ✅ FloodGuard: client starts in normal state (not flood waiting)');
  passed++;

  // Test 10: Record flood wait
  mockClient.recordFloodWait(45);
  assert.strictEqual(mockClient.isFloodWaiting(), true);
  const secondsLeft = mockClient.getFloodWaitSecondsLeft();
  assert.ok(secondsLeft >= 44 && secondsLeft <= 45, 'Seconds left should be ~45');
  console.log('  ✅ FloodGuard: recordFloodWait sets safe hibernation countdown');
  passed++;

  // Test 11: Error parser for FLOOD_WAIT_X
  const mockClient2 = new UserbotClient(888999, 'mock_session_2');
  mockClient2.handlePossibleFloodError(new Error('RPC_CALL_FAIL: FLOOD_WAIT_120'));
  assert.strictEqual(mockClient2.isFloodWaiting(), true);
  assert.strictEqual(mockClient2.lastFloodSeconds, 120);
  console.log('  ✅ FloodGuard: handlePossibleFloodError parses string FLOOD_WAIT_X errors');
  passed++;

  // Test 12: Error parser for error.seconds object
  const mockClient3 = new UserbotClient(999000, 'mock_session_3');
  mockClient3.handlePossibleFloodError({ seconds: 60, message: 'Flood limit' });
  assert.strictEqual(mockClient3.isFloodWaiting(), true);
  assert.strictEqual(mockClient3.lastFloodSeconds, 60);
  console.log('  ✅ FloodGuard: handlePossibleFloodError parses { seconds } error objects');
  passed++;

  // Test 13: Manager getFloodStatus
  userbotManager.clients.set(888999, mockClient2);
  const status = userbotManager.getFloodStatus(888999);
  assert.strictEqual(status.inCooldown, true);
  assert.ok(status.secondsLeft > 100);
  userbotManager.clients.delete(888999);
  console.log('  ✅ FloodGuard: userbotManager.getFloodStatus reports status and countdown');
  passed++;

  // ==========================================
  // FEATURE 4: VISUAL BROADCAST SCHEDULER TESTS
  // ==========================================
  console.log('\n--- [Feature 4: Visual Broadcast Scheduler] ---');

  const dummyClient = {
    sendMessage: async () => {},
  };

  // Test 14: startLoop registers in loopStore
  startLoop(dummyClient, 55555, '-100987654321', 10, 'Promo Pesan Otomatis', false);
  const userLoops = loopStore.get(55555);
  assert.ok(userLoops, 'userLoops map should exist');
  assert.ok(userLoops.has('-100987654321'), 'loop should be registered for chat');
  const loopEntry = userLoops.get('-100987654321');
  assert.strictEqual(loopEntry.minutes, 10);
  assert.strictEqual(loopEntry.message, 'Promo Pesan Otomatis');
  console.log('  ✅ Scheduler: startLoop successfully initializes active broadcast loop');
  passed++;

  // Test 15: stopLoop cleans up interval
  const stopped = stopLoop(55555, '-100987654321', false);
  assert.strictEqual(stopped, true, 'stopLoop should return true');
  assert.strictEqual(userLoops.has('-100987654321'), false, 'loop should be removed');
  console.log('  ✅ Scheduler: stopLoop gracefully stops and cleans up broadcast loop');
  passed++;

  // ==========================================
  // FEATURE 5: TERMS OF SERVICE (AGREEMENT GATE) TESTS
  // ==========================================
  console.log('\n--- [Feature 5: Syarat & Ketentuan Layanan (TOS Gate)] ---');

  // Test 16: New regular user has not accepted terms by default
  const testUserId = 77777777;
  setAcceptedTerms(testUserId, false);
  assert.strictEqual(hasAcceptedTerms(testUserId), false, 'New user should not have accepted terms');
  console.log('  ✅ hasAcceptedTerms: returns false for unaccepted regular user');
  passed++;

  // Test 17: Setting accepted terms returns true
  setAcceptedTerms(testUserId, true);
  assert.strictEqual(hasAcceptedTerms(testUserId), true, 'User should have accepted terms');
  console.log('  ✅ setAcceptedTerms: registers user acceptance successfully');
  passed++;

  // Test 18: Unsetting / declining terms reverts to false
  setAcceptedTerms(testUserId, false);
  assert.strictEqual(hasAcceptedTerms(testUserId), false, 'User should not have accepted terms after decline');
  console.log('  ✅ setAcceptedTerms: allows revoking or declining terms');
  passed++;

  // Test 19: Owner is automatically accepted
  const ownerId = Number(config.ownerId);
  assert.strictEqual(hasAcceptedTerms(ownerId), true, 'Owner should always be auto-accepted');
  console.log('  ✅ hasAcceptedTerms: automatically authorizes owner');
  passed++;

  console.log(`\n============================================================`);
  console.log(`🎉 ALL NEW FEATURE TESTS PASSED! (${passed}/${passed})`);
  console.log(`============================================================\n`);
}

runFeatureTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
