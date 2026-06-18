import config from '../../config.js';
import { addWarn, getWarns, removeWarn, resetWarns } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

const COMMANDS = ['.kick', '.ban', '.unban', '.mute', '.unmute', '.promote', '.demote', '.del', '.purge', '.pin', '.unpin', '.warn', '.warns', '.unwarn', '.resetwarn', '.warnlist'];
const MUTE_AT = 3;
const BAN_AT = 5;

function duration(args, index) {
  const token = args[index]?.toLowerCase();
  const match = token?.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return { seconds: 0, reason: args.slice(index).join(' ') || 'Tidak ada alasan' };
  const value = Number(match[1]);
  const unit = match[2];
  const seconds = unit === 's' ? value : unit === 'm' ? value * 60 : unit === 'h' ? value * 3600 : value * 86400;
  return { seconds, reason: args.slice(index + 1).join(' ') || 'Tidak ada alasan' };
}

function rightsAdmin(enabled) {
  return { _: 'chatAdminRights', changeInfo: enabled,
    postMessages: enabled,
    editMessages: enabled,
    deleteMessages: enabled,
    banUsers: enabled,
    inviteUsers: enabled,
    pinMessages: enabled,
    addAdmins: false,
    anonymous: false,
    manageCall: enabled, };
}

async function fail(message, settings, title, detail = '') {
  await message.edit({ text: block(title, escapeHtml(detail)) + footer(settings), parseMode: 'html' });
}

async function targetOf(client, message, cmd, settings) {
  const replied = message.replyToMessage;
  const noParticipant = ['.del', '.purge', '.pin', '.unpin'].includes(cmd);

  if (replied) {
    if (noParticipant) return { replied, targetId: replied.sender?.id, participant: replied.sender?.id };
    if (!replied.sender?.id) {
      await fail(message, settings, 'Target tidak valid', 'Tidak dapat membaca user ID dari pesan reply.');
      return null;
    }
    let participant = replied.sender?.id;
    try { participant = await replied.getSender(); } catch (_) {}
    return { replied, targetId: replied.sender?.id, participant };
  }

  if (noParticipant) {
    await fail(message, settings, 'Reply dibutuhkan', `Command ${cmd} harus reply pesan target.`);
    return null;
  }

  const input = message.text.trim().split(/\s+/)[1];
  if (!input) {
    await fail(message, settings, 'Target kosong', `Reply user atau gunakan ${code(`${cmd} @username`)}.`);
    return null;
  }

  try {
    const participant = await client.getEntity(input);
    return { replied: null, targetId: participant.id || input, participant };
  } catch (err) {
    await fail(message, settings, 'Target tidak ditemukan', err.message);
    return null;
  }
}

async function editBanned(client, message, participant, bannedRights) {
  return client.call({ _: 'channels.editBanned', channel: message.chat.id, participant, bannedRights });
}

async function editAdmin(client, message, participant, adminRights, rank = '') {
  return client.call({ _: 'channels.editAdmin', channel: message.chat.id, participant, adminRights, rank });
}

async function logAction(client, message, action, targetId, reason = 'Tidak ada alasan') {
  if (!config.logGroupId) return;
  try {
    const chat = await message.getChat();
    const me = await client.getMyUser();
    await client.sendText(config.logGroupId, block('Admin Action Log', `<pre>Action      ${escapeHtml(action)}\nActor       ${escapeHtml(me.id)}\nTarget      ${escapeHtml(targetId)}\nGroup       ${escapeHtml(chat?.title || message.chat.id)}\nReason      ${escapeHtml(reason)}</pre>`), { parseMode: 'html', replyTo: config.logTopicId || undefined });
  } catch (err) {
    console.error('Failed to send admin log:', err.message);
  }
}

function renderWarnList(warns) {
  const entries = Object.entries(warns || {}).filter(([, data]) => Number(data?.count || 0) > 0).slice(0, 20);
  if (!entries.length) return 'Tidak ada warn aktif.';
  return entries.map(([userId, data], i) => `${i + 1}. ${userId} · ${Number(data.count || 0)} warn`).join('\n');
}

