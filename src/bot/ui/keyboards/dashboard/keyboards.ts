/**
 * Barrel pembangun inline keyboard dashboard.
 *
 * Implementasinya dipecah ke keyboardParts/ (dulu satu file 575 baris).
 * Barrel ini dipertahankan agar handlers.ts, routes/, dan dashboard.ts
 * tidak perlu berubah.
 */
export {
  keyboardAccessDenied,
  keyboardMain,
  keyboardPanelMenu,
  keyboardUserbot,
  keyboardPluginStudio,
} from './keyboardParts/main.js';
export {
  keyboardSettings,
  keyboardPrefixPicker,
  keyboardInlineHelper,
  keyboardUserbotDiag,
  keyboardHelpCenter,
  keyboardHelpBack,
  keyboardDangerDelete,
} from './keyboardParts/settings.js';
export {
  keyboardTermsOfService,
  keyboardTermsDeclined,
  keyboardRegister,
  keyboardBuySubscription,
  keyboardSubscription,
} from './keyboardParts/onboarding.js';
export {
  keyboardAdmin,
  keyboardAdminPending,
  keyboardAdminUsers,
  keyboardAdminUserDetail,
  keyboardAdminBroadcast,
  keyboardAdminFleet,
  keyboardAdminBackup,
  keyboardAdminSettings,
} from './keyboardParts/admin.js';
export {
  keyboardUserLoops,
  keyboardBack,
  applyButtonStylesToPayload,
} from './keyboardParts/misc.js';
