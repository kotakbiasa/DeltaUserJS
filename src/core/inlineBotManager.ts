// @ts-nocheck
import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';

import { registerInlineHelpHandlers, registerInlineLatexHandlers } from '../bot/handlers/core/help.js';
import { registerInlineAntiPmHandlers } from '../bot/handlers/core/antiPm.js';
import { registerInlineAnilistHandlers } from '../bot/handlers/core/anilist.js';

class InlineBotManager {
  constructor() {
    this.activeBots = new Map();
  }

  async startInlineBot(telegramId, token) {
    const id = Number(telegramId);
    if (!token) return false;

    if (this.activeBots.has(id)) {
      await this.stopInlineBot(id);
    }

    const bot = new Bot(token);
    bot.use(session({ initial: () => ({}) }));
    bot.use(conversations());

    registerInlineHelpHandlers(bot);
    registerInlineAntiPmHandlers(bot);
    registerInlineLatexHandlers(bot);

    bot.command(['start', 'menu', 'settings'], async (ctx) => {
      if (Number(ctx.from.id) !== id) {
        await ctx.reply('Halo, saya bot inline pribadi DeltaUserJS.');
        return;
      }
      await ctx.reply('⚙️ Pengaturan userbot ada di dashboard bot utama.');
    });

    bot.catch((err) => {
      const message = err.error?.description || err.error?.message || err.message || '';
      if (message.includes('message is not modified')) return;
      if (message.includes('session key is undefined')) return;
      console.error(`Custom inline bot error [${id}]:`, message);
    });

    this.activeBots.set(id, bot);
    bot.start({
      onStart: info => console.log(`✅ Custom Inline Bot started for [${id}] as @${info.username}`),
    }).catch(err => {
      console.error(`Custom Inline Bot polling error [${id}]:`, err.message || err);
      this.activeBots.delete(id);
    });

    return true;
  }

  async stopInlineBot(telegramId) {
    const id = Number(telegramId);
    const bot = this.activeBots.get(id);
    if (!bot) return false;

    try {
      await bot.stop();
      console.log(`🔌 Custom Inline Bot stopped for [${id}].`);
    } catch (err) {
      console.error(`Failed to stop custom inline bot [${id}]:`, err.message || err);
    } finally {
      this.activeBots.delete(id);
    }
    return true;
  }

  async stopAll() {
    await Promise.all([...this.activeBots.keys()].map(id => this.stopInlineBot(id)));
  }
}

const inlineBotManager = new InlineBotManager();
export default inlineBotManager;
