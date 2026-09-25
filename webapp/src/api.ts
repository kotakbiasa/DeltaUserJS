import { tg } from './telegram';

const BASE_URL = typeof window !== 'undefined' && /^\/ubot(?:\/|$)/.test(window.location.pathname) ? '/ubot' : '';

function getInitData(): string {
  if (tg?.initData) {
    return tg.initData;
  }
  // Fallback dev mode jika dibuka langsung via browser biasa
  return 'dev_user_1025855210';
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Telegram-Init-Data', getInitData());
  if (!headers.has('Content-Type') && options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || `HTTP error ${response.status}`);
  }
  return data;
}

export interface UserMe {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  isPremium: boolean;
  isOwner: boolean;
  isApproved: boolean;
}

export interface UserbotStatus {
  hasSession: boolean;
  isActive: boolean;
  connected: boolean;
  phone: string | null;
  uptime: number;
  floodGuard: {
    inCooldown: boolean;
    remainingSeconds: number;
  };
  stats: {
    activeUserbotsCount: number;
    pluginsCount: number;
    memoryUsageMb: number;
  };
}

export interface PluginItem {
  name: string;
  category: string;
  title: string;
  description: string;
  usage: string;
  detail: string | null;
  enabled: boolean;
}

export interface SubscriptionInfo {
  isOwner: boolean;
  isActive: boolean;
  status: string;
  expiredAt: string | null;
  graceEndDate?: string | null;
  startDate?: string | null;
  autoRenew: boolean;
  daysLeft: number;
  graceDaysLeft?: number;
  isExpired: boolean;
  isLifetime?: boolean;
  planId?: string | null;
  planName: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  maxUserbots: number;
  trialDays: number;
}

