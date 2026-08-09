/**
 * Inline Bot Help Service
 *
 * Bot kedua (INLINE_BOT_TOKEN) yang dipakai untuk menampilkan menu help
 * DENGAN TOMBOL di chat userbot. Karena pesan dikirim via Bot API
 * (akun bot), inline keyboard render normal — tidak seperti userbot
 * yang tidak bisa menampilkan tombol.
 *
 * Setiap user yang punya INLINE_BOT_TOKEN mendapat satu instance bot
 * yang polling callback query help (navigasi halaman, detail modul).
 */
import { Bot } from 'grammy';
import { Logger } from '../../utils/logger.js';
import {
  buildHelpMenuHtml,
  buildModuleHtml,
  helpKeyboard,
} from '../handlers/inlineHelp.js';

export interface InlineBotEntry {
  bot: Bot;
  token: string;
  username?: string;
}

/** Map telegramId -> inline bot instance */
const inlineBots = new Map<number, InlineBotEntry>();

/** Validate token via getMe */
export async function validateInlineBot(token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok && data.result?.username) {
      return data.result.username;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Kirim menu help + tombol ke chat userbot via Bot API (inline bot).
 * Dipanggil dari plugin .help userbot.
 */
export async function sendHelpMenuViaInlineBot(
  token: string,
  chatId: number | string,
  page = 1,
  moduleArg = '',
): Promise<boolean> {
  try {
    const html = moduleArg ? buildModuleHtml(moduleArg, 'ubot') : buildHelpMenuHtml(page, 'ubot');
    const keyboard = moduleArg
      ? { inline_keyboard: [
          [{ text: '🔙 Kembali', callback_data: 'help:page:1:ubot' }],
          [{ text: '✖️ Tutup', callback_data: 'help:close' }],
        ] }
      : helpKeyboard(page, 'ubot');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.log(`[INLINE-HELP-DEBUG] sendMessage gagal: ${JSON.stringify(data).slice(0, 300)} (chatId=${chatId}, page=${page}, module=${moduleArg})`);
    }
    return !!data.ok;
  } catch (_e) {
    return false;
  }
}

/** Register one inline bot for a user (start polling for help callbacks) */
export async function startInlineBotForUser(telegramId: number, token: string): Promise<InlineBotEntry | null> {
  // Hapus instance lama jika ada
  await stopInlineBotForUser(telegramId);

  if (!token) {return null;}

  try {
    const bot = new Bot(token);
    const entry: InlineBotEntry = { bot, token };
    inlineBots.set(telegramId, entry);

    // Callback handlers — sama seperti master bot tapi via bot ini
    bot.callbackQuery(/^help:page:(\d+)(?::(.+))?$/, async (ctx) => {
      const page = Number(ctx.match[1]);
      const target = ctx.match[2] || 'ubot';
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.editMessageText(buildHelpMenuHtml(page, target), {
        parse_mode: 'HTML',
        reply_markup: helpKeyboard(page, target),
      }).catch((_e) => {});
    });

    bot.callbackQuery(/^help:module:([^:]+)(?::(.+))?$/, async (ctx) => {
      const moduleName = ctx.match[1];
      const target = ctx.match[2] || 'ubot';
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.editMessageText(buildModuleHtml(moduleName, target), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [
          [{ text: '🔙 Kembali', callback_data: `help:page:1:${target}` }],
          [{ text: '✖️ Tutup', callback_data: 'help:close' }],
        ] },
      }).catch((_e) => {});
    });

    bot.callbackQuery('help:noop', async (ctx) => {
      await ctx.answerCallbackQuery().catch(() => {});
    });

    bot.callbackQuery('help:close', async (ctx) => {
      await ctx.answerCallbackQuery('Menu ditutup').catch(() => {});
      try { await ctx.deleteMessage(); } catch (_e) { /* ignore */ }
    });

    // Polling start (non-blocking)
    bot.start({ onStart: () => {
      Logger.logSystem(`Inline Bot [${telegramId}] started polling (help menu).`);
    } }).catch((err) => {
      Logger.logSystem(`Inline Bot [${telegramId}] polling error: ${err.message}`, 'ERROR');
    });

    // Ambil username (async, non-blocking)
    validateInlineBot(token).then((username) => {
      if (username) {entry.username = username;}
    }).catch(() => {});

    return entry;
  } catch (err) {
    Logger.logSystem(`Failed to start inline bot for ${telegramId}: ${err.message}`, 'ERROR');
    return null;
  }
}

/** Stop polling for a user's inline bot */
export async function stopInlineBotForUser(telegramId: number): Promise<void> {
  const entry = inlineBots.get(telegramId);
  if (entry) {
    try { await entry.bot.stop(); } catch (_e) { /* ignore */ }
    inlineBots.delete(telegramId);
  }
}

/** Stop all inline bots */
export async function stopAllInlineBots(): Promise<void> {
  for (const id of Array.from(inlineBots.keys())) {
    await stopInlineBotForUser(id);
  }
}

/** Get an inline bot entry */
export function getInlineBot(telegramId: number): InlineBotEntry | null {
  return inlineBots.get(telegramId) || null;
}
