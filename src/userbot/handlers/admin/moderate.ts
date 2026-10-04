import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// Moderate: moderasi grup lengkap. Konsep diadaptasi dari getter admintools.py
// (kastaid/getter) ke pola plugin DeltaUserJS — bukan salinan mentah.
// Semua command owner-only (message.out), diproses via message.edit, dan hanya
// jalan di grup (chat.className Channel/Chat). Target user: reply ATAU
// username/ID. Durasi .mute: 30m/1h/1d (parse manual, max 7 hari) via
// ChatBannedRights.untilDate. .lock/.unlock via default banned rights grup.

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

const COMMANDS = ['kick', 'ban', 'unban', 'mute', 'unmute', 'promote', 'demote', 'lock', 'unlock'];

const LOCK_LABELS: Record<string, string> = {
  all: 'semua pesan',
  media: 'media',
  links: 'link'
};

// Flag yang disentuh per mode lock/unlock (raw TL: flag true = hak diblokir).
const LOCK_TARGETS: Record<string, string[]> = {
  all: ['sendMessages', 'sendMedia', 'embedLinks'],
  media: ['sendMedia'],
  links: ['embedLinks']
};

interface Duration {
  ms: number;
  label: string;
}

interface Target {
  id: number;
  name: string;
  entity?: any;
}

interface ResolvedTarget {
  target?: Target;
  reason: string;
  error?: string;
}

// Satu token durasi "30m" / "1h30m" -> ms, atau null jika format salah / 0 / > 7 hari.
function parseDuration(token: string): number | null {
  const cleaned = token.toLowerCase().replace(/\s+/g, '');
  if (!/^\d+[smhd](\d+[smhd])*$/.test(cleaned)) {
    return null;
  }
  const chunks = cleaned.match(/\d+[smhd]/g) || [];
  let ms = 0;
  for (const chunk of chunks) {
    const value = Number(chunk.slice(0, -1));
    const unit = chunk.slice(-1);
    ms += value * UNIT_MS[unit];
  }
  if (ms <= 0 || ms > MAX_DURATION_MS) {
    return null;
  }
  return ms;
}

// Ambil durasi opsional dari awal argumen (.mute 1h 30m alasan). Token durasi
// berurutan di awal dijumlahkan; sisanya jadi target/alasan.
function extractDuration(args: string): { duration: Duration | null; rest: string; invalid: boolean } {
  const parts = args.split(/\s+/).filter(Boolean);
  const looksLikeDuration = (s: string) => /^\d+[smhd](\d+[smhd])*$/.test(s.toLowerCase());
  if (parts.length === 0 || !looksLikeDuration(parts[0])) {
    return { duration: null, rest: args, invalid: false };
  }
  const consumed: string[] = [];
  let ms = 0;
  for (const part of parts) {
    const parsed = parseDuration(part);
    if (parsed === null) {break;}
    ms += parsed;
    consumed.push(part.toLowerCase());
  }
  const rest = parts.slice(consumed.length).join(' ');
  if (consumed.length === 0 || ms > MAX_DURATION_MS) {
    return { duration: null, rest, invalid: true };
  }
  return { duration: { ms, label: consumed.join(' ') }, rest, invalid: false };
}

// Mention HTML tg://user dengan nama yang di-escape dan dipotong.
function mention(target: Target): string {
  const short = target.name.length > 24 ? `${target.name.slice(0, 24)}…` : target.name;
  return `<a href="tg://user?id=${target.id}">${escapeHtml(short)}</a>`;
}

function reasonSuffix(reason: string): string {
  return reason !== '' ? `\n<b>Alasan</b>: <i>${escapeHtml(reason)}</i>` : '';
}

