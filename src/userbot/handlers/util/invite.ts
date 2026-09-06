import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// INVITE — invite user ke grup via username atau reply.
// Supergroup/channel : channels.InviteToChannel (multi-user OK).
// Grup biasa (basic) : messages.AddChatUser (satu user per call).
// Error yang di-handle khusus:
//   USER_NOT_PARTICIPANT   -> user/kita bukan member grup
//   USER_PRIVACY_RESTRICTED-> privasi user melarang diinvite (perlu kontak)
//   USER_NOT_MUTUAL_CONTACT-> sama, khusus basic group
//   USER_ALREADY_PARTICIPANT / USER_ALREADY_INVITED
//   CHAT_ADMIN_REQUIRED    -> butuh hak admin invite
// Konsep diadaptasi dari catuserbot invite.py (konsep overtake
// lintas-repo), ditulis ulang ke pola plugin DeltaUserJS.
// ============================================================

const FWD_LIMIT = 100;

interface ResolvedUser {
  id: number;
  name: string;
  entity?: Api.TypeEntityLike;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Error Telegram yang punya pesan baku enak dibaca user (fallback tetap tampil).
const FRIENDLY_ERRORS: Array<{ errorMessage?: string; name?: string; text: string }> = [
  { errorMessage: 'USER_NOT_PARTICIPANT', name: 'UserNotParticipantError', text: 'User atau akun ini bukan member grup — tidak bisa menginvite dari luar.' },
  { errorMessage: 'USER_PRIVACY_RESTRICTED', text: 'Privasi user melarang diinvite (bukan kontak). Minta user membuka chat ini atau join manual via link invite.' },
  { errorMessage: 'USER_NOT_MUTUAL_CONTACT', text: 'Privasi user melarang diinvite (harus saling kontak di grup biasa). Minta user join manual via link invite.' },
  { errorMessage: 'USER_ALREADY_PARTICIPANT', name: 'UserAlreadyParticipantError', text: 'User sudah menjadi anggota grup ini.' },
  { errorMessage: 'USER_ALREADY_INVITED', text: 'User sudah diinvite sebelumnya.' },
  { errorMessage: 'CHAT_ADMIN_REQUIRED', name: 'ChatAdminRequiredError', text: 'Butuh hak admin (invite users) di grup ini.' },
  { errorMessage: 'USER_CHANNELS_TOO_MUCH', name: 'UserChannelsTooMuchError', text: 'User sudah gabung di terlalu banyak grup/channel.' },
  { errorMessage: 'USERS_TOO_MUCH', name: 'UsersTooMuchError', text: 'Grup sudah penuh (batas member tercapai).' },
  { errorMessage: 'USER_IS_BOT', name: 'UserIsBotError', text: 'Bot tidak bisa diinvite ke grup biasa.' },
  { errorMessage: 'USER_KICKED', name: 'UserKickedError', text: 'User baru saja dikeluarkan dari grup ini — tidak bisa langsung diinvite.' },
];

function friendlyError(err: unknown): string | null {
  const anyErr = err as { errorMessage?: string; name?: string } | null;
  if (!anyErr || typeof anyErr !== 'object') {return null;}
  for (const rule of FRIENDLY_ERRORS) {
    if ((rule.errorMessage && anyErr.errorMessage === rule.errorMessage)
      || (rule.name && anyErr.name === rule.name)) {
      return rule.text;
    }
  }
  return null;
}

// Terima token: @username, username, t.me(/username) link, atau ID numerik.
function normalizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@/, '');
}

// Reply ke pesan user > prioritas utama. Tanpa reply: semua token argumen.
async function resolveTargets(client, message, args: string): Promise<{ targets: ResolvedUser[]; error?: string }> {
  const targets: ResolvedUser[] = [];

  const replied = await message.getReplyMessage();
  if (replied && replied.senderId) {
    let name = `User ${replied.senderId}`;
    let entity: Api.TypeEntityLike | undefined;
    try {
      const sender = await replied.getSender();
      if (sender) {
        entity = sender;
        name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.title || name;
      }
    } catch (_e) { /* pengirim anonim: pakai fallback */ }
    targets.push({ id: Number(replied.senderId), name, entity });
    return { targets };
  }

  const tokens = args.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { targets: [], error: 'Balas pesan user, atau tulis username/ID-nya' };
  }

  for (const token of tokens) {
    const lookup = normalizeToken(token);
    if (!lookup) {
      targets.push({ id: 0, name: token });
      continue;
    }
    let entity: Api.TypeEntityLike | undefined;
    try {
      entity = await client.getEntity(/^\d+$/.test(lookup) ? Number(lookup) : lookup);
    } catch (_e) { entity = undefined; }
    if (entity) {
      const u = entity as unknown as { firstName?: string; lastName?: string; title?: string; id?: unknown };
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.title || lookup;
      targets.push({ id: Number(u.id), name, entity });
    } else {
      // Tanpa cache entity tetap dicoba pakai username string mentah —
      // Telegram bisa resolve sendiri; kalau gagal akan jatuh ke error.
      targets.push({ id: 0, name: lookup, entity: lookup });
    }
  }
  return { targets };
}

