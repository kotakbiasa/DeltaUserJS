import { getSystemVar, getUserVar } from '../core/database.js';

let masterBot = null;

export function setLoggerBot(botInstance) {
  masterBot = botInstance;
}

export class Logger {
  static async logSystem(message, level = 'INFO') {
    const prefix = `[${new Date().toISOString()}] [SYSTEM] [${level}]`;
    if (level === 'ERROR' || level === 'WARN') {
      console.error(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    if (!masterBot) return;

    const logChatId = getSystemVar('SYSTEM_LOG_CHAT_ID');
    if (logChatId) {
      try {
        await masterBot.api.sendMessage(logChatId, `⚙️ <b>SYSTEM LOG [${level}]</b>\n<blockquote>${message}</blockquote>`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error(`Failed to send System Log to Telegram:`, err.message);
      }
    }
  }

  static async logUser(telegramId, message, level = 'INFO') {
    const prefix = `[${new Date().toISOString()}] [USER:${telegramId}] [${level}]`;
    if (level === 'ERROR' || level === 'WARN') {
      console.error(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    if (!masterBot) return;

    const logChatId = getUserVar(telegramId, 'LOG_CHAT_ID');
    if (logChatId) {
      try {
        await masterBot.api.sendMessage(logChatId, `🤖 <b>USERBOT LOG [${level}]</b>\n<blockquote>${message}</blockquote>`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error(`Failed to send User Log to Telegram for ${telegramId}:`, err.message);
      }
    }
  }
}
