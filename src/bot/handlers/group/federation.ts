import { getGroupConfig, updateGroupConfig, getFederation, saveFederation } from '../../../infrastructure/database.js';
import { isAdmin, isOwner } from '../admin/admin_bot.js';
import { replyRich } from '../../../utils/richMessage.js';

// Random ID generator
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

export function registerFederationHandlers(bot) {
  const modCheck = async (ctx, next) => {
    if (ctx.chat.type === 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (await isGroupAdmin(ctx, userId) || isOwner(userId)) {
      return next();
    }
    return replyRich(ctx, '❌ Anda bukan admin.');
  };

  bot.command('newfed', async (ctx) => {
    if (!isOwner(ctx.from.id)) return replyRich(ctx, '❌ Hanya owner bot yang bisa membuat Federasi utama.');
    
    const fedName = ctx.match.trim();
    if (!fedName) return replyRich(ctx, '❌ Format: `/newfed <Nama Fed>`', { markdown: true });

    const fedId = generateId();
    const fedData = {
      fed_id: fedId,
      fed_name: fedName,
      owner_id: ctx.from.id,
      admins: [ctx.from.id],
      banned_users: {},
      linked_groups: []
    };

    await saveFederation(fedData);
    replyRich(ctx, `✅ Federasi **${fedName}** berhasil dibuat!\n\nID Federasi: \`${fedId}\`\n\nGunakan \`/joinfed ${fedId}\` di grup lain untuk menautkan grup ke federasi ini.`, { markdown: true });
  });

  bot.command('joinfed', modCheck, async (ctx) => {
    const fedId = ctx.match.trim();
    if (!fedId) return replyRich(ctx, '❌ Format: `/joinfed <Fed ID>`', { markdown: true });

    const fed = getFederation(fedId);
    if (!fed) return replyRich(ctx, '❌ Federasi tidak ditemukan.');

    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (config.linked_fed === fedId) {
      return replyRich(ctx, '❌ Grup ini sudah terhubung ke federasi tersebut.');
    }

    config.linked_fed = fedId;
    await updateGroupConfig(chatId, config);

    if (!fed.linked_groups) fed.linked_groups = [];
    if (!fed.linked_groups.includes(chatId)) {
      fed.linked_groups.push(chatId);
      await saveFederation(fed);
    }

    replyRich(ctx, `🤝 Grup ini berhasil ditautkan ke Federasi **${fed.fed_name}**.`);
  });

  bot.command('leavefed', modCheck, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (!config.linked_fed) {
      return replyRich(ctx, '❌ Grup ini tidak terhubung ke federasi manapun.');
    }

    const fedId = config.linked_fed;
    config.linked_fed = null;
    await updateGroupConfig(chatId, config);

    const fed = getFederation(fedId);
    if (fed && fed.linked_groups) {
      fed.linked_groups = fed.linked_groups.filter(id => id !== chatId);
      await saveFederation(fed);
    }

    replyRich(ctx, '🚪 Grup ini telah keluar dari federasi.');
  });

  bot.command('fban', modCheck, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (!config.linked_fed) {
      return replyRich(ctx, '❌ Grup ini tidak terhubung ke federasi. Gabung dulu dengan `/joinfed`.', { markdown: true });
    }

    const fed = getFederation(config.linked_fed);
    if (!fed) return replyRich(ctx, '❌ Federasi tidak ditemukan.');

    if (!fed.admins.includes(ctx.from.id)) {
      return replyRich(ctx, '❌ Anda bukan admin di federasi ini.');
    }

    let targetId = null;
    let reason = '';

    if (ctx.message.reply_to_message) {
      targetId = ctx.message.reply_to_message.from.id;
      reason = ctx.match.trim();
    } else {
      const args = ctx.match.trim().split(' ');
      targetId = parseInt(args[0]);
      reason = args.slice(1).join(' ');
    }

    if (!targetId || isNaN(targetId)) {
      return replyRich(ctx, '❌ Reply pesan atau gunakan: `/fban <ID> [alasan]`', { markdown: true });
    }

    if (targetId === ctx.from.id || targetId === bot.botInfo.id || isAdmin(targetId)) {
      return replyRich(ctx, '❌ Tidak dapat mem-ban target ini.');
    }

    if (!fed.banned_users) fed.banned_users = {};
    fed.banned_users[targetId] = {
      reason: reason || 'Pelanggaran Federasi',
      date: new Date().toISOString(),
      banned_by: ctx.from.id
    };

    await saveFederation(fed);

    // Banish user from current group immediately
    try {
      await ctx.banChatMember(targetId);
    } catch(e) {}

    replyRich(ctx, `🦅 **F-BAN DITEGAKKAN!**\n\nTarget: \`${targetId}\`\nAlasan: ${fed.banned_users[targetId].reason}\nFederasi: ${fed.fed_name}\n\nPengguna ini akan ditolak di seluruh jaringan grup federasi ini.`, { markdown: true });
  });

  bot.command('unfban', modCheck, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (!config.linked_fed) return replyRich(ctx, '❌ Grup tidak terhubung ke federasi.');

    const fed = getFederation(config.linked_fed);
    if (!fed) return replyRich(ctx, '❌ Federasi tidak ditemukan.');

    if (!fed.admins.includes(ctx.from.id)) return replyRich(ctx, '❌ Anda bukan admin federasi.');

    let targetId = null;
    if (ctx.message.reply_to_message) {
      targetId = ctx.message.reply_to_message.from.id;
    } else {
      targetId = parseInt(ctx.match.trim());
    }

    if (!targetId || isNaN(targetId)) return replyRich(ctx, '❌ Reply pesan atau berikan ID.');

    if (!fed.banned_users || !fed.banned_users[targetId]) {
      return replyRich(ctx, '❌ Pengguna tidak ada dalam daftar F-Ban.');
    }

    delete fed.banned_users[targetId];
    await saveFederation(fed);

    try {
      await ctx.unbanChatMember(targetId);
    } catch(e) {}

    replyRich(ctx, `🕊️ **UN-FBAN**\nPengguna \`${targetId}\` telah dicabut dari daftar hitam Federasi.`, { markdown: true });
  });

  bot.command('fedinfo', modCheck, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (!config.linked_fed) return replyRich(ctx, '❌ Grup tidak terhubung ke federasi.');
    
    const fed = getFederation(config.linked_fed);
    if (!fed) return replyRich(ctx, '❌ Federasi tidak ditemukan.');

    const banCount = fed.banned_users ? Object.keys(fed.banned_users).length : 0;
    const groupCount = fed.linked_groups ? fed.linked_groups.length : 0;

    const html = `
      <h1>🏛 Info Federasi</h1>
      <blockquote>Federasi ini mengamankan <b>${groupCount}</b> grup cabang.</blockquote>
      <table bordered striped>
        <tr>
          <th align="left">Atribut</th>
          <th align="left">Detail</th>
        </tr>
        <tr>
          <td><b>Nama Fed</b></td>
          <td>${fed.fed_name}</td>
        </tr>
        <tr>
          <td><b>ID Fed</b></td>
          <td><code>${fed.fed_id}</code></td>
        </tr>
        <tr>
          <td><b>ID Pemilik</b></td>
          <td><code>${fed.owner_id}</code></td>
        </tr>
        <tr>
          <td><b>Jumlah Admin</b></td>
          <td>${fed.admins.length}</td>
        </tr>
        <tr>
          <td><b>Total F-Ban</b></td>
          <td>${banCount} Akun</td>
        </tr>
      </table>
    `.trim();

    replyRich(ctx, html, { reply_parameters: { message_id: ctx.message.message_id } });
  });

  // F-Ban interceptor
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    
    const chatId = ctx.chat.id.toString();
    const config = await getGroupConfig(chatId);
    
    if (!config.linked_fed) return next();
    
    const fed = getFederation(config.linked_fed);
    if (!fed || !fed.banned_users) return next();

    // Check message sender
    const userId = ctx.from?.id;
    if (userId && fed.banned_users[userId]) {
      try {
        await ctx.deleteMessage();
        await ctx.banChatMember(userId);
      } catch (e) {}
      return;
    }

    // Check new members
    if (ctx.message.new_chat_members) {
      for (const m of ctx.message.new_chat_members) {
        if (fed.banned_users[m.id]) {
          try {
            await ctx.banChatMember(m.id);
            await replyRich(ctx, `🦅 Pengguna [${m.first_name}](tg://user?id=${m.id}) dilarang masuk karena berada dalam daftar hitam Federasi **${fed.fed_name}**.`, { markdown: true });
          } catch(e) {}
        }
      }
    }

    return next();
  });
}
