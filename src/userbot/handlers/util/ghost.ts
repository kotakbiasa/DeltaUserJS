import { Api } from 'teleproto';
import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

// ============================================================
// Ghost — mode hantu: chat yang di-ghost otomatis di-mark-as-read
// Command:
//   .ghost            — toggle ghost untuk chat sekarang
//   .ghost on|off     — aktif/matikan ghost untuk chat sekarang
//   .ghost <chatId>   — toggle ghost untuk chat lain via ID
//   .ghost <chatId> on|off — aktif/matikan ghost chat lain
//   .ghost status     — daftar chat yang sedang di-ghost
// Perilaku: setiap pesan MASUK (non-out) di chat yang di-ghost
// langsung di-mark-as-read via Api.messages.ReadHistory — chat
// terlihat "dibaca" seketika tanpa buka chat (silent).
// Konsep dari PagerMaid ghost mode. State globalThis Set per
// telegramId — bertahan saat plugin di-hot-reload.
// ============================================================

interface GhostGlobal {
  __deltaGhostStore?: Map<number, Set<string>>;
}
const ghostGlobal = globalThis as typeof globalThis & GhostGlobal;
const ghostStore: Map<number, Set<string>> = ghostGlobal.__deltaGhostStore ?? new Map();
ghostGlobal.__deltaGhostStore = ghostStore;

function getGhostSet(telegramId) {
  const idNum = Number(telegramId);
  let set = ghostStore.get(idNum);
  if (!set) {
    set = new Set();
    ghostStore.set(idNum, set);
  }
  return set;
}

/** Cek apakah sebuah chat sedang di-ghost oleh akun tertentu. */
export function isGhosted(telegramId, chatId) {
  return ghostStore.get(Number(telegramId))?.has(String(chatId)) ?? false;
}

async function markRead(client, chatId) {
  try {
    await client.invoke(new Api.messages.ReadHistory({ peer: chatId, maxId: 0 }));
  } catch (err) {
    Logger.logSystem(
      `ghost: gagal ReadHistory chat ${chatId}: ${err instanceof Error ? err.message : String(err)}`,
      'WARN'
    );
  }
}

export default {
  name: 'ghost',
  version: '1.0.0',
  description: 'Mode hantu: pesan masuk di chat yang di-ghost otomatis dibaca instan (ReadHistory) tanpa buka chat.',
  help: {
    title: '👻 Ghost Mode (.ghost)',
    description: 'Setiap pesan masuk di chat yang di-ghost langsung di-mark-as-read otomatis — chat kelihatan dibaca padahal belum dibuka.',
    usage:
      '• `.ghost` — toggle ghost di chat ini\n' +
      '• `.ghost on` / `.ghost off` — aktif/matikan di chat ini\n' +
      '• `.ghost <chatId>` — toggle ghost chat lain via ID\n' +
      '• `.ghost <chatId> on|off` — aktif/matikan chat lain\n' +
      '• `.ghost status` — daftar chat yang sedang di-ghost',
    detail:
      'Mark-as-read memakai raw API messages.ReadHistory (maxId 0) sehingga tercermin instan di sisi lawan bicara, ' +
      'tanpa notifikasi apa pun. Hanya pesan masuk (non-outgoing) yang diproses. ' +
      'State in-memory per akun: bertahan antar hot-reload, hilang saat proses userbot direstart.'
  },
  async execute(client, message, _settings, telegramId) {
    const text: string = message.message || '';
    const idNum = Number(telegramId);
    const chatId = message.chatId;
    if (chatId === null || chatId === undefined) {return;}
    const chatKey = String(chatId);

    // ===== 1. Pesan masuk: auto ReadHistory bila chat di-ghost =====
    if (!message.out) {
      if (!ghostStore.get(idNum)?.has(chatKey)) {return;}
      await markRead(client, chatId);
      return;
    }

    // ===== 2. Command (outgoing) =====
    const match = text.match(/^\.ghost(?:\s+(.*))?$/is);
    if (!match) {return;}
    const argLine = (match[1] || '').trim();
    const parts = argLine ? argLine.split(/\s+/) : [];
    const ghostSet = getGhostSet(idNum);

    const arg0 = (parts[0] || '').toLowerCase();
    const arg1 = (parts[1] || '').toLowerCase();

    // --- .ghost status ---
    if (arg0 === 'status' || arg0 === 'list') {
      if (ghostSet.size === 0) {
        await message.edit({
          text: '<blockquote>👻 Belum ada chat yang di-ghost. Gunakan <code>.ghost on</code> di chat tujuan.</blockquote>',
          parseMode: 'html'
        });
        return;
      }
      let rows = '';
      let i = 1;
      for (const key of ghostSet) {
        rows += `${i}. <code>${escapeHtml(key)}</code>\n`;
        i++;
      }
      await message.edit({
        text: `👻 <b>Chat yang sedang di-ghost (${ghostSet.size})</b>\n\n<blockquote>${rows.trim()}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    // --- Resolve target chat: argumen chatId atau chat ini ---
    let targetKey = chatKey;
    if (arg0 && arg0 !== 'on' && arg0 !== 'off') {
      const parsed = Number(arg0);
      if (!Number.isInteger(parsed) || parsed === 0) {
        await message.edit({
          text: '<blockquote>📚 <b>Penggunaan:</b> <code>.ghost on|off</code>, <code>.ghost &lt;chatId&gt;</code>, atau <code>.ghost status</code></blockquote>',
          parseMode: 'html'
        });
        return;
      }
      targetKey = String(parsed);
    }

    // --- Tentukan aksi: toggle / on / off ---
    let action: 'toggle' | 'on' | 'off' = 'toggle';
    if (arg0 === 'on' || arg1 === 'on') {action = 'on';}
    else if (arg0 === 'off' || arg1 === 'off') {action = 'off';}

    const already = ghostSet.has(targetKey);
    let wantOn: boolean;
    if (action === 'toggle') {
      wantOn = !already;
    } else {
      wantOn = action === 'on';
      if (wantOn === already) {
        const stateTxt = already ? 'memang sudah aktif' : 'memang sudah mati';
        await message.edit({
          text: `<blockquote>ℹ️ Ghost di chat <code>${escapeHtml(targetKey)}</code> ${stateTxt}.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
    }

    if (wantOn) {
      ghostSet.add(targetKey);
      // Langsung sapu unread yang sudah menumpuk saat ghost diaktifkan
      await markRead(client, Number(targetKey) || targetKey);
      await message.edit({
        text: `<blockquote>👻 <b>Ghost AKTIF</b> di chat <code>${escapeHtml(targetKey)}</code>.\nSetiap pesan masuk akan otomatis dibaca (silent).</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    ghostSet.delete(targetKey);
    await message.edit({
      text: `<blockquote>🚫 <b>Ghost MATI</b> di chat <code>${escapeHtml(targetKey)}</code>.</blockquote>`,
      parseMode: 'html'
    });
  }
};
