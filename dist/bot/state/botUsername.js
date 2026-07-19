/**
 * Master bot username state — replaces global.MASTER_BOT_USERNAME.
 *
 * Set once on bot startup from getMe(), read by any handler that needs
 * the bot's @username (e.g. inline help, deep links).
 */
let masterBotUsername = null;
export function setMasterBotUsername(username) {
    masterBotUsername = username;
}
export function getMasterBotUsername() {
    return masterBotUsername;
}
