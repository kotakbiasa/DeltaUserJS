import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.BOT_TOKEN = '123456:unit-test-token';
process.env.OWNER_ID = '123456';
process.env.NODE_ENV = 'test';
process.env.XENDIT_CALLBACK_TOKEN = 'xendit-webhook-secret';
delete process.env.ALLOW_DEV_AUTH;

const { validateTelegramInitData } = await import('../dist/server/auth.js');
const { handlePaymentWebhook, mapMidtransStatus } = await import('../dist/services/PaymentGateway.js');
const { normalizeBot } = await import('../dist/infrastructure/dbCore.js');

function signedInitData(fields, botToken = process.env.BOT_TOKEN) {
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const check = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('explicit lifetime expiry is preserved during database normalization', () => {
  const normalized = normalizeBot({ telegram_id: 42, expired_at: null }, 42);
  assert.equal(normalized.expired_at, null);
});

test('valid Telegram initData is accepted', () => {
  const authDate = Math.floor(Date.now() / 1000);
  const raw = signedInitData({
    auth_date: String(authDate),
    query_id: 'AAQ-test',
    user: JSON.stringify({ id: 42, first_name: 'Tester' }),
  });
  const result = validateTelegramInitData(raw);
  assert.equal(result.valid, true);
  assert.equal(result.data.user.id, 42);
  assert.equal(result.data.query_id, 'AAQ-test');
});

test('expired and future-dated initData are rejected', () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = signedInitData({
    auth_date: String(now - 90_000),
    user: JSON.stringify({ id: 42 }),
  });
  assert.match(validateTelegramInitData(expired).error, /kadaluwarsa/);

  const future = signedInitData({
    auth_date: String(now + 180),
    user: JSON.stringify({ id: 42 }),
  });
  assert.match(validateTelegramInitData(future).error, /masa depan/);
});

test('dev impersonation requires explicit opt-in and loopback', () => {
  const result = validateTelegramInitData('dev_user_999');
  assert.equal(result.valid, false);

  process.env.ALLOW_DEV_AUTH = 'true';
  assert.equal(validateTelegramInitData('dev_user_999', undefined, '127.0.0.1').valid, true);
  assert.equal(validateTelegramInitData('dev_user_999', undefined, '203.0.113.10').valid, false);
  delete process.env.ALLOW_DEV_AUTH;
});

test('Midtrans refunds are represented as refunded, not failed', () => {
  assert.equal(mapMidtransStatus({ transaction_status: 'refund' }), 'refunded');
});

test('Xendit webhook requires the configured callback token', async () => {
  const payload = {
    id: 'inv_test',
    external_id: 'SUB-123-MONTHLY',
    user_id: 'user-123',
    status: 'PAID',
    amount: 50000,
  };

  assert.equal(await handlePaymentWebhook('xendit', payload, {}), null);
  assert.equal(
    await handlePaymentWebhook('xendit', payload, { 'x-callback-token': 'wrong-secret' }),
    null
  );
  const accepted = await handlePaymentWebhook('xendit', payload, {
    'x-callback-token': 'xendit-webhook-secret',
  });
  assert.equal(accepted.orderId, 'SUB-123-MONTHLY');
  assert.equal(accepted.status, 'paid');
});
