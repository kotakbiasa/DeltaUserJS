import fs from 'fs';
import path from 'path';
import { isMongo, VoucherModel } from '../infrastructure/dbCore.js';
import { getUserbotSession, updateUserbotFeature } from '../infrastructure/database.js';
import { isApproved, approveUser } from '../bot/state/approvedUsers.js';
import { Logger } from '../utils/logger.js';
import { notifyChannel } from './notifyService.js';
import { getMasterBotUsername } from '../bot/state/botUsername.js';

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface VoucherData {
  code: string;
  days: number;
  max_uses: number;
  used_by: number[];
  created_at: number;
  expires_at?: number | null;
  created_by: number;
}

const voucherFile = path.join(process.cwd(), 'vouchers.json');
const voucherCache: Map<string, VoucherData> = new Map();

// Load local vouchers from file on startup
try {
  if (fs.existsSync(voucherFile)) {
    const data = JSON.parse(fs.readFileSync(voucherFile, 'utf8'));
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && item.code) {
          voucherCache.set(String(item.code).toUpperCase(), {
            code: String(item.code).toUpperCase(),
            days: Number(item.days) || 0,
            max_uses: Number(item.max_uses) || 1,
            used_by: Array.isArray(item.used_by) ? item.used_by.map(Number) : [],
            created_at: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
            expires_at: item.expires_at ? new Date(item.expires_at).getTime() : null,
            created_by: Number(item.created_by) || 0,
          });
        }
      }
    }
  }
} catch (err) {
  Logger.logSystem(`⚠️ Error loading vouchers.json: ${err}`, 'WARN');
}

function saveLocalVouchers() {
  try {
    fs.writeFileSync(voucherFile, JSON.stringify([...voucherCache.values()], null, 2));
  } catch (err) {
    Logger.logSystem(`⚠️ Error saving vouchers.json: ${err}`, 'WARN');
  }
}

export async function initVouchers() {
  if (isMongo) {
    try {
      const docs = await VoucherModel.find({});
      for (const doc of docs) {
        const code = String(doc.code).toUpperCase();
        voucherCache.set(code, {
          code,
          days: Number(doc.days) || 0,
          max_uses: Number(doc.max_uses) || 1,
          used_by: (doc.used_by || []).map(Number),
          created_at: doc.created_at ? new Date(doc.created_at).getTime() : Date.now(),
          expires_at: doc.expires_at ? new Date(doc.expires_at).getTime() : null,
          created_by: Number(doc.created_by) || 0,
        });
      }
      saveLocalVouchers();
      Logger.logSystem(`🎟️ Loaded ${docs.length} voucher(s) from MongoDB.`, 'INFO');
    } catch (err) {
      Logger.logSystem(`⚠️ Failed to load vouchers from MongoDB: ${err}`, 'WARN');
    }
  }
}