// Target user: reply ke pesan user, atau token pertama args = @username /
// username / link t.me / ID numerik. Token sisanya jadi alasan.
async function resolveTarget(client, message, args): Promise<ResolvedTarget> {
  let token = '';
  let reason = args;
  if (args !== '') {
    const parts = args.split(/\s+/).filter(Boolean);
    token = parts[0] || '';
    reason = parts.slice(1).join(' ').trim();
  }

  const replied = await message.getReplyMessage();
  if (replied && replied.senderId) {
    let name = `User ${replied.senderId}`;
    let entity;
    try {
      const sender = await replied.getSender();
      if (sender) {
        entity = sender;
        name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.title || name;
      }
    } catch (_e) { /* pengirim anonim: pakai fallback */ }
    return { target: { id: Number(replied.senderId), name, entity }, reason };
  }

  if (token !== '') {
    const lookup = token.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
    let entity;
    try {
      entity = await client.getEntity(/^\d+$/.test(lookup) ? Number(lookup) : lookup);
    } catch (_e) { entity = undefined; }
    if (entity) {
      const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.title || lookup;
      return { target: { id: Number(entity.id), name, entity }, reason };
    }
    if (/^\d+$/.test(lookup)) {
      // ID numerik di luar cache tetap dicoba (cukup untuk operasi admin di chat ini)
      return { target: { id: Number(lookup), name: `User ${lookup}` }, reason };
    }
    return { reason, error: `Tidak bisa menemukan user <code>${escapeHtml(token)}</code>` };
  }

  return { reason, error: 'Balas pesan user, atau tulis username/ID-nya' };
}

