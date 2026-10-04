import { registerLegacyCallbacks } from './callbacks.js';
import { registerOwnerHandlers } from './owner.js';
import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';

export function registerAllHandlers(bot: Bot<BotContext>) {
  registerLegacyCallbacks(bot);
  registerOwnerHandlers(bot);
}
