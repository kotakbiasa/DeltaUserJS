/**
 * Barrel panel inti dashboard.
 *
 * Implementasinya dipecah ke core/ (dulu satu file 721 baris). Barrel ini
 * dipertahankan agar panels.ts dan pemanggil lain tidak perlu berubah.
 */
export {
  panelMain,
  panelMenuList,
  panelUserbot,
} from './core/main.js';
export {
  panelPlugins,
  panelPluginDetail,
} from './core/plugins.js';
export {
  panelSettings,
  panelPrefixPicker,
  panelInlineHelper,
  panelUserbotDiag,
} from './core/settings.js';
export {
  panelTermsOfService,
  panelTermsDeclined,
  panelDangerDelete,
  panelRegister,
  panelSubscription,
  panelBuySubscription,
  panelAccessDenied,
} from './core/onboarding.js';