async function persistVoucher(voucher: VoucherData) {
  saveLocalVouchers();
  if (isMongo) {
    try {
      await VoucherModel.findOneAndUpdate(
        { code: voucher.code },
        {
          code: voucher.code,
          days: voucher.days,
          max_uses: voucher.max_uses,
          used_by: voucher.used_by,
          created_at: new Date(voucher.created_at),
          expires_at: voucher.expires_at ? new Date(voucher.expires_at) : null,
          created_by: voucher.created_by,
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      Logger.logSystem(`⚠️ Failed to persist voucher to MongoDB: ${err}`, 'WARN');
    }
  }
}

export function getAllVouchers(): VoucherData[] {
  return [...voucherCache.values()].sort((a, b) => b.created_at - a.created_at);
}

export function getVoucher(rawCode: string): VoucherData | undefined {
  return voucherCache.get(String(rawCode || '').trim().toUpperCase());
}

export async function createVoucher(opts: {
  code: string;
  days: number;
  maxUses?: number;
  expiresAt?: number | null;
  createdBy?: number;
}): Promise<{ success: boolean; message: string; voucher?: VoucherData }> {
  const code = String(opts.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code || code.length < 3) {
    return { success: false, message: 'Kode voucher minimal 3 karakter (huruf, angka, dash).' };
  }
  if (voucherCache.has(code)) {
    return { success: false, message: `Kode voucher ${code} sudah ada!` };
  }

  const voucher: VoucherData = {
    code,
    days: Number(opts.days) >= 0 ? Number(opts.days) : 7,
    max_uses: opts.maxUses !== undefined ? Number(opts.maxUses) : 1,
    used_by: [],
    created_at: Date.now(),
    expires_at: opts.expiresAt || null,
    created_by: opts.createdBy || 0,
  };

  voucherCache.set(code, voucher);
  await persistVoucher(voucher);

  // Broadcast voucher promo post to channel with instant claim button
  await broadcastVoucherToChannel(code).catch(() => {});

  return { success: true, message: `Voucher ${code} berhasil dibuat dan dibagikan ke channel!`, voucher };
}

export async function broadcastVoucherToChannel(
  rawCode: string
): Promise<{ success: boolean; message: string }> {
  const code = String(rawCode || '').trim().toUpperCase();
  const voucher = voucherCache.get(code);
  if (!voucher) {
    return { success: false, message: `Voucher ${code} tidak ditemukan.` };
  }

  const botUser = getMasterBotUsername() || 'PanelDeltaUbot';
  const durationStr = voucher.days === 0 ? '♾️ Lifetime' : `+${voucher.days} Hari`;
  const remainingCount = voucher.max_uses === -1 ? '♾️ Unlimited' : `${Math.max(0, voucher.max_uses - voucher.used_by.length)} Pengguna`;
  const claimUrl = `https://t.me/${botUser}?start=voucher_${code}`;
  const nowWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const postText =
    `🎁 <b>KODE VOUCHER PROMO AKTIF!</b>\n\n` +
    `<blockquote>⚡ <b>DeltaUserJS Userbot Premium Access</b>\n` +
    `Dapatkan akses gratis atau perpanjangan masa aktif userbot secara instan menggunakan kode promo di bawah ini!</blockquote>\n\n` +
    `• 🎟️ <b>Kode Voucher:</b> <code>${code}</code>\n` +
    `• ⏳ <b>Masa Aktif:</b> <b>${durationStr}</b>\n` +
    `• 👥 <b>Sisa Kuota:</b> <b>${remainingCount}</b>\n` +
    `• 📅 <b>Waktu Rilis:</b> <code>${nowWib} WIB</code>\n\n` +
    `<blockquote expandable>💡 <b>Cara Klaim Voucher:</b>\n` +
    `1. Ketuk tombol <b>🎟️ Klaim Voucher Sekarang</b> di bawah.\n` +
    `2. Bot akan terbuka otomatis di Telegram Anda.\n` +
    `3. Voucher langsung aktif / diperpanjang tanpa perlu input kode manual!</blockquote>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎟️ Klaim Voucher Sekarang', url: claimUrl }],
    ],
  };

  const sent = await notifyChannel(postText, { reply_markup: keyboard });
  if (!sent) {
    return { success: false, message: 'Gagal mengirim ke channel notifikasi. Pastikan bot sudah diangkat sebagai Admin di channel.' };
  }
  return { success: true, message: `Voucher ${code} berhasil dibagikan ke channel!` };
}

export async function deleteVoucher(rawCode: string): Promise<boolean> {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!voucherCache.has(code)) {return false;}
  voucherCache.delete(code);
  saveLocalVouchers();
  if (isMongo) {
    try {
      await VoucherModel.deleteOne({ code });
    } catch (_) { /* ignore */ }
  }

  const nowWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  notifyChannel(
    `🗑️ <b>VOUCHER PROMO DIHAPUS</b>\n\n` +
    `<blockquote>` +
    `• <b>Kode Voucher:</b> <code>${code}</code>\n` +
    `• <b>Waktu:</b> <code>${nowWib} WIB</code>\n` +
    `</blockquote>`
  ).catch(() => {});

  return true;
}

export async function redeemVoucher(
  rawCode: string,
  telegramId: number,
  userMeta?: { name?: string; username?: string }
): Promise<{
  success: boolean;
  message: string;
  daysAdded?: number;
  newExpiredAt?: string | null;
}> {
  const code = String(rawCode || '').trim().toUpperCase();
  const idNum = Number(telegramId);
  if (!code) {
    return { success: false, message: 'Kode voucher tidak boleh kosong.' };
  }

  const voucher = voucherCache.get(code);
  if (!voucher) {
    return { success: false, message: 'Kode voucher tidak valid atau tidak terdaftar di sistem.' };
  }

  if (voucher.expires_at && voucher.expires_at < Date.now()) {
    return { success: false, message: 'Kode voucher tersebut telah kadaluarsa.' };
  }

  if (voucher.used_by && voucher.used_by.includes(idNum)) {
    return { success: false, message: 'Anda sudah pernah menukarkan kode voucher ini sebelumnya.' };
  }

  if (voucher.max_uses !== -1 && voucher.used_by.length >= voucher.max_uses) {
    return { success: false, message: 'Kuota pemakaian voucher ini sudah habis.' };
  }

  // Auto-approve user whitelist if not yet approved
  if (!isApproved(idNum)) {
    approveUser(idNum, { name: userMeta?.name || 'Voucher Member', username: userMeta?.username });
  }

  // Extend expiration if userbot session exists in DB
  const session = getUserbotSession(idNum);
  let newExp: string | null = null;
  if (session) {
    if (voucher.days === 0) {
      newExp = null;
      await updateUserbotFeature(idNum, 'expired_at', null);
    } else {
      const now = Date.now();
      const base = (session.expired_at && new Date(session.expired_at).getTime() > now)
        ? new Date(session.expired_at).getTime()
        : now;
      newExp = new Date(base + voucher.days * 24 * 60 * 60 * 1000).toISOString();
      await updateUserbotFeature(idNum, 'expired_at', newExp);
    }
  }

  // Record usage
  voucher.used_by.push(idNum);
  await persistVoucher(voucher);

  const durationStr = voucher.days === 0 ? '♾️ Unlimited' : `+${voucher.days} Hari`;
  const quotaStr = voucher.max_uses === -1 ? `${voucher.used_by.length} / ♾️` : `${voucher.used_by.length} / ${voucher.max_uses}`;
  const nowWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const userTag = userMeta?.username
    ? `@${userMeta.username}`
    : (userMeta?.name ? escapeHtml(userMeta.name) : `<code>${idNum}</code>`);

  const botUser = getMasterBotUsername() || 'PanelDeltaUbot';
  const claimUrl = `https://t.me/${botUser}?start=voucher_${code}`;
  const hasRemainingQuota = voucher.max_uses === -1 || voucher.used_by.length < voucher.max_uses;
  const remainingCount = voucher.max_uses === -1 ? '♾️' : `${voucher.max_uses - voucher.used_by.length} Tersisa`;

  const replyMarkup = hasRemainingQuota
    ? {
        inline_keyboard: [
          [{ text: `🎟️ Klaim Sisa Kuota (${remainingCount})`, url: claimUrl }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: '⚡ Buka Dashboard Bot', url: `https://t.me/${botUser}?start=true` }],
        ],
      };

  notifyChannel(
    `🎉 <b>KLAIM VOUCHER PROMO BERHASIL</b>\n\n` +
    `<blockquote>` +
    `• <b>Kode Voucher:</b> <code>${code}</code>\n` +
    `• <b>Pengguna:</b> ${userTag} (<code>${idNum}</code>)\n` +
    `• <b>Masa Aktif:</b> <b>${durationStr}</b>\n` +
    `• <b>Pemakaian Kuota:</b> <b>${quotaStr}</b>\n` +
    `• <b>Status Akun:</b> ${session ? '🔄 Perpanjangan Berhasil' : '🚀 Auto-Approved (Siap Login)'}\n` +
    `• <b>Waktu:</b> <code>${nowWib} WIB</code>\n` +
    `</blockquote>`,
    { reply_markup: replyMarkup }
  ).catch(() => {});

  return {
    success: true,
    message: `🎉 <b>Selamat!</b> Kode voucher <code>${code}</code> berhasil ditukarkan.\nMasa Aktif: <b>${durationStr}</b>`,
    daysAdded: voucher.days,
    newExpiredAt: newExp,
  };
}
