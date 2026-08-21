import { Bot, session, Context } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';
import { GrammyError, HttpError } from 'grammy';

import config from '../config.js';
import {
  otpRegistrationConversation,
  qrRegistrationConversation,
  customNameConversation,
} from './conversations/registration.js';
import {
  afkReasonConversation,
  manageVarsConv,
  manageSystemVarsConv,
} from './conversations/settings.js';
import { registerRichHandlers } from './ui/keyboards/dashboard.js';
import { registerInlineHelpHandlers } from './handlers/inlineHelp.js';
import { setLoggerBot } from '../utils/logger.js';
import { registerAllHandlers } from './handlers/index.js';
import { Logger } from '../utils/logger.js';

const bot = new Bot(config.botToken);

// --- Manual sequentialize implementation (no extra deps) ---
// Maps key -> Promise<void> that resolves when the current update finishes.
const sequentializeLocks = new Map<string, Promise<void>>();

function sequentialize(keyFn: (ctx: Context) => string) {
  return async (ctx: Context, next: () => Promise<void>) => {
    const key = keyFn(ctx);
    const currentLock = sequentializeLocks.get(key);
    if (currentLock) {
      // Wait for previous update from this key to finish
      await currentLock;
    }
    let release: () => void;
    const newLock = new Promise<void>((resolve) => { release = resolve; });
    sequentializeLocks.set(key, newLock);
    try {
      await next();
    } finally {
      release!();
      // Clean up: only delete if no new lock was added while we were running
      if (sequentializeLocks.get(key) === newLock) {
        sequentializeLocks.delete(key);
      }
    }
  };
}

bot.use(sequentialize((ctx) => {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  return chatId !== undefined && userId !== undefined ? `${chatId}:${userId}` : `${chatId ?? userId ?? 'unknown'}`;
}));

bot.use(session({ initial: () => ({}) }));
bot.use(limit({
  timeFrame: 2000,
  limit: 3,
  keyGenerator: (ctx) => ctx.from?.id?.toString(),
  onLimitExceeded: async (ctx) => {
    try { await ctx.replyWithRichMessage({ html: `<blockquote><b>❌ KESALAHAN</b><br>Terlalu cepat. Tunggu beberapa detik dulu.</blockquote>` }); } catch (_) { /* empty */ }
  },
}));

bot.use(conversations());
bot.use(createConversation(otpRegistrationConversation, 'otp-reg'));
bot.use(createConversation(qrRegistrationConversation, 'qr-reg'));
bot.use(createConversation(customNameConversation, 'custom-name-conv'));
bot.use(createConversation(afkReasonConversation, 'afk-reason-conv'));
bot.use(createConversation(manageVarsConv, 'manage-vars-conv'));
bot.use(createConversation(manageSystemVarsConv, 'manage-system-vars-conv'));

setLoggerBot(bot);

// Register dashboard UI components (menus, start command, etc)
registerRichHandlers(bot);

// Inline help handlers (menjawab inline query 'help_ubot' dari userbot .help)
registerInlineHelpHandlers(bot);
// Register all modular handlers
registerAllHandlers(bot);

/**
 * Set bot commands for Telegram command discovery (/start, /menu visible in UI).
 * Called from the entry point (src/index.ts) after the bot successfully starts.
 */
export async function setupBotCommands() {
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Buka dashboard utama' },
      { command: 'menu', description: 'Buka menu bot' },
      { command: 'health', description: 'Cek status server (owner only)' },
      { command: 'revoke', description: 'Hapus sesi userbot Anda' },
    ]);
  } catch (err) {
    Logger.logSystem(`Failed to setMyCommands: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
  }
}

// Proper error handler — classify GrammyError, HttpError, and generic errors.
// Per grammY best practices: unhandled errors in middleware can crash the bot.
bot.catch((err) => {
  const ctx = err.ctx;
  const e = err.error;

  // Silently ignore "message is not modified" — common on rapid edits
  const description = (e as { description?: string })?.description || '';
  if (description.includes('message is not modified')) {return;}

  if (e instanceof GrammyError) {
    Logger.logSystem(`GrammyError in update ${ctx?.update?.update_id}: ${e.description}`, 'ERROR');
  } else if (e instanceof HttpError) {
    Logger.logSystem(`HttpError in update ${ctx?.update?.update_id}: failed to contact Telegram`, 'ERROR');
  } else {
    console.error(`❌ Unhandled error in update ${ctx?.update?.update_id}:`, e);
  }
});

export default bot;