function warnReason(message, hasTargetArg) {
  return message.text.trim().split(/\s+/).slice(hasTargetArg ? 2 : 1).join(' ') || 'Tidak ada alasan';
}

async function muteOneHour(client, message, participant) {
  await editBanned(client, message, participant, { _: 'chatBannedRights', untilDate: Math.floor(Date.now() / 1000) + 3600,
    sendMessages: true,
    sendMedia: true,
    sendStickers: true,
    sendGifs: true,
    sendGames: true,
    sendInline: true,
    embedLinks: true, });
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default {
  name: 'admin',
  help: {
    title: 'Admin Tools (.ban, .mute, .purge, .warn)',
    description: 'Moderasi grup: ban, mute, purge, pin, promote, dan sistem warn.',
    usage: 'Reply user/pesan atau gunakan @username: `.ban`, `.mute`, `.warn`, `.del`, `.purge`, `.pin`, dll.',
    detail: '3 warn = mute 1 jam, 5 warn = ban. Durasi mendukung 10s/5m/2h/1d.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;
    const args = message.text.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    if (!COMMANDS.includes(cmd)) return;

    if (message.isPrivate) {
      await fail(message, settings, 'Khusus grup', 'Command admin hanya dapat digunakan di grup/supergroup.');
      return;
    }

    const chatId = String(message.chat.id);

    try {
      if (cmd === '.warnlist') {
        await message.edit({ text: block('Warn List', `<pre>${renderWarnList(getWarns(telegramId, chatId))}</pre>`) + footer(settings), parseMode: 'html' });
        return;
      }

      if (['.warn', '.warns', '.unwarn', '.resetwarn'].includes(cmd)) {
        const target = await targetOf(client, message, cmd, settings);
        if (!target) return;
        const targetId = target.targetId;
        const reason = warnReason(message, !target.replied && Boolean(args[1]));

        if (cmd === '.warn') {
          const info = await addWarn(telegramId, chatId, targetId, reason);
          let action = 'Tidak ada';
          if (info.count >= BAN_AT) {
            await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate: 0, viewMessages: true });
            action = 'ban';
          } else if (info.count >= MUTE_AT) {
            await muteOneHour(client, message, target.participant);
            action = 'mute 1 jam';
          }
          await logAction(client, message, 'warn', targetId, reason);
          await message.edit({ text: block('Warn diberikan', `<pre>Target      ${escapeHtml(targetId)}\nWarn        ${Number(info.count || 0)}/${BAN_AT}\nAction      ${action}\nReason      ${escapeHtml(reason)}</pre>`) + footer(settings), parseMode: 'html' });
          return;
        }

        if (cmd === '.warns') {
          const info = getWarns(telegramId, chatId, targetId);
          const reasons = (info.reasons || []).slice(-5).map((item, i) => `${i + 1}. ${escapeHtml(item.reason)} ${item.at || ''}`).join('\n') || 'Belum ada alasan tersimpan.';
          await message.edit({ text: block('Warn Info', `<pre>Target      ${escapeHtml(targetId)}\nWarn        ${Number(info.count || 0)}</pre>\n${reasons}`) + footer(settings), parseMode: 'html' });
          return;
        }

        if (cmd === '.unwarn') {
          const info = await removeWarn(telegramId, chatId, targetId);
          await message.edit({ text: block('Warn dikurangi', `<pre>Target      ${escapeHtml(targetId)}\nSisa        ${Number(info?.count || 0)}</pre>`) + footer(settings), parseMode: 'html' });
          return;
        }

        await resetWarns(telegramId, chatId, targetId);
        await message.edit({ text: block('Warn direset', `Target: ${code(targetId)}`) + footer(settings), parseMode: 'html' });
        return;
      }

      if (['.kick', '.ban', '.unban', '.mute', '.unmute', '.promote', '.demote'].includes(cmd)) {
        const target = await targetOf(client, message, cmd, settings);
        if (!target) return;
        const hasTargetArg = !target.replied && Boolean(args[1]);
        const { seconds, reason } = duration(args, hasTargetArg ? 2 : 1);
        const untilDate = seconds > 0 ? Math.floor(Date.now() / 1000) + seconds : 0;
        let result = '';

        if (cmd === '.kick') {
          await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate: 0, viewMessages: true });
          await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate: 0, viewMessages: false, sendMessages: false });
          result = 'kick';
        }
        if (cmd === '.ban') {
          await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate, viewMessages: true });
          result = seconds ? `ban ${seconds}s` : 'ban';
        }
        if (cmd === '.unban') {
          await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate: 0, viewMessages: false, sendMessages: false, sendMedia: false, sendStickers: false, sendGifs: false, sendGames: false, sendInline: false, embedLinks: false });
          result = 'unban';
        }
        if (cmd === '.mute') {
          await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate, sendMessages: true });
          result = seconds ? `mute ${seconds}s` : 'mute';
        }
        if (cmd === '.unmute') {
          await editBanned(client, message, target.participant, { _: 'chatBannedRights', untilDate: 0, sendMessages: false });
          result = 'unmute';
        }
        if (cmd === '.promote') {
          await editAdmin(client, message, target.participant, rightsAdmin(true), 'Admin');
          result = 'promote';
        }
        if (cmd === '.demote') {
          await editAdmin(client, message, target.participant, rightsAdmin(false));
          result = 'demote';
        }

        await logAction(client, message, result, target.targetId, reason);
        await message.edit({ text: block('Admin action', `<pre>Action      ${escapeHtml(result)}\nTarget      ${escapeHtml(target.targetId)}\nReason      ${escapeHtml(reason)}</pre>`) + footer(settings), parseMode: 'html' });
        return;
      }

      const target = await targetOf(client, message, cmd, settings);
      if (!target) return;

      if (cmd === '.del') {
        await client.deleteMessages(message.chat.id, [target.replied.id, message.id], { revoke: true });
        return;
      }

      if (cmd === '.purge') {
        const start = Math.min(target.replied.id, message.id);
        const end = Math.max(target.replied.id, message.id);
        
        let idsToDelete = [];
        const isTopic = Boolean(message.threadId);
        
        if (isTopic) {
          await message.edit({ text: block('Purge', `Menganalisa pesan di dalam topik...`) + footer(settings), parseMode: 'html' });
          const topicId = message.threadId;
          const msgs = await client.getHistory(message.chat.id, { threadId: topicId, limit: 1000 });
          idsToDelete = msgs.map(m => m.id).filter(id => id >= start && id <= end);
        } else {
          const total = end - start + 1;
          if (total > 1000) {
            await fail(message, settings, 'Purge terlalu besar', `Range ${total} pesan, maksimal 1000.`);
            return;
          }
          await message.edit({ text: block('Purge', `Membersihkan pesan...`) + footer(settings), parseMode: 'html' });
          idsToDelete = Array.from({ length: total }, (_, i) => start + i);
        }

        if (idsToDelete.length === 0) return;
        if (!idsToDelete.includes(message.id)) idsToDelete.push(message.id);
        
        for (const part of chunks(idsToDelete, 100)) await client.deleteMessages(message.chat.id, part, { revoke: true });
        const done = await client.sendText(message.chat.id, block('Purge selesai', `<pre>Terhapus    ${idsToDelete.length}</pre>`) + footer(settings), { parseMode: 'html', replyTo: message.id });
        await logAction(client, message, 'purge', target.replied.id, `${idsToDelete.length} pesan`);
        setTimeout(() => done.delete({ revoke: true }).catch(() => {}), 3000);
        return;
      }

      await client.call({ _: 'messages.updatePinnedMessage', silent: false, peer: message.chat.id, id: target.replied.id, unpin: cmd === '.unpin' });
      await message.edit({ text: block('Pinned Message', cmd === '.pin' ? 'Pesan berhasil disematkan.' : 'Sematan pesan berhasil dilepas.') + footer(settings), parseMode: 'html' });
    } catch (err) {
      console.error(`Error in admin plugin (${cmd}):`, err.message);
      await fail(message, settings, `Gagal ${cmd}`, `${err.message}\nPastikan akun memiliki hak admin yang cukup.`);
    }
  },
};
