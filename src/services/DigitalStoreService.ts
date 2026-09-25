import crypto from 'crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

export type DigitalOrderStatus = 'pending' | 'contacted' | 'completed' | 'cancelled';

export interface DigitalProduct {
  id: string;
  name: string;
  pluginName: string;
  version: string;
  description: string;
  price: number;
  currency: 'IDR';
  category: string;
  tags: string[];
  deliveryNote: string;
  active: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalOrder {
  id: string;
  userId: number;
  username?: string;
  productId: string;
  productName: string;
  pluginName: string;
  version: string;
  amount: number;
  currency: 'IDR';
  status: DigitalOrderStatus;
  buyerNote: string;
  ownerReply: string;
  createdAt: string;
  updatedAt: string;
}

interface DigitalStoreData {
  version: 1;
  products: DigitalProduct[];
  orders: DigitalOrder[];
}

export interface DigitalProductInput {
  name: string;
  pluginName: string;
  version: string;
  description: string;
  price: number;
  category?: string;
  tags?: string[] | string;
  deliveryNote?: string;
  active?: boolean;
  featured?: boolean;
}

export type DigitalProductPatch = Partial<DigitalProductInput>;

const DEFAULT_DATA: DigitalStoreData = {
  version: 1,
  products: [],
  orders: [],
};

const storePath = path.resolve(
  process.env.DIGITAL_STORE_PATH || path.join(process.cwd(), 'data', 'digital-store.json')
);

let storeCache: DigitalStoreData | null = null;
let loadPromise: Promise<DigitalStoreData> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

export class DigitalStoreError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'DigitalStoreError';
  }
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}

function createId(prefix: 'product' | 'order'): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function cleanText(value: unknown, maxLength: number, fallback = ''): string {
  return String(value ?? fallback).split('\u0000').join('').trim().slice(0, maxLength);
}

function cleanTags(value: unknown): string[] {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const tags = source
    .map((tag) => cleanText(tag, 30).toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 8);
}

function normalizePrice(value: unknown): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000_000) {
    throw new DigitalStoreError('Harga plugin tidak valid.');
  }
  return Math.round(price);
}

function normalizeProductInput(input: DigitalProductInput): Omit<DigitalProduct, 'id' | 'createdAt' | 'updatedAt'> {
  const name = cleanText(input.name, 80);
  const pluginName = cleanText(input.pluginName, 50);
  const version = cleanText(input.version, 30);
  const description = cleanText(input.description, 2000);

  if (!name) {throw new DigitalStoreError('Nama plugin wajib diisi.');}
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pluginName)) {
    throw new DigitalStoreError('Nama internal plugin hanya boleh berisi huruf, angka, titik, underscore, atau strip.');
  }
  if (!version) {throw new DigitalStoreError('Versi plugin wajib diisi.');}
  if (!description) {throw new DigitalStoreError('Deskripsi plugin wajib diisi.');}

  return {
    name,
    pluginName,
    version,
    description,
    price: normalizePrice(input.price),
    currency: 'IDR',
    category: cleanText(input.category, 40, 'Plugin Digital') || 'Plugin Digital',
    tags: cleanTags(input.tags),
    deliveryNote: cleanText(input.deliveryNote, 500, 'Plugin dikirim atau diinstal setelah owner menghubungi pembeli.'),
    active: input.active !== false,
    featured: Boolean(input.featured),
  };
}

function normalizeStoreData(value: unknown): DigitalStoreData {
  if (!value || typeof value !== 'object') {return cloneData(DEFAULT_DATA);}
  const source = value as Partial<DigitalStoreData>;
  return {
    version: 1,
    products: Array.isArray(source.products) ? source.products : [],
    orders: Array.isArray(source.orders) ? source.orders : [],
  };
}

