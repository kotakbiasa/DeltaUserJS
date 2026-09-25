// TypeScript interface & wrapper untuk window.Telegram.WebApp

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(event: string, handler: () => void): void;
  offEvent?(event: string, handler: () => void): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

/** Terapkan tema Telegram ke <html data-theme> supaya CSS token ikut berubah. */
export function applyTheme() {
  if (typeof document === 'undefined') return;
  const scheme = tg?.colorScheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', scheme);
  return scheme;
}

export function initTelegramApp(signalReady = true) {
  applyTheme();
  if (!tg) return;
  if (signalReady) {
    tg.ready();
    tg.expand();
  }
  // Sinkronkan ulang bila pengguna mengganti tema Telegram saat app terbuka.
  tg.onEvent?.('themeChanged', applyTheme);
  return tg.colorScheme === 'light' ? 'light' : 'dark';
}

export function triggerHaptic(
  style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selectionChanged' = 'light'
) {
  try {
    if (!tg?.HapticFeedback) return;
    if (style === 'selectionChanged') {
      tg.HapticFeedback.selectionChanged();
    } else if (style === 'success' || style === 'warning' || style === 'error') {
      tg.HapticFeedback.notificationOccurred(style);
    } else {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch {
    // Ignore if not supported
  }
}

export function showConfirm(message: string): Promise<boolean> {
  if (tg?.showConfirm) {
    return new Promise((resolve) => tg.showConfirm(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function openExternalLink(url: string): void {
  if (tg?.openLink) {
    tg.openLink(url, { try_instant_view: false });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Open only HTTPS payment pages hosted by supported gateways. */
export function openPaymentLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const trustedHost =
      host === 'midtrans.com' || host.endsWith('.midtrans.com') ||
      host === 'xendit.co' || host.endsWith('.xendit.co');
    if (parsed.protocol !== 'https:' || !trustedHost || parsed.username || parsed.password) {
      return false;
    }
    openExternalLink(parsed.toString());
    return true;
  } catch {
    return false;
  }
}

export function openTelegramUser(userId: number | undefined): void {
  if (!userId) return;
  const url = `tg://user?id=${userId}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.location.href = url;
  }
}
