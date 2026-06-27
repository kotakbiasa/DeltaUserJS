import { registerGuestHandler } from './user/guest.js';
import { registerSettingsHandlers } from './user/settings.js';

import { registerLegacyCallbacks } from './core/callbacks.js';
import { registerInlineHelpHandlers, registerInlineLatexHandlers } from './core/help.js';
import { registerInlineAntiPmHandlers } from './core/antiPm.js';
import { registerInlineAnilistHandlers } from './core/anilist.js';
import config from '../../config.js';

import { registerOwnerHandlers } from './admin/admin.js';
import { registerAdminHandlers } from './admin/admin_bot.js';
import { registerEvalHandlers } from './admin/eval.js';

import { registerWelcomeHandlers } from './group/welcome.js';
import { registerWarnHandlers } from './group/warns.js';
import { registerNotesHandlers } from './group/notes.js';
import { registerAntispamHandlers } from './group/antispam.js';
import { registerModerationHandlers } from './group/moderation.js';
import { registerBlacklistHandlers } from './group/blacklist.js';
import { registerApproveHandlers } from './group/approve.js';
import { registerReportHandlers } from './group/report.js';
import { registerZombiesHandlers } from './group/zombies.js';
import { registerCaptchaHandlers } from './group/captcha.js';
import { registerLocksHandlers } from './group/locks.js';
import { registerFederationHandlers } from './group/federation.js';
import { registerNightmodeHandlers } from './group/nightmode.js';
import { registerInfoHandlers } from './group/info.js';

import { registerFilterHandlers } from './core/filters.js';

export function registerAllHandlers(bot) {
  // Query Handlers
  registerLegacyCallbacks(bot);
  
  // Registrasi inline query HANYA untuk custom inline bot milik masing-masing user
  if (bot.token !== config.botToken) {
    registerInlineHelpHandlers(bot);
    registerInlineAntiPmHandlers(bot);
    registerInlineLatexHandlers(bot);
    registerInlineAnilistHandlers(bot);
  }

  // User Handlers
  registerGuestHandler(bot);
  registerSettingsHandlers(bot);

  // Owner Handlers
  registerOwnerHandlers(bot);
  registerAdminHandlers(bot);
  registerEvalHandlers(bot);

  // Group Handlers
  registerWelcomeHandlers(bot);
  registerWarnHandlers(bot);
  registerNotesHandlers(bot);
  registerAntispamHandlers(bot);
  registerModerationHandlers(bot);
  registerBlacklistHandlers(bot);
  registerApproveHandlers(bot);
  registerReportHandlers(bot);
  registerNightmodeHandlers(bot);
  registerZombiesHandlers(bot);
  registerCaptchaHandlers(bot);
  registerLocksHandlers(bot);
  registerFederationHandlers(bot);
  registerInfoHandlers(bot);

  // Filters
  registerFilterHandlers(bot);
}
