/**
 * Master bot username state — replaces global.MASTER_BOT_USERNAME.
 *
 * Set once on bot startup from getMe(), read by any handler that needs
 * the bot's @username (e.g. inline help, deep links).
 */
let masterBotUsername: string | null = null;

export function setMasterBotUsername(username: string): void {
  masterBotUsername = username;
}

export function getMasterBotUsername(): string | null {
  return masterBotUsername;
}