export interface SubscriptionPayment {
  id: string;
  planId: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'cancelled';
  paymentUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface ChatItem {
  id: string;
  title: string;
  isGroup: boolean;
  isChannel: boolean;
  isUser: boolean;
}

export interface UserSettings {
  prefix: string;
  antiPm: boolean;
  autoReply: boolean;
  afkReason: string;
  customName: string;
  logChatId: string;
  inlineBotToken: string;
  inlineBotUsername: string;
  approvedUsers: number[];
  broadcastBlacklist: string[];
}

export interface VarsData {
  userVars: Record<string, string>;
  systemVars?: Record<string, string>;
}

export interface DiagnosticsData {
  connected: boolean;
  pingMs: number;
  dcId: string;
  uptime: number;
  activePlugins: number;
  disabledPlugins: number;
  floodGuard: {
    inCooldown: boolean;
    remainingSeconds: number;
  };
}

export interface StoreProduct {
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

export type StoreOrderStatus = 'pending' | 'contacted' | 'completed' | 'cancelled';

export interface StoreOrder {
  id: string;
  userId: number;
  username?: string;
  productId: string;
  productName: string;
  pluginName: string;
  version: string;
  amount: number;
  currency: 'IDR';
  status: StoreOrderStatus;
  buyerNote: string;
  ownerReply: string;
  createdAt: string;
  updatedAt: string;
}

export type StoreProductInput = Pick<
  StoreProduct,
  'name' | 'pluginName' | 'version' | 'description' | 'price' | 'category' | 'deliveryNote'
> & {
  tags?: string[];
  featured?: boolean;
};

export const api = {
  getMe: () => fetchApi<{ success: boolean; user: UserMe; hasUserbot: boolean; isActive: boolean }>('/api/me'),
  getUserbotStatus: () => fetchApi<{ success: boolean } & UserbotStatus>('/api/userbot/status'),
  toggleUserbot: (active?: boolean) =>
    fetchApi<{ success: boolean; connected: boolean; message: string }>('/api/userbot/toggle', {
      method: 'POST',
      body: JSON.stringify({ active }),
    }),
  getPlugins: () => fetchApi<{ success: boolean; total: number; disabledCount: number; plugins: PluginItem[] }>('/api/plugins'),
  togglePlugin: (pluginName: string, enabled: boolean) =>
    fetchApi<{ success: boolean; message: string }>('/api/plugins/toggle', {
      method: 'POST',
      body: JSON.stringify({ pluginName, enabled }),
    }),
  getSubscription: () => fetchApi<{ success: boolean } & SubscriptionInfo>('/api/subscription'),
  getSubscriptionPlans: () =>
    fetchApi<{
      success: boolean;
      plans: SubscriptionPlan[];
      availableGateways: string[];
      ownerId?: number;
    }>('/api/subscription/plans'),
  createSubscriptionCheckout: (planId: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      gateway?: string;
      paymentUrl?: string;
      expiresAt?: string;
      ownerId?: number;
    }>('/api/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),
  getSubscriptionPayments: () =>
    fetchApi<{ success: boolean; payments: SubscriptionPayment[] }>('/api/subscription/payments'),
  cancelSubscriptionAutoRenew: () =>
    fetchApi<{ success: boolean; message: string }>('/api/subscription/cancel-auto-renew', {
      method: 'POST',
    }),
  redeemVoucher: (code: string) =>
    fetchApi<{ success: boolean; message: string }>('/api/subscription/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  getChats: () => fetchApi<{ success: boolean; chats: ChatItem[] }>('/api/chats'),
  sendBroadcast: (chatIds: string[], message: string) =>
    fetchApi<{ success: boolean; message: string }>('/api/broadcast/send', {
      method: 'POST',
      body: JSON.stringify({ chatIds, message }),
    }),
  getSettings: () => fetchApi<{ success: boolean; settings: UserSettings }>('/api/settings'),
  updateSettings: (settings: Partial<UserSettings>) =>
    fetchApi<{ success: boolean; message: string }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  addApprovedUser: (targetUserId: number | string) =>
    fetchApi<{ success: boolean; approvedUsers: number[] }>('/api/settings/approved-users', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),
  removeApprovedUser: (targetUserId: number | string) =>
    fetchApi<{ success: boolean; approvedUsers: number[] }>('/api/settings/approved-users', {
      method: 'DELETE',
      body: JSON.stringify({ targetUserId }),
    }),
  addBroadcastBlacklist: (chatId: string) =>
    fetchApi<{ success: boolean; broadcastBlacklist: string[] }>('/api/settings/broadcast-blacklist', {
      method: 'POST',
      body: JSON.stringify({ chatId }),
    }),
  removeBroadcastBlacklist: (chatId: string) =>
    fetchApi<{ success: boolean; broadcastBlacklist: string[] }>('/api/settings/broadcast-blacklist', {
      method: 'DELETE',
      body: JSON.stringify({ chatId }),
    }),
  getVars: () => fetchApi<{ success: boolean } & VarsData>('/api/vars'),
  setVar: (key: string, value: string, isSystem?: boolean) =>
    fetchApi<{ success: boolean; message: string; userVars?: Record<string, string>; systemVars?: Record<string, string> }>('/api/vars', {
      method: 'POST',
      body: JSON.stringify({ key, value, isSystem }),
    }),
  deleteVar: (key: string, isSystem?: boolean) =>
    fetchApi<{ success: boolean; message: string; userVars?: Record<string, string>; systemVars?: Record<string, string> }>('/api/vars', {
      method: 'DELETE',
      body: JSON.stringify({ key, isSystem }),
    }),
  getDiagnostics: () => fetchApi<{ success: boolean } & DiagnosticsData>('/api/userbot/diagnostics'),
  logoutSession: () =>
    fetchApi<{ success: boolean; message: string }>('/api/userbot/logout', {
      method: 'POST',
    }),
  getStoreProducts: (includeInactive = false) =>
    fetchApi<{
      success: boolean;
      paymentMode: 'manual';
      ownerId?: number;
      products: StoreProduct[];
    }>(`/api/store/products${includeInactive ? '?includeInactive=true' : ''}`),
  createStoreProduct: (product: StoreProductInput) =>
    fetchApi<{ success: boolean; message: string; product: StoreProduct }>('/api/store/products', {
      method: 'POST',
      body: JSON.stringify(product),
    }),
  updateStoreProduct: (
    productId: string,
    patch: Partial<StoreProductInput> & { active?: boolean; featured?: boolean }
  ) =>
    fetchApi<{ success: boolean; message: string; product: StoreProduct }>(
      `/api/store/products/${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),
  deleteStoreProduct: (productId: string) =>
    fetchApi<{ success: boolean; message: string; product: StoreProduct }>(
      `/api/store/products/${encodeURIComponent(productId)}`,
      { method: 'DELETE' }
    ),
  getStoreOrders: (all = false) =>
    fetchApi<{ success: boolean; orders: StoreOrder[] }>(
      `/api/store/orders${all ? '?scope=all&limit=100' : '?limit=50'}`
    ),
  createStoreOrder: (productId: string, note?: string) =>
    fetchApi<{ success: boolean; message: string; order: StoreOrder }>('/api/store/orders', {
      method: 'POST',
      body: JSON.stringify({ productId, note }),
    }),
  updateStoreOrder: (orderId: string, patch: { status?: StoreOrderStatus; ownerReply?: string }) =>
    fetchApi<{ success: boolean; message: string; order: StoreOrder }>(
      `/api/store/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),
  getAdminStats: () => fetchApi<{ success: boolean; stats: any }>('/api/admin/stats'),
  getAdminUsers: () => fetchApi<{ success: boolean; users: any[] }>('/api/admin/users'),
};
