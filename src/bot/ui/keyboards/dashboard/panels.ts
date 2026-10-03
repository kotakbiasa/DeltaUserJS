/**
 * Panel builders split by responsibility.
 *
 * Keep this barrel stable: dashboard.ts re-exports these names as the
 * public dashboard contract used by handlers and callback routing.
 */
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
} from './panelParts/core.js';
export {
  panelAdmin,
  panelAdminPending,
  panelAdminUsers,
  panelAdminUserDetail,
  panelAdminBroadcast,
  panelAdminFleet,
  panelAdminBackup,
  panelAdminSettings,
  panelStats,
} from './panelParts/admin.js';
export {
  panelUserLoops,
  panelQuickHelp,
  panelHelpQuickstart,
  panelHelpCommands,
  panelHelpFaq,
  panelDonate,
  panelHealth,
} from './panelParts/help.js';
