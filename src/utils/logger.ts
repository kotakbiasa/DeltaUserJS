import { getSystemVar, getUserVar } from '../infrastructure/database.js';
import config from '../config.js';

let masterBot = null;

export function setLoggerBot(botInstance) {
  masterBot = botInstance;
}

/** Log level enum */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

/** Structured log entry */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  telegramId?: number;
  metadata?: Record<string, unknown>;
}

export class Logger {
  static getTimestamp() {
    const now = new Date();
    return `\x1b[2m[${now.toLocaleTimeString()}]\x1b[0m`;
  }

  static getISOTime() {
    return new Date().toISOString();
  }

  /** Format structured log as JSON line */
  static toJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  /** Format for console with ANSI colors */
  static toConsole(entry: LogEntry): string {
    const time = entry.timestamp;
    let levelTag = `\x1b[36m[${entry.level}]\x1b[0m`;
    if (entry.level === LogLevel.ERROR) {levelTag = `\x1b[31m[${entry.level}]\x1b[0m`;}
    else if (entry.level === LogLevel.WARN) {levelTag = `\x1b[33m[${entry.level}]\x1b[0m`;}
    else if (entry.level === LogLevel.SUCCESS) {levelTag = `\x1b[32m[${entry.level}]\x1b[0m`;}
    else if (entry.level === LogLevel.DEBUG) {levelTag = `\x1b[35m[${entry.level}]\x1b[0m`;}

    const componentTag = entry.telegramId
      ? `\x1b[34m[${entry.component}:${entry.telegramId}]\x1b[0m`
      : `\x1b[36m[${entry.component}]\x1b[0m`;

    const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    return `${time} ${levelTag} ${componentTag} ${entry.message}${meta}`;
  }

  /** Core logging method with structured output */
  static async log(
    component: string,
    message: string,
    level: LogLevel = LogLevel.INFO,
    telegramId?: number,
    metadata?: Record<string, unknown>
  ) {
    const entry: LogEntry = {
      timestamp: Logger.getISOTime(),
      level,
      component,
      message,
      telegramId,
      metadata,
    };

    // Console output (colorized)
    console.log(Logger.toConsole(entry));

    // Optional: JSON stdout for log aggregation (Loki, ELK, etc.)
    if (process.env.LOG_JSON === 'true') {
      console.log(Logger.toJson(entry));
    }

    // Send to Telegram if bot available
    if (!masterBot) {return;}

    try {
      const logChatId = telegramId
        ? getUserVar(telegramId, 'LOG_CHAT_ID')
        : config.logGroupId || getSystemVar('SYSTEM_LOG_CHAT_ID');

      if (logChatId) {
        const extraParams: { parse_mode: string; message_thread_id?: number } = {
          parse_mode: 'HTML',
        };
        if (config.logGroupId && config.logTopicId && !telegramId) {
          extraParams.message_thread_id = config.logTopicId;
        }

        const title = telegramId
          ? `🤖 <b>USERBOT LOG [${level}]</b>`
          : `⚙️ <b>SYSTEM LOG [${level}]</b>`;

        await masterBot.api.sendMessage(
          logChatId,
          `${title}\n<blockquote>${message}</blockquote>`,
          extraParams
        );
      }
    } catch (_err) {
      // Ignore Telegram send failures
    }
  }

  // Backward compatible methods
  static async logSystem(message: string, level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS' = 'INFO') {
    await Logger.log('SYSTEM', message, level as LogLevel);
  }

  static async logUser(
    telegramId: number,
    message: string,
    level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS' = 'INFO'
  ) {
    await Logger.log('USERBOT', message, level as LogLevel, telegramId);
  }
}
