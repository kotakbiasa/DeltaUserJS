import { getSystemVar, getUserVar } from '../core/database.js';

let masterBot = null;

export function setLoggerBot(botInstance) {
  masterBot = botInstance;
}

export class Logger {
  static getTimestamp() {
    const now = new Date();
    return `\x1b[2m[${now.toLocaleTimeString()}]\x1b[0m`;
  }

  static async logSystem(message, level = 'INFO') {
    const time = Logger.getTimestamp();
    let levelTag = `\x1b[36m[SYSTEM]\x1b[0m`;
    if (level === 'ERROR') {
      levelTag = `\x1b[31m[ERROR]\x1b[0m`;
    } else if (level === 'WARN') {
      levelTag = `\x1b[33m[WARN]\x1b[0m`;
    } else if (level === 'SUCCESS') {
      levelTag = `\x1b[32m[SUCCESS]\x1b[0m`;
    }

    console.log(`${time} ${levelTag} ${message}`);

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
    const time = Logger.getTimestamp();
    let levelTag = `\x1b[34m[USER:${telegramId}]\x1b[0m`;
    if (level === 'ERROR') {
      levelTag = `\x1b[31m[ERROR:${telegramId}]\x1b[0m`;
    } else if (level === 'WARN') {
      levelTag = `\x1b[33m[WARN:${telegramId}]\x1b[0m`;
    } else if (level === 'SUCCESS') {
      levelTag = `\x1b[32m[SUCCESS:${telegramId}]\x1b[0m`;
    }

    console.log(`${time} ${levelTag} ${message}`);

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
