// @ts-nocheck
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';

import config from '../config.js';
import {
  otpRegistrationConversation,
  qrRegistrationConversation,
  afkReasonConversation,
  broadcastConversation,
  manageVarsConv,
  manageSystemVarsConv,
  customNameConversation,
} from './handlers/core/conversations.js';
import { registerRichHandlers } from './keyboards/dashboard.js';
import { setLoggerBot } from '../utils/logger.js';
import { registerAllHandlers } from './handlers/index.js';

const bot = new Bot(config.botToken);

bot.use(session({ initial: () => ({}) }));
bot.use(limit({
  timeFrame: 2000,
  limit: 3,
  keyGenerator: (ctx) => ctx.from?.id?.toString(),
  onLimitExceeded: async (ctx) => {
    try { await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Terlalu cepat. Tunggu beberapa detik dulu.</blockquote>` }); } catch (_) {}
  },
}));

bot.use(conversations());
bot.use(createConversation(otpRegistrationConversation, 'otp-reg'));
bot.use(createConversation(qrRegistrationConversation, 'qr-reg'));
bot.use(createConversation(afkReasonConversation, 'afk-reason-conv'));
bot.use(createConversation(broadcastConversation, 'admin-broadcast-conv'));
bot.use(createConversation(manageVarsConv, 'manage-vars-conv'));
bot.use(createConversation(manageSystemVarsConv, 'manage-system-vars-conv'));
bot.use(createConversation(customNameConversation, 'custom-name-conv'));

setLoggerBot(bot);

// Register dashboard UI components (menus, start command, etc)
registerRichHandlers(bot);

// Register all modular handlers
registerAllHandlers(bot);

bot.catch((err) => {
  const message = err.error?.description || err.error?.message || '';
  if (message.includes('message is not modified')) return;
  console.error(`❌ Bot middleware error ${err.ctx?.update?.update_id}:`, err.error);
});

export default bot;
