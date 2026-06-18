import { getReputation, getWarns, updateReputation, getChatSettings, getUserbotSession, updateChatSettings } from '../../database/db.js';
import { block, escapeHtml, footer } from '../ui.js';

const cooldowns = new Map();

async function resolveTarget(client, message) {
  const replied = message.replyToMessage;
  if (replied?.sender?.id) return { id: Number(replied.sender.id), entity: await client.getEntity(replied.sender.id).catch(() => null) };
  const input = message.text?.trim().split(/\s+/)[1];
  if (!input) return null;
  if (/^\d+$/.test(input)) {
    return { id: Number(input), entity: null };
  }
  try {
    const entity = await client.getEntity(input);
    return { id: Number(entity.id || input), entity };
  } catch (e) {
    return { id: Number(input) || 0, entity: null };
  }
}

function label(score) {
  if (score > 0) return 'Baik';
  if (score < 0) return 'Buruk';
  return 'Netral';
}

export default {
  name: 'reputation',
  help: {
    title: 'User Reputation (.reputation)',
    description: 'Memberi nilai reputasi user dan melihat ringkasannya.',
    usage: '• `+` atau `+rep` (reply)\n• `-` atau `-rep` (reply)\n• `.reputation @user`\n• `.reps`',
    detail: 'Sistem reputasi untuk menilai user.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.text) return;

    const chatKey = String(message.chat.id || message.chat.id || '');
    const chatConfig = getChatSettings(telegramId, chatKey);
    const prefix = chatConfig.prefix || '.';

    const text = message.text.trim();
    const args = text.split(/\s+/);
    let cmd = args[0].toLowerCase();
    
    let isVote = false;
    if (['+', '+rep', '-', '-rep'].includes(cmd)) { isVote = true; }

    if (isVote) {
      const target = await resolveTarget(client, message);
      if (!target || target.id === 0) return;
      if (target.id === Number(message.sender.id)) {
        return;
      }

      const now = Date.now();
      const voterKey = `rep_cooldown_${telegramId}_${message.sender.id}_${target.id}`;
      const lastVote = cooldowns.get(voterKey) || 0;
      if (now - lastVote < 60000) {
        return; // 1 minute cooldown per user per target
      }
      cooldowns.set(voterKey, now);

      const voteVal = (cmd === '+' || cmd === '+rep') ? 1 : -1;
      let score = getReputation(telegramId, target.id) || 0;
      score += voteVal;
      
      const repFloor = chatConfig.rep_floor;
      if (repFloor !== undefined && score < repFloor) {
        score = repFloor;
      }

      await updateReputation(telegramId, target.id, score);
      
      await message.edit({
        text: block('Reputation Update', `Reputasi ${escapeHtml(target.entity?.firstName || String(target.id))} menjadi ${score}.`) + footer(settings),
        parseMode: 'html',
      });
      
      if (chatConfig.log_enabled === 1 && chatConfig.log_channel) {
        try {
          await client.sendText(chatConfig.log_channel, `<b>Log Reputasi</b>\nDari: ${message.sender.id}\nKe: ${target.id}\nPerubahan: ${voteVal > 0 ? '+1' : '-1'}`, {
            parseMode: 'html'
          });
        } catch (e) {}
      }
      return;
    }

    if (!message.isOutgoing) return;
    if (!text.startsWith(prefix)) return;
    cmd = args[0].slice(prefix.length).toLowerCase();

    if (!['reputation', 'reps', 'setrepfloor'].includes(cmd)) return;

    if (cmd === 'setrepfloor') {
      const floor = Number(args[1]);
      if (isNaN(floor)) return;
      await updateChatSettings(telegramId, chatKey, 'rep_floor', floor);
      await message.edit({ text: block('Reputation', `Batas bawah reputasi diatur ke ${floor}`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === 'reputation') {
      let targetId = telegramId;
      if (args.length > 1) {
        const target = await resolveTarget(client, message);
        if (target && target.id !== 0) targetId = target.id;
      }
      
      const score = getReputation(telegramId, targetId) || 0;
      await message.edit({
        text: block('Reputasi', `<pre>Target      ${targetId}\nReputasi   ${score}\nLabel       ${label(score)}</pre>`) + footer(settings),
        parseMode: 'html',
      });
      return;
    }

    if (cmd === 'reps') {
      try {
        const session = getUserbotSession(telegramId);
        const repData = session?.reputation_data || {};
        const sorted = Object.entries(repData)
          .filter(([uid, score]) => score > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50);

        let res = '';
        for (let i = 0; i < sorted.length; i++) {
          const [uid, score] = sorted[i];
          let name = uid;
          try {
            const entity = await client.getEntity(Number(uid));
            if (entity && entity.firstName) name = entity.firstName;
          } catch (e) {}
          res += `${i + 1}. <code>${escapeHtml(name)}</code> : ${score}\n`;
        }
        if (!res) res = 'Belum ada data.';

        await message.edit({
          text: block('Leaderboard Reputasi Teratas', res) + footer(settings),
          parseMode: 'html',
        });
      } catch (e) {
        console.log('REPS ERROR:', e);
      }
    }
  },
};
