import { Bot, session, Context } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';
import { GrammyError, HttpError } from 'grammy';

import config from '../config.js';
import {
  otpRegistrationConversation,
  qrRegistrationConversation,
  customNameConversation,
  broadcastConversation,
} from './conversations/registration.js';
import {
  afkReasonConversation,
  manageVarsConv,
  manageSystemVarsConv,
} from './conversations/settings.js';
import {
  userRedeemVoucherConversation,
  adminCreateVoucherConversation,
} from './conversations/voucher.js';
import { userAddLoopConversation } from './conversations/scheduler.js';
import { registerRichHandlers } from './ui/keyboards/dashboard.js';
import { registerInlineHelpHandlers } from './handlers/inlineHelp.js';
import { registerSubscriptionHandlers } from './handlers/subscription.js';
import { registerAuditHandlers } from './handlers/audit.js';
import { registerMarketplaceHandlers } from './handlers/marketplace.js';
import { registerBackupHandlers } from './handlers/backup.js';
import { setLoggerBot } from '../utils/logger.js';
import { registerAllHandlers } from './handlers/index.js';
import { Logger } from '../utils/logger.js';
import { getUserbotSession, updateTelegramPremiumStatus } from '../infrastructure/database.js';

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

// Auto-sync Telegram Premium status whenever user interacts with the bot
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId && ctx.from?.is_premium !== undefined) {
    const session = getUserbotSession(userId);
    const premVal = ctx.from.is_premium ? 1 : 0;
    if (session && session.is_telegram_premium !== premVal) {
      session.is_telegram_premium = premVal;
      updateTelegramPremiumStatus(userId, premVal).catch(() => {});
    }
  }
  await next();
});

bot.use(limit({
  timeFrame: 2000,
  limit: 3,
  keyGenerator: (ctx) => ctx.from?.id?.toString(),
  onLimitExceeded: async (ctx) => {
    try { await ctx.replyWithRichMessage({ html: `<p>❌ <b>Terlalu cepat.</b> Tunggu beberapa detik dulu.</p>` }); } catch (_) { /* empty */ }
  },
}));

bot.use(conversations());
bot.use(createConversation(otpRegistrationConversation, 'otp-reg'));
bot.use(createConversation(qrRegistrationConversation, 'qr-reg'));
bot.use(createConversation(customNameConversation, 'custom-name-conv'));
bot.use(createConversation(afkReasonConversation, 'afk-reason-conv'));
bot.use(createConversation(manageVarsConv, 'manage-vars-conv'));
bot.use(createConversation(manageSystemVarsConv, 'manage-system-vars-conv'));
bot.use(createConversation(broadcastConversation, 'broadcast-conv'));
bot.use(createConversation(userRedeemVoucherConversation, 'user-redeem-voucher-conv'));
bot.use(createConversation(adminCreateVoucherConversation, 'admin-create-voucher-conv'));
bot.use(createConversation(userAddLoopConversation, 'user-add-loop-conv'));

setLoggerBot(bot);
const { setNotifyBot } = await import('../services/notifyService.js');
setNotifyBot(bot);

// Register dashboard UI components (menus, start command, etc)
registerRichHandlers(bot);

// Inline help handlers (menjawab inline query 'help_ubot' dari userbot .help)
registerInlineHelpHandlers(bot);

// Subscription handlers (manajemen langganan & pembayaran)
registerSubscriptionHandlers(bot);

// Audit handlers (audit log & compliance)
registerAuditHandlers(bot);

// Marketplace handlers (plugin marketplace)
registerMarketplaceHandlers(bot);

// Backup handlers (backup & restore)
registerBackupHandlers(bot);

// Mini App command
bot.command(['app', 'webapp', 'dashboard'], async (ctx) => {
  const appUrl = config.appUrl || 'http://localhost:3000';
  const isHttps = appUrl.startsWith('https://');

  const button = isHttps
    ? { text: '🚀 Buka Mini App Dashboard', web_app: { url: appUrl } }
    : { text: '🌐 Buka Web Dashboard', url: appUrl };

  await ctx.reply(
    '⚡ <b>DeltaUserJS Web Dashboard Mini App</b>\n\n' +
    'Dashboard visual interaktif untuk manajemen userbot Anda:\n' +
    '• 📊 Pantau status live, ping, RAM & FloodGuard\n' +
    '• 🧩 Toggle saklar 58+ plugin on/off instan\n' +
    '• 📢 Broadcast studio dengan chat selector\n' +
    '• 💎 Cek masa aktif & klaim kode voucher promo\n' +
    '• 👑 Pusat kontrol armada (khusus owner)\n\n' +
    'Ketuk tombol di bawah untuk membuka:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[button]],
      },
    }
  );
});

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
      { command: 'app', description: 'Buka Web Dashboard Mini App' },
      { command: 'claim', description: 'Tukar kode voucher promo (/claim <kode>)' },
      { command: 'daftar', description: 'Daftar userbot baru' },
      { command: 'cancel', description: 'Batalkan proses pendaftaran yang aktif' },
      { command: 'health', description: 'Cek status server (owner only)' },
      { command: 'revoke', description: 'Hapus sesi userbot Anda' },
    ]);

    if (config.appUrl && config.appUrl.startsWith('https://')) {
      try {
        await bot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'Dashboard',
            web_app: { url: config.appUrl },
          },
        });
      } catch (_e) { /* empty */ }
    }
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
