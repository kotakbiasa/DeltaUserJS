import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

process.env.BOT_TOKEN ||= '123456:test-token';
process.env.OWNER_ID ||= '123456';
process.env.NODE_ENV = 'test';

let tempDir;
let service;

before(async () => {
  tempDir = await mkdtemp(path.join(process.env.TEMP || process.cwd(), 'delta-store-test-'));
  process.env.DIGITAL_STORE_PATH = path.join(tempDir, 'store.json');
  service = await import('../dist/services/DigitalStoreService.js');
  await service.initDigitalStore();
});

after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('digital store creates and persists an active plugin product', async () => {
  const product = await service.createDigitalProduct({
    name: 'Moderation Pro',
    pluginName: 'moderation_pro',
    version: '1.2.0',
    description: 'Moderasi lanjutan untuk grup Telegram.',
    price: 25000,
    category: 'Moderasi',
    tags: 'moderasi, premium',
    featured: true,
  });

  assert.match(product.id, /^product_/);
  assert.equal(product.price, 25000);
  assert.equal(product.currency, 'IDR');
  assert.deepEqual(product.tags, ['moderasi', 'premium']);
  assert.equal(product.active, true);

  const products = await service.listDigitalProducts();
  assert.equal(products.length, 1);
  assert.equal(products[0].id, product.id);

  const saved = JSON.parse(await readFile(process.env.DIGITAL_STORE_PATH, 'utf8'));
  assert.equal(saved.products.length, 1);
});

test('manual order uses server-side product snapshot and can be fulfilled', async () => {
  const [product] = await service.listDigitalProducts();
  const order = await service.createDigitalOrder({
    userId: 987,
    username: 'buyer',
    productId: product.id,
    note: 'Butuh panduan instalasi.',
  });

  assert.equal(order.status, 'pending');
  assert.equal(order.productName, product.name);
  assert.equal(order.amount, product.price);
  assert.equal(order.buyerNote, 'Butuh panduan instalasi.');

  const updated = await service.updateDigitalOrder(order.id, {
    status: 'completed',
    ownerReply: 'Plugin sudah dikirim.',
  });
  assert.equal(updated.status, 'completed');
  assert.equal(updated.ownerReply, 'Plugin sudah dikirim.');

  const userOrders = await service.listDigitalOrders(987);
  assert.equal(userOrders.length, 1);
  assert.equal(userOrders[0].id, order.id);
});

test('duplicate active order is rejected', async () => {
  const [product] = await service.listDigitalProducts();
  const order = await service.createDigitalOrder({
    userId: 987,
    productId: product.id,
  });

  await assert.rejects(
    service.createDigitalOrder({ userId: 987, productId: product.id }),
    /Pesanan aktif/
  );
  await service.updateDigitalOrder(order.id, { status: 'cancelled' });
});

test('invalid product input is rejected', async () => {
  await assert.rejects(
    service.createDigitalProduct({
      name: 'Invalid',
      pluginName: '../unsafe',
      version: '1.0.0',
      description: 'Invalid plugin identifier.',
      price: 1000,
    }),
    /Nama internal plugin/
  );
});
