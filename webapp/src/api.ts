import { tg } from './telegram';

const BASE_URL = typeof window !== 'undefined' && window.location.pathname.startsWith('/ubot') ? '/ubot' : '';

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
  if (!response.ok && !data.success) {
    throw new Error(data.error || `HTTP error ${response.status}`);
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
  expiredAt: string | null;
  daysLeft: number;
  isExpired: boolean;
  planName: string;
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
  getAdminStats: () => fetchApi<{ success: boolean; stats: any }>('/api/admin/stats'),
  getAdminUsers: () => fetchApi<{ success: boolean; users: any[] }>('/api/admin/users'),
};
