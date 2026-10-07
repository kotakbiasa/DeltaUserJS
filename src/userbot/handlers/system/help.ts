import { helpRegistry } from '../../engine/pluginRegistry.js';
import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { getUserbotSession } from '../../../services/UserbotService.js';
import config from '../../../config.js';
import { buildModuleHtml } from '../../../bot/handlers/inlineHelp.js';
import { getMasterBotUsername } from '../../../bot/state/botUsername.js';
import { errorMessage } from '../../../utils/errors.js';
import { toPeer } from '../../engine/compatClient.js';
import { randomLong } from '@mtcute/core/utils.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';

/**
 * Bangun InputReplyToMessage untuk forum topic — memastikan pesan bot
 * masuk ke topic yang sama dengan .help, bukan main topic.
 */
function buildReplyToTopic(message: any) {
  try {
    const header = message.replyTo;
    if (header) {
      const topId = header.replyToTopId || header.replyToMsgId;
      const replyToMsgId = header.replyToMsgId || message.id;
      if (topId) {
        return {
          _: 'inputReplyToMessage' as const,
          replyToMsgId,
          topMsgId: topId,
        };
      }
    }

    const peerClassName = message.peerId?.className;
    if ((peerClassName === 'PeerChannel' || message.isChannel || message.isGroup) && message.message) {
      const msgId = message.id;
      return {
        _: 'inputReplyToMessage' as const,
        replyToMsgId: msgId,
        topMsgId: msgId,
      };
    }
    return undefined;
  } catch (_e) {
    return undefined;
  }
}