async function handleMember(client, message, chat, isChannel, cmd, args, telegramId) {
  let duration: Duration | null = null;
  let targetArgs = args;
  if (cmd === 'mute') {
    const extracted = extractDuration(args);
    if (extracted.invalid) {
      await message.edit({
        text: '<blockquote>❌ <b>Durasi tidak valid atau melebihi 7 hari.</b> Format: <code>30m</code>, <code>1h</code>, <code>1d</code> — boleh digabung, mis. <code>1h30m</code>.</blockquote>',
        parseMode: 'html'
      });
      return;
    }
    duration = extracted.duration;
    targetArgs = extracted.rest;
  }

  const resolved = await resolveTarget(client, message, targetArgs);
  if (resolved.error || !resolved.target) {
    await message.edit({
      text: `<blockquote>❌ <b>${escapeHtml(resolved.error || 'Target tidak ditemukan')}.</b></blockquote>`,
      parseMode: 'html'
    });
    return;
  }
  const target = resolved.target;
  if (String(target.id) === String(telegramId)) {
    await message.edit({
      text: '<blockquote>❌ <b>Tidak bisa memoderasi diri sendiri.</b></blockquote>',
      parseMode: 'html'
    });
    return;
  }
  const participant = target.entity ?? target.id;

  const chatId = chat.id || chat;

  // Grup biasa (basic group): hanya kick yang didukung API-nya.
  if (!isChannel) {
    if (cmd === 'kick') {
      if (typeof client.kickChatMember === 'function') {
        await client.kickChatMember(chatId, participant);
      } else if (typeof client.call === 'function') {
        await client.call({ _: 'messages.deleteChatUser', chatId: chat.id, userId: participant });
      } else if (typeof client.invoke === 'function') {
        await client.invoke({ _: 'messages.deleteChatUser', chatId: chat.id, userId: participant });
      }
      await message.edit({
        text: `<blockquote>👢 ${mention(target)} <b>dikeluarkan dari grup.</b>${reasonSuffix(resolved.reason)}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
    if (cmd === 'unban' || cmd === 'unmute') {
      await message.edit({
        text: `<blockquote>ℹ️ Grup biasa tidak menyimpan status ban/mute — ${mention(target)} dianggap bersih.</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
    await message.edit({
      text: '<blockquote>❌ <b>Ban/mute hanya didukung di supergroup. Di grup biasa gunakan .kick.</b></blockquote>',
      parseMode: 'html'
    });
    return;
  }

  switch (cmd) {
    case 'kick': {
      if (typeof client.kickChatMember === 'function') {
        await client.kickChatMember(chatId, participant);
      } else if (typeof client.call === 'function') {
        await client.call({
          _: 'channels.editBanned',
          channel: chatId,
          participant,
          bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: true },
        }).catch(() => {});
        await client.call({
          _: 'channels.editBanned',
          channel: chatId,
          participant,
          bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: false, sendMessages: false },
        });
      }
      await message.edit({
        text: `<blockquote>👢 ${mention(target)} <b>dikeluarkan (kick).</b>${reasonSuffix(resolved.reason)}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
    case 'ban': {
      if (typeof client.banChatMember === 'function') {
        await client.banChatMember(chatId, participant);
      } else if (typeof client.call === 'function') {
        await client.call({
          _: 'channels.editBanned',
          channel: chatId,
          participant,
          bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: true },
        });
      }
      await message.edit({
        text: `<blockquote>🔨 ${mention(target)} <b>diban permanen.</b>${reasonSuffix(resolved.reason)}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
    case 'unban': {
      if (typeof client.unbanChatMember === 'function') {
        await client.unbanChatMember(chatId, participant);
      } else if (typeof client.call === 'function') {
        await client.call({
          _: 'channels.editBanned',
          channel: chatId,
          participant,
          bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: false, sendMessages: false },
        });
      }
      await message.edit({
        text: `<blockquote>🔓 ${mention(target)} <b>unban — bisa masuk lagi.</b>${reasonSuffix(resolved.reason)}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
    case 'mute': {
      const untilDate = duration ? Math.floor((Date.now() + duration.ms) / 1000) : 0;
      if (typeof client.restrictChatMember === 'function') {
        await client.restrictChatMember(chatId, participant, {
          restrictions: { sendMessages: false },
          untilDate,
        });
      } else if (typeof client.call === 'function') {
        await client.call({
          _: 'channels.editBanned',
          channel: chatId,
          participant,
          bannedRights: { _: 'chatBannedRights', untilDate, sendMessages: true },
        });
      }
      const durText = duration ? `\n<b>Durasi</b>: ${duration.label}` : '';
      await message.edit({
        text: `<blockquote>🔇 ${mention(target)} <b>dimute.</b>${durText}${reasonSuffix(resolved.reason)}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
    default: {
      if (typeof client.restrictChatMember === 'function') {
        await client.restrictChatMember(chatId, participant, {
          restrictions: { sendMessages: true },
        });
      } else if (typeof client.call === 'function') {
        await client.call({
          _: 'channels.editBanned',
          channel: chatId,
          participant,
          bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: true },
        });
      }
      await message.edit({
        text: `<blockquote>🔊 ${mention(target)} <b>unmute — bisa chat lagi.</b>${reasonSuffix(resolved.reason)}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
}

async function handleRole(client, message, chat, isChannel, cmd, args, telegramId) {
  const resolved = await resolveTarget(client, message, args);
  if (resolved.error || !resolved.target) {
    await message.edit({
      text: `<blockquote>❌ <b>${escapeHtml(resolved.error || 'Target tidak ditemukan')}.</b></blockquote>`,
      parseMode: 'html'
    });
    return;
  }
  const target = resolved.target;
  if (String(target.id) === String(telegramId)) {
    await message.edit({
      text: '<blockquote>❌ <b>Tidak bisa memoderasi diri sendiri.</b></blockquote>',
      parseMode: 'html'
    });
    return;
  }
  const participant = target.entity ?? target.id;

  const isPromote = cmd === 'promote';
  const isBroadcast = isChannel && !chat.megagroup;
  const title = isPromote ? (resolved.reason.slice(0, 16) || 'Admin') : '';

  if (typeof client.setChatAdminRights === 'function') {
    await client.setChatAdminRights(chat.id || chat, participant, {
      rights: isPromote ? {
        changeInfo: false,
        postMessages: isBroadcast,
        editMessages: isBroadcast,
        deleteMessages: true,
        banUsers: true,
        inviteUsers: true,
        pinMessages: false,
        addAdmins: false,
        anonymous: false,
        manageCall: true,
      } : {},
      rank: title,
    });
  } else if (typeof client.call === 'function') {
    const rights = isPromote
      ? {
          _: 'chatAdminRights',
          changeInfo: false,
          postMessages: isBroadcast,
          editMessages: isBroadcast,
          deleteMessages: true,
          banUsers: true,
          inviteUsers: true,
          pinMessages: false,
          addAdmins: false,
          anonymous: false,
          manageCall: true,
        }
      : { _: 'chatAdminRights' };

    if (isChannel) {
      await client.call({ _: 'channels.editAdmin', channel: chat, userId: participant, adminRights: rights, rank: title });
    } else {
      try {
        await client.call({ _: 'messages.editChatAdmin', chatId: chat.id, userId: participant, isAdmin: isPromote });
      } catch {
        await client.call({ _: 'channels.editAdmin', channel: chat, userId: participant, adminRights: rights, rank: title });
      }
    }
  }

  if (isPromote) {
    await message.edit({
      text: `<blockquote>⬆️ ${mention(target)} <b>di-promote${title !== '' ? ` sebagai <i>${escapeHtml(title)}</i>` : ''}.</b></blockquote>`,
      parseMode: 'html'
    });
  } else {
    await message.edit({
      text: `<blockquote>⬇️ ${mention(target)} <b>di-demote — hak admin dicabut.</b></blockquote>`,
      parseMode: 'html'
    });
  }
}

async function handleLock(client, message, chat, cmd, args) {
  const mode = args.trim().toLowerCase();
  if (mode !== 'all' && mode !== 'media' && mode !== 'links') {
    await message.edit({
      text: '<blockquote>❌ <b>Target tidak valid.</b> Gunakan <code>.lock all|media|links</code> atau <code>.unlock all|media|links</code>.</blockquote>',
      parseMode: 'html'
    });
    return;
  }
  const isLock = cmd === 'lock';
  const targets = LOCK_TARGETS[mode] || [];

  // EditChatDefaultBannedRights mengganti SELURUH objek hak, jadi hak default
  // yang lama diambil dulu lalu di-merge supaya lock media tidak membuka
  let prev: any;
  try {
    if (typeof client.call === 'function') {
      if (chat.className === 'Channel') {
        const full = await client.call({ _: 'channels.getFullChannel', channel: chat });
        prev = full.fullChat?.defaultBannedRights;
      } else {
        const full = await client.call({ _: 'messages.getFullChat', chatId: chat.id });
        prev = full.fullChat?.defaultBannedRights;
      }
    }
  } catch {
    prev = undefined;
  }

  const merged: Record<string, any> = {
    _: 'chatBannedRights',
    untilDate: 0
  };
  for (const flag of LOCK_TARGETS.all) {
    const wasLocked = prev ? prev[flag] === true : false;
    const isTarget = targets.includes(flag);
    merged[flag] = isLock ? isTarget : (isTarget ? false : wasLocked);
  }

  if (typeof client.call === 'function') {
    await client.call({
      _: 'messages.editChatDefaultBannedRights',
      peer: chat,
      bannedRights: merged,
    });
  }

  const label = LOCK_LABELS[mode];
  const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  const icon = isLock ? '🔒' : '🔓';
  const text = isLock
    ? `<blockquote>${icon} <b>${escapeHtml(labelCap)} dikunci untuk seluruh member.</b></blockquote>`
    : `<blockquote>${icon} <b>${escapeHtml(labelCap)} dibuka kembali.</b></blockquote>`;
  await message.edit({ text, parseMode: 'html' });
}

export default {
  name: 'moderate',
  version: '1.0.0',
  description: 'Moderasi grup: kick, ban, mute, promote, lock.',
  help: {
    title: 'Moderasi Grup (.kick .ban .mute .lock)',
    description: 'Alat moderasi grup lengkap ala getter admintools (butuh hak admin di grup).',
    usage: '• Reply user ATAU tulis username/ID:\n• `.kick`, `.ban`, `.unban`\n• `.mute [30m|1h|1d] [alasan]`, `.unmute`\n• `.promote [gelar]`, `.demote`\n• `.lock all|media|links`, `.unlock all|media|links`',
    detail: 'Durasi mute maksimal 7 hari (boleh digabung, mis. 1h30m). Hanya owner userbot (pesan keluar sendiri) yang bisa memakai command ini.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.([A-Za-z]+)(?:\s+([\s\S]*))?$/);
    if (!match) {return;}
    const cmd = match[1].toLowerCase();
    if (!COMMANDS.includes(cmd)) {return;}
    const args = (match[2] || '').trim();

    let chat;
    try {
      chat = await message.getChat();
    } catch (_e) { chat = undefined; }
    if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
      await message.edit({
        text: '<blockquote>❌ <b>Moderasi hanya bisa dipakai di dalam grup.</b></blockquote>',
        parseMode: 'html'
      });
      return;
    }
    const isChannel = chat.className === 'Channel';

    try {
      if (cmd === 'lock' || cmd === 'unlock') {
        await handleLock(client, message, chat, cmd, args);
      } else if (cmd === 'promote' || cmd === 'demote') {
        await handleRole(client, message, chat, isChannel, cmd, args, telegramId);
      } else {
        await handleMember(client, message, chat, isChannel, cmd, args, telegramId);
      }
    } catch (err) {
      Logger.logUser(telegramId, `Error in moderate plugin (${cmd}): ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal ${escapeHtml(cmd)}:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i>\nPastikan Anda admin dengan hak yang cukup.</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
