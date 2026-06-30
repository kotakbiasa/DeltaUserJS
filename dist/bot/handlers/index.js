import { registerLegacyCallbacks } from './callbacks.js';
import { registerOwnerHandlers } from './owner.js';
export function registerAllHandlers(bot) {
    registerLegacyCallbacks(bot);
    registerOwnerHandlers(bot);
}