async function handleInvite(client, message, chat, isChannel: boolean, args: string): Promise<void> {
  const resolved = await resolveTargets(client, message, args);
  if (resolved.error) {
    await message.edit({
      text: `<blockquote>❌ <b>${escapeHtml(resolved.error)}.</b></blockquote>`,
      parseMode: 'html',
    });
    return;
  }
  if (resolved.targets.length === 0) {
    await message.edit({
      text: '<blockquote>❌ <b>Tidak ada target user yang valid.</b></blockquote>',
      parseMode: 'html',
    });
    return;
  }

  const ok: string[] = [];
  const failed: string[] = [];

  for (const target of resolved.targets) {
    const label = escapeHtml(target.name.length > 24 ? `${target.name.slice(0, 24)}…` : target.name);
    const participant = target.entity ?? target.id;
    try {
      if (isChannel) {
        await client.invoke(new Api.channels.InviteToChannel({
          channel: chat,
          users: [participant],
        }));
      } else {
        await client.invoke(new Api.messages.AddChatUser({
          chatId: chat.id,
          userId: participant,
          fwdLimit: FWD_LIMIT,
        }));
      }
      ok.push(`✅ <a href="tg://user?id=${target.id}">${label}</a>`);
    } catch (err) {
      const friendly = friendlyError(err);
      const detail = friendly ?? escapeHtml(errText(err));
      failed.push(`❌ <b>${label}</b>: ${detail}`);
      Logger.logUser(0, `Invite ${target.name} gagal: ${errText(err)}`, 'WARN');
    }
  }

  const parts: string[] = [];
  if (ok.length > 0) {parts.push(`➕ Berhasil: ${ok.length}`);}
  if (failed.length > 0) {parts.push(`⚠️ Gagal: ${failed.length}`);}
  const lines = parts.join(' • ');

  let body = '';
  for (const line of [...ok, ...failed]) {
    body += `${line}\n`;
  }

  await message.edit({
    text: `👥 <b>INVITE USER</b>\n<blockquote>${escapeHtml(lines)}\n\n${body}</blockquote>`,
    parseMode: 'html',
  });
}

export default {
  name: 'invite',
  version: '1.0.0',
  description: 'Invite user ke grup via username atau reply pesan.',
  help: {
    title: 'Invite User (.invite)',
    description: 'Menambahkan user ke grup tempat command dijalankan (butuh hak admin invite).',
    usage: '• `.invite @username` — invite via username (bisa beberapa, dipisah spasi)\n• `.invite <user_id>` — invite via ID\n• reply pesan user + `.invite` — invite dari reply',
    detail: 'Supergroup/channel pakai channels.InviteToChannel; grup biasa pakai messages.AddChatUser. '
      + 'Kalau privasi user melarang diinvite (bukan kontak), bot akan menyarankan join manual via link invite.'
  },
  onLoad: () => {
    Logger.logSystem('👥 Plugin Invite loaded (.invite @user | reply .invite)', 'INFO');
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.trim().match(/^\.invite(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    let chat;
    try {
      chat = await message.getChat();
    } catch (_e) { chat = undefined; }
    if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
      await message.edit({
        text: '<blockquote>❌ <b>Invite hanya bisa dipakai di dalam grup.</b></blockquote>',
        parseMode: 'html',
      });
      return;
    }
    const isChannel = chat.className === 'Channel';

    try {
      await handleInvite(client, message, chat, isChannel, (match[1] || '').trim());
    } catch (err) {
      Logger.logUser(0, `Error in invite plugin: ${errText(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal invite:</b> <i>${escapeHtml(errText(err))}</i>\nPastikan Anda admin dengan hak menginvite.</blockquote>`,
        parseMode: 'html',
      });
    }
  }
};
