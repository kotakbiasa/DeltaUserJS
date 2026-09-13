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
  openLink(url: string): void;
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

export function initTelegramApp() {
  applyTheme();
  if (!tg) return;
  tg.ready();
  tg.expand();
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