function formatModuleName(name: string): string {
  if (name.toLowerCase() === 'antipm') return 'AntiPM';
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function stripHtml(text: unknown): string {
  return String(text ?? '').replace(/<[^>]+>/g, '');
}

function markdownToHtml(text: string): string {
  if (!text) return '';
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

function getModuleNames(): string[] {
  return Object.keys(helpRegistry).sort();
}

function buildMenuText(): string {
  const names = getModuleNames();
  const moduleList = names
    .map((name, i) => {
      const mod = helpRegistry[name];
      const num = i + 1;
      const title = mod?.title || formatModuleName(name);
      const desc = mod ? stripHtml(mod.description ?? '').slice(0, 60) : '';
      return `<b>${num}.</b> <code>${escapeHtml(name)}</code> — ${escapeHtml(title)}${desc ? `\n    <i>${escapeHtml(desc)}…</i>` : ''}`;
    })
    .join('\n\n');

  return (
    `📖 <b>HELP MENU — DAFTAR MODUL AKTIF</b>\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
    `📦 <b>Total Modul:</b> ${names.length}\n\n` +
    `${moduleList || '<i>Tidak ada modul terdaftar</i>'}\n\n` +
    `💡 <b>Petunjuk:</b> ketik <code>.help [nama_modul]</code> untuk detail, atau ketik <code>.plugins</code> untuk modul terpasang.`
  );
}

function buildModuleDetail(moduleName: string): string | null {
  const mod = helpRegistry[moduleName];
  if (!mod) return null;

  return (
    `📦 <b>MODUL: ${escapeHtml(mod.title?.toUpperCase() || formatModuleName(moduleName).toUpperCase())}</b>\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
    `📝 <b>Deskripsi:</b>\n` +
    `<blockquote>${markdownToHtml(mod.description ?? '')}</blockquote>\n\n` +
    `🚀 <b>Penggunaan:</b>\n` +
    `<blockquote>${markdownToHtml(mod.usage ?? '')}</blockquote>` +
    (mod.detail ? `\n\n💡 <b>Detail Tambahan:</b>\n<blockquote>${markdownToHtml(mod.detail ?? '')}</blockquote>` : '')
  );
}

export default {
  name: 'help',
  commands: ['help'],
  help: {
    title: 'Help Menu (.help)',
    description: 'Menampilkan panduan penggunaan dan daftar modul yang tersedia di userbot Anda.',
    usage: 'Ketik `.help` untuk menu utama atau `.help [nama_modul]` untuk detail spesifik.',
    detail: 'Menu help interaktif ditampilkan oleh Master Bot dengan tombol yang bisa diklik (navigasi halaman, detail modul, tutup).'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, _settings: UserbotSettings, telegramId: number) {
    if (!message.out || !message.message) return;
    if (!message.message.toLowerCase().startsWith('.help')) return;

    try {
      const parts = message.message.trim().split(/\s+/);
      const moduleArg = parts.length > 1 ? parts[1].toLowerCase() : '';
      const session = getUserbotSession(telegramId);
      const masterBotUsername = getMasterBotUsername() || 'PanelDeltaUbot';
      const query = moduleArg || 'help';

      try {
        const resolved: any = await (client as any).call({
          _: 'contacts.resolveUsername',
          username: masterBotUsername,
        });

        const resolvedPeer = resolved.peer;
        const botUser = (resolved.users || []).find(
          (u: any) => u._ === 'user' && String(u.id) === String(resolvedPeer.userId)
        );

        if (botUser) {
          const botPeer = {
            _: 'inputUser' as const,
            userId: botUser.id,
            accessHash: botUser.accessHash ?? 0n,
          };

          const botResults: any = await (client as any).call({
            _: 'messages.getInlineBotResults',
            bot: botPeer,
            peer: { _: 'inputPeerSelf' },
            query: query,
            offset: '',
          });

          const results = botResults.results || [];
          if (results.length > 0) {
            const queryId = botResults.queryId;
            const replyTo = buildReplyToTopic(message);
            const targetPeer = await (client as any).resolvePeer(toPeer(message.peerId || message.chatId));

            await (client as any).call({
              _: 'messages.sendInlineBotResult',
              peer: targetPeer,
              queryId: queryId,
              id: String(results[0].id),
              hideVia: true,
              replyTo,
              randomId: randomLong(),
            });

            await message.delete?.().catch(() => {});
            return;
          }
        }
      } catch (mtpErr) {
        Logger.logUser(telegramId, `[HELP] MTProto inline fallback: ${errorMessage(mtpErr)}`, 'WARN');
      }

      // Fallback Teks langsung jika inline query tidak aktif
      if (moduleArg) {
        const targetModule = helpRegistry[moduleArg];
        if (targetModule) {
          await message.edit({ text: buildModuleDetail(moduleArg) ?? '', parseMode: 'html' });
        } else {
          const available = Object.keys(helpRegistry).join(', ');
          const safeName = escapeHtml(parts[1] ?? moduleArg);
          const errText = `❌ <b>Modul "${safeName}" tidak ditemukan.</b>\n\n<blockquote>Modul tersedia: <code>${escapeHtml(available)}</code></blockquote>`;
          await message.edit({ text: errText, parseMode: 'html' });
        }
        return;
      }

      const text = buildMenuText();
      await message.edit({ text, parseMode: 'html' });
    } catch (err) {
      Logger.logUser(telegramId, `Error in help plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      try {
        await message.edit({
          text: `❌ <b>Error menampilkan help:</b>\n<code>${escapeHtml(err instanceof Error ? err.message : String(err))}</code>`,
          parseMode: 'html',
        });
      } catch (_e) {}
    }
  },

  async onCallbackQuery(_client: any, callbackEvent: any, _settings: any, _telegramId: number) {
    try {
      const data = callbackEvent.data?.toString() || '';
      if (!data.startsWith('help:')) return false;

      const parts = data.split(':');
      const action = parts[1];

      if (typeof callbackEvent.editMessage !== 'function') return false;
      const editMessage = callbackEvent.editMessage;

      if (action === 'close') {
        await editMessage('Menu help ditutup.', { parseMode: 'html' });
        return true;
      }

      const moduleName = action;
      const html = buildModuleHtml(moduleName, 'ubot');
      await editMessage(html, { parseMode: 'html' });
      return true;
    } catch (err) {
      return false;
    }
  },
};
