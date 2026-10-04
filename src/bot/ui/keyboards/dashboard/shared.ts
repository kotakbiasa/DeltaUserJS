/**
 * Konstanta dan helper kecil yang dipakai panel, keyboard, dan handler.
 *
 * Dipecah dari dashboard.ts (2.821 baris). Isi tiap fungsi dipindahkan apa
 * adanya; yang berubah hanya di file mana ia tinggal.
 */
import config from '../../../../config.js';
import { getAllRegisteredUsers, getDisabledPlugins, updateTelegramPremiumStatus } from '../../../../infrastructure/database.js';
import { systemConfigCache } from '../../../../infrastructure/dbCore.js';
import { loadedPlugins } from '../../../../userbot/engine/pluginRegistry.js';
import type { Plugin } from '../../../../userbot/engine/pluginRegistry.js';
import { getApprovedUserMeta, getApprovedUsers, isApproved } from '../../../state/approvedUsers.js';
import type { BotContext } from '../../../context.js';

export const PROTECTED_PLUGINS = ['admin', 'pluginmanager'];

export const PLUGINS_PER_PAGE = 8;

export const PLUGIN_CATEGORIES: Record<string, { label: string; icon: string }> = {
  all: { label: 'Semua', icon: '📦' },
  group: { label: 'Grup', icon: '👥' },
  util: { label: 'Utility', icon: '🛠️' },
  tools: { label: 'Tools', icon: '🎨' },
  admin: { label: 'Admin', icon: '🛡️' },
  system: { label: 'Sistem', icon: '⚙️' },
};

export function getPluginCategory(plugin: Plugin): string {
  if (plugin && plugin.file) {
    const topDir = String(plugin.file).split(/[/\\]/)[0].toLowerCase();
    if (topDir in PLUGIN_CATEGORIES) {return topDir;}
  }
  return 'util';
}

export function formatModuleName(name: string): string {
  if (!name) {return '';}
  if (name.toLowerCase() === 'antipm') {return 'AntiPM';}
  if (name.length <= 3) {return name.toUpperCase();}
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function normalizedDisabled(telegramId: number) {
  return getDisabledPlugins(telegramId).map((name: string) => String(name).toLowerCase());
}

export function sortedPlugins() {
  return [...loadedPlugins].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function pluginCategoryInfo(category = 'all', page = 1) {
  let list = sortedPlugins();
  const selectedCat = (category in PLUGIN_CATEGORIES) ? category : 'all';
  if (selectedCat !== 'all') {
    list = list.filter(p => getPluginCategory(p) === selectedCat);
  }
  const totalPages = Math.max(1, Math.ceil(list.length / PLUGINS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * PLUGINS_PER_PAGE;
  return {
    plugins: list.slice(start, start + PLUGINS_PER_PAGE),
    page: currentPage,
    totalPages,
    total: list.length,
    category: selectedCat
  };
}

export function pluginPageInfo(page = 1) {
  return pluginCategoryInfo('all', page);
}

export function badge(condition: unknown, yes = '✅', no = '❌') {
  return condition ? yes : no;
}

// --- Panel builders ---

export function isOwner(ctx: BotContext) {
  return Number(ctx.from?.id) === Number(config.ownerId);
}

export function isAutoApproveEnabled(): boolean {
  return getSystemVarValue('AUTO_APPROVE', '0') === '1';
}

export function canRegister(ctx: BotContext): boolean {
  const userId = ctx.from?.id;
  return Boolean(userId && (isOwner(ctx) || isApproved(userId) || isAutoApproveEnabled()));
}

export function userInfo(ctx: BotContext) {
  const firstName = ctx.from?.first_name || 'User';
  const botName = ctx.me?.first_name || 'Bot';
  return { firstName, botName };
}

export function isTelegramPremium(ctx?: BotContext, session?: { is_telegram_premium?: number }): boolean {
  if (ctx?.from?.is_premium !== undefined) {
    const isPrem = Boolean(ctx.from.is_premium);
    if (session && session.is_telegram_premium !== (isPrem ? 1 : 0) && ctx.from?.id) {
      session.is_telegram_premium = isPrem ? 1 : 0;
      updateTelegramPremiumStatus(ctx.from.id, isPrem ? 1 : 0).catch(() => {});
    }
    return isPrem;
  }
  return session?.is_telegram_premium === 1;
}

export function formatTelegramPremiumBadge(isPremium: boolean): string {
  return isPremium ? '⭐ Ya' : '⚪ Tidak';
}

export function getSystemVarValue(key: string, fallback: string): string {
  return String((systemConfigCache.vars as Record<string, unknown>)?.[key] ?? '') || fallback;
}

export function getSystemVarNum(key: string, fallback: number): number {
  return Number((systemConfigCache.vars as Record<string, unknown>)?.[key]) || fallback;
}

export const ADMIN_USERS_PER_PAGE = 6;

export interface CombinedAdminUser {
  telegram_id: number;
  custom_name?: string;
  username?: string;
  is_active: number;
  is_awaiting_reg: boolean;
  is_telegram_premium?: number;
  expired_at?: string | null;
  approved_at?: number;
}

export function getCombinedAdminUsers(): CombinedAdminUser[] {
  const registeredUsers = getAllRegisteredUsers();
  const registeredIds = new Set(registeredUsers.map(u => Number(u.telegram_id)));

  const awaitingUsers: CombinedAdminUser[] = getApprovedUsers()
    .filter(id => !registeredIds.has(Number(id)))
    .map(id => {
      const meta = getApprovedUserMeta(id);
      return {
        telegram_id: id,
        custom_name: meta?.name || 'Calon User',
        username: meta?.username,
        is_active: 1,
        is_awaiting_reg: true,
        is_telegram_premium: 0,
        approved_at: meta?.approvedAt,
      };
    });

  const registeredFormatted: CombinedAdminUser[] = registeredUsers.map(u => {
    const user = u as typeof u & { username?: string; is_telegram_premium?: number };
    return {
      telegram_id: user.telegram_id,
      custom_name: user.custom_name,
      username: user.username,
      is_active: user.is_active,
      is_awaiting_reg: false,
      is_telegram_premium: user.is_telegram_premium,
      expired_at: user.expired_at,
    };
  });

  return [...registeredFormatted, ...awaitingUsers];
}

export const LOOPS_PER_PAGE = 5;
