/**
 * DeltaUbotJS — Dashboard (UI builders + rich handlers)
 *
 * File ini dulu berisi 2.821 baris. Sekarang isinya ada di ./dashboard/:
 *   shared.ts     konstanta + helper kecil
 *   panels.ts     pembangun teks panel
 *   keyboards.ts  pembangun inline keyboard
 *   handlers.ts   pendaftaran command & callback query
 *
 * Yang di-reexport di sini persis nama yang dulu diekspor — tidak lebih dan
 * tidak kurang — supaya pemakainya (bot/index.ts dan bot/handlers/callbacks.ts)
 * tidak perlu ikut berubah.
 */
export {
  PLUGIN_CATEGORIES,
  getPluginCategory,
  formatModuleName,
  pluginCategoryInfo,
  pluginPageInfo,
  isOwner,
  isTelegramPremium,
  formatTelegramPremiumBadge,
  getCombinedAdminUsers,
} from './dashboard/shared.js';
export type { CombinedAdminUser } from './dashboard/shared.js';
export {
  panelMain,
  panelMenuList,
  panelUserbot,
  panelPlugins,
  panelPluginDetail,
  panelSettings,
  panelPrefixPicker,
  panelInlineHelper,
  panelUserbotDiag,
  panelTermsOfService,
  panelTermsDeclined,
  panelDangerDelete,
  panelRegister,
  panelSubscription,
  panelBuySubscription,
  panelAccessDenied,
  panelAdmin,
  panelAdminPending,
  panelAdminUsers,
  panelAdminUserDetail,
  panelAdminBroadcast,
  panelAdminFleet,
  panelAdminBackup,
  panelAdminSettings,
  panelStats,
  panelUserLoops,
  panelQuickHelp,
  panelHelpQuickstart,
  panelHelpCommands,
  panelHelpFaq,
  panelDonate,
  panelHealth,
} from './dashboard/panels.js';
export {
  keyboardAccessDenied,
  keyboardMain,
  keyboardPanelMenu,
  keyboardUserbot,
  keyboardPluginStudio,
  keyboardSettings,
  keyboardPrefixPicker,
  keyboardInlineHelper,
  keyboardUserbotDiag,
  keyboardHelpCenter,
  keyboardHelpBack,
  keyboardDangerDelete,
  keyboardTermsOfService,
  keyboardTermsDeclined,
  keyboardRegister,
  keyboardBuySubscription,
  keyboardSubscription,
  keyboardAdmin,
  keyboardAdminPending,
  keyboardAdminUsers,
  keyboardAdminUserDetail,
  keyboardAdminBroadcast,
  keyboardAdminFleet,
  keyboardAdminBackup,
  keyboardAdminSettings,
  keyboardUserLoops,
  keyboardBack,
  applyButtonStylesToPayload,
} from './dashboard/keyboards.js';
export {
  registerRichHandlers,
  sendAccessDeniedRich,
} from './dashboard/handlers.js';