async function loadStore(): Promise<DigitalStoreData> {
  if (storeCache) {return cloneData(storeCache);}
  if (loadPromise) {return loadPromise;}

  loadPromise = (async () => {
    try {
      const raw = await readFile(storePath, 'utf8');
      const parsed = normalizeStoreData(JSON.parse(raw));
      storeCache = parsed;
      return cloneData(parsed);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : '';
      if (code !== 'ENOENT') {
        Logger.logSystem(`Digital store load failed: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
        throw new DigitalStoreError('Data toko digital tidak dapat dibaca.', 500);
      }

      await mkdir(path.dirname(storePath), { recursive: true });
      await writeFile(storePath, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
      storeCache = cloneData(DEFAULT_DATA);
      return cloneData(storeCache);
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

async function persistStore(data: DigitalStoreData): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    try {
      await rename(tempPath, storePath);
    } catch (error) {
      // Windows cannot atomically replace an existing file with rename.
      // The single-process write queue makes this fallback safe for the
      // intended one-instance deployment.
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : '';
      if (process.platform === 'win32' && (code === 'EEXIST' || code === 'EPERM')) {
        await rm(storePath, { force: true });
        await rename(tempPath, storePath);
      } else {
        throw error;
      }
    }
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
  storeCache = cloneData(data);
}

async function withStoreWrite<T>(operation: (data: DigitalStoreData) => Promise<T> | T): Promise<T> {
  const run = writeQueue.then(async () => {
    const current = await loadStore();
    const draft = cloneData(current);
    const result = await operation(draft);
    await persistStore(draft);
    return result;
  });
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function initDigitalStore(): Promise<void> {
  await loadStore();
}

export async function listDigitalProducts(includeInactive = false): Promise<DigitalProduct[]> {
  const data = await loadStore();
  return data.products
    .filter((product) => includeInactive || product.active)
    .sort((a, b) => {
      if (a.featured !== b.featured) {return a.featured ? -1 : 1;}
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export async function getDigitalProduct(productId: string): Promise<DigitalProduct | null> {
  const data = await loadStore();
  return data.products.find((product) => product.id === productId) || null;
}

export async function createDigitalProduct(input: DigitalProductInput): Promise<DigitalProduct> {
  return withStoreWrite((data) => {
    const normalized = normalizeProductInput(input);
    const now = new Date().toISOString();
    const product: DigitalProduct = {
      id: createId('product'),
      ...normalized,
      createdAt: now,
      updatedAt: now,
    };
    data.products.unshift(product);
    return cloneData(product);
  });
}

export async function updateDigitalProduct(productId: string, patch: DigitalProductPatch): Promise<DigitalProduct> {
  return withStoreWrite((data) => {
    const index = data.products.findIndex((product) => product.id === productId);
    if (index < 0) {throw new DigitalStoreError('Produk tidak ditemukan.', 404);}

    const current = data.products[index];
    const merged: DigitalProductInput = {
      name: patch.name ?? current.name,
      pluginName: patch.pluginName ?? current.pluginName,
      version: patch.version ?? current.version,
      description: patch.description ?? current.description,
      price: patch.price ?? current.price,
      category: patch.category ?? current.category,
      tags: patch.tags ?? current.tags,
      deliveryNote: patch.deliveryNote ?? current.deliveryNote,
      active: patch.active ?? current.active,
      featured: patch.featured ?? current.featured,
    };
    const normalized = normalizeProductInput(merged);
    const updated: DigitalProduct = {
      ...current,
      ...normalized,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    data.products[index] = updated;
    return cloneData(updated);
  });
}

export async function deleteDigitalProduct(productId: string): Promise<DigitalProduct> {
  return updateDigitalProduct(productId, { active: false });
}

export async function createDigitalOrder(input: {
  userId: number;
  username?: string;
  productId: string;
  note?: string;
}): Promise<DigitalOrder> {
  return withStoreWrite((data) => {
    const product = data.products.find((item) => item.id === input.productId);
    if (!product || !product.active) {
      throw new DigitalStoreError('Plugin tidak tersedia untuk dipesan.', 404);
    }
    const existingOrder = data.orders.find(
      (order) =>
        order.userId === Number(input.userId) &&
        order.productId === product.id &&
        (order.status === 'pending' || order.status === 'contacted')
    );
    if (existingOrder) {
      throw new DigitalStoreError(
        `Pesanan aktif untuk plugin ini sudah ada: ${existingOrder.id}`,
        409
      );
    }

    const now = new Date().toISOString();
    const order: DigitalOrder = {
      id: createId('order'),
      userId: Number(input.userId),
      username: cleanText(input.username, 64) || undefined,
      productId: product.id,
      productName: product.name,
      pluginName: product.pluginName,
      version: product.version,
      amount: product.price,
      currency: product.currency,
      status: 'pending',
      buyerNote: cleanText(input.note, 500),
      ownerReply: '',
      createdAt: now,
      updatedAt: now,
    };
    data.orders.unshift(order);
    return cloneData(order);
  });
}

export async function listDigitalOrders(userId?: number, limit = 50): Promise<DigitalOrder[]> {
  const data = await loadStore();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 50));
  return data.orders
    .filter((order) => userId === undefined || order.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, safeLimit);
}

export async function updateDigitalOrder(
  orderId: string,
  patch: { status?: DigitalOrderStatus; ownerReply?: string }
): Promise<DigitalOrder> {
  return withStoreWrite((data) => {
    const index = data.orders.findIndex((order) => order.id === orderId);
    if (index < 0) {throw new DigitalStoreError('Pesanan tidak ditemukan.', 404);}

    const allowedStatuses: DigitalOrderStatus[] = ['pending', 'contacted', 'completed', 'cancelled'];
    if (patch.status && !allowedStatuses.includes(patch.status)) {
      throw new DigitalStoreError('Status pesanan tidak valid.');
    }

    const current = data.orders[index];
    const updated: DigitalOrder = {
      ...current,
      status: patch.status ?? current.status,
      ownerReply: patch.ownerReply === undefined
        ? current.ownerReply
        : cleanText(patch.ownerReply, 1000),
      updatedAt: new Date().toISOString(),
    };
    data.orders[index] = updated;
    return cloneData(updated);
  });
}
