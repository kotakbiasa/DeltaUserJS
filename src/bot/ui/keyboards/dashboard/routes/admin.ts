/**
 * Panel admin: approval, user, fleet, broadcast, backup.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import fs from 'fs';
import userbotManager from '../../../../../userbot/engine/manager.js';
import { InputFile } from 'grammy';
import { UserbotModel, deleteUserbot, getAllRegisteredUsers, getUserbotSession, setSystemVar, updateUserbotFeature, updateUserbotStatus } from '../../../../../infrastructure/database.js';
import { approveUser, getPendingApprovals, removePendingApproval, revokeUser } from '../../../../state/approvedUsers.js';
import { escapeHtml } from '../../../../../utils/richMessage.js';
import { getSystemVarValue, isOwner } from '../shared.js';
import { keyboardAdmin, keyboardAdminBackup, keyboardAdminBroadcast, keyboardAdminFleet, keyboardAdminPending, keyboardAdminSettings, keyboardAdminUserDetail, keyboardAdminUsers, keyboardBack, keyboardSubscription } from '../keyboards.js';
import { mongoStatusLabel, sendRich } from '../richRuntime.js';
import { panelAdmin, panelAdminBackup, panelAdminBroadcast, panelAdminFleet, panelAdminPending, panelAdminSettings, panelAdminUserDetail, panelAdminUsers, panelHealth, panelSubscription } from '../panels.js';
import { NOT_HANDLED } from './types.js';
import type { BotContext } from '../../../../context.js';

export async function handleAdminRoutes(ctx: BotContext) {
  const action = ctx.match?.[1];
  // ctx.match kosong berarti pola callback tidak cocok — bukan rute ini.
  if (action === undefined) {return NOT_HANDLED;}

  if (action === 'admin') {
    if (!isOwner(ctx)) {return;}
    const pendingCount = getPendingApprovals().length;
    return sendRich(ctx, panelAdmin(ctx), keyboardAdmin(pendingCount), { edit: true });
  }

  if (action === 'health') {
    if (!isOwner(ctx)) {return;}
    return sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'), { edit: true });
  }

  if (action === 'edit_system_vars') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return ctx.conversation.enter('manage-system-vars-conv');
  }

  if (action === 'admin_pending') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
  }

  if (action.startsWith('admin_apprv:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    if (targetId) {
      approveUser(targetId);
      removePendingApproval(targetId);
      await ctx.answerCallbackQuery({ text: `✅ User ${targetId} disetujui!` });
      try {
        await ctx.api.sendMessage(
          targetId,
          `🎉 <b>Permintaan Akses Disetujui!</b>\n\n` +
          `<p>Owner telah menyetujui akses permanen userbot untuk akun Anda.</p>\n\n` +
          `<footer>Silakan klik tombol di bawah untuk mulai menghubungkan userbot Anda:</footer>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
                [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
              ],
            },
          }
        );
      } catch (_) { /* ignore */ }
    }
    return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
  }

  if (action.startsWith('admin_rjct:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    if (targetId) {
      revokeUser(targetId);
      removePendingApproval(targetId);
      if (userbotManager.isRunning(targetId)) {
        try { await userbotManager.stopUserbot(targetId); } catch (_) { /* ignore */ }
      }
      try { await updateUserbotStatus(targetId, false); } catch (_) { /* ignore */ }
      await ctx.answerCallbackQuery({ text: `❌ User ${targetId} ditolak/dicabut.` });
      try {
        await ctx.api.sendMessage(
          targetId,
          `<h3>❌ Akses Userbot Ditolak / Dicabut</h3>\n` +
          `<p>Maaf, permohonan akses userbot Anda tidak disetujui atau telah dicabut oleh owner.</p>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
              ],
            },
          }
        );
      } catch (_) { /* ignore */ }
    }
    return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
  }

  if (action === 'admin_approve_all') {
    if (!isOwner(ctx)) {return;}
    const list = getPendingApprovals();
    for (const p of list) {
      approveUser(p.userId);
      removePendingApproval(p.userId);
      try {
        await ctx.api.sendMessage(
          p.userId,
          `🎉 <b>Permintaan Akses Disetujui!</b>\n\n` +
          `<p>Owner telah menyetujui akses permanen userbot untuk akun Anda.</p>\n\n` +
          `<footer>Silakan klik tombol di bawah untuk mulai menghubungkan userbot Anda:</footer>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
                [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
              ],
            },
          }
        );
      } catch (_) { /* ignore */ }
    }
    await ctx.answerCallbackQuery({ text: `✅ Berhasil menyetujui ${list.length} user!` });
    return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
  }

  if (action.startsWith('admin_users')) {
    if (!isOwner(ctx)) {return;}
    const page = Number(action.split(':')[1]) || 1;
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminUsers(page), keyboardAdminUsers(page), { edit: true });
  }

  if (action.startsWith('admin_user:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
  }

  if (action.startsWith('admin_power_user:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    if (userbotManager.isRunning(targetId)) {
      await userbotManager.stopUserbot(targetId);
      await updateUserbotStatus(targetId, 0);
      await ctx.answerCallbackQuery({ text: `⏹️ Userbot ${targetId} dimatikan.` });
    } else {
      const session = getUserbotSession(targetId);
      if (session && session.session_string) {
        try {
          await userbotManager.startUserbot(targetId, session.session_string);
          await updateUserbotStatus(targetId, 1);
          await ctx.answerCallbackQuery({ text: `▶️ Userbot ${targetId} dinyalakan.` });
        } catch (err) {
          await ctx.answerCallbackQuery({ text: `❌ Gagal: ${err instanceof Error ? err.message : String(err)}` });
        }
      } else {
        await ctx.answerCallbackQuery({ text: `❌ Sesi userbot tidak valid.` });
      }
    }
    return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
  }

  if (action.startsWith('admin_extend:')) {
    if (!isOwner(ctx)) {return;}
    const parts = action.split(':');
    const targetId = Number(parts[1]);
    const days = Number(parts[2]);
    if (days === 0) {
      await updateUserbotFeature(targetId, 'expired_at', null);
      await ctx.answerCallbackQuery({ text: `♾️ Masa aktif diset Unlimited.` });
    } else {
      const session = getUserbotSession(targetId);
      const now = Date.now();
      const base = (session?.expired_at && new Date(session.expired_at).getTime() > now)
        ? new Date(session.expired_at).getTime()
        : now;
      const newExp = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
      await updateUserbotFeature(targetId, 'expired_at', newExp);
      await ctx.answerCallbackQuery({ text: `➕ Masa aktif ditambah ${days} hari.` });
    }
    return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
  }

  if (action.startsWith('admin_revoke_user_confirm:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    await ctx.answerCallbackQuery();
    return sendRich(ctx,
      `<h3>⚠️ Konfirmasi Cabut Izin</h3><p>Akses user <code>${targetId}</code> akan dicabut dan userbot-nya dihentikan. Sesi database tetap disimpan.</p>`,
      { inline_keyboard: [[
        { text: '🚫 Ya, Cabut Izin', callback_data: `rich:admin_revoke_user:${targetId}` },
        { text: 'Batal', callback_data: `rich:admin_user:${targetId}` },
      ]] },
      { edit: true }
    );
  }

  if (action.startsWith('admin_revoke_user:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    revokeUser(targetId);
    if (userbotManager.isRunning(targetId)) {
      await userbotManager.stopUserbot(targetId);
    }
    await updateUserbotStatus(targetId, 0);
    await ctx.answerCallbackQuery({ text: `🚫 Izin ${targetId} berhasil dicabut.` });
    const session = getUserbotSession(targetId);
    if (!session) {
      return sendRich(ctx, panelAdminUsers(1), keyboardAdminUsers(1), { edit: true });
    }
    return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
  }

  if (action.startsWith('admin_delete_user_confirm:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    await ctx.answerCallbackQuery();
    return sendRich(ctx,
      `<h3>⚠️ Konfirmasi Hapus Akun</h3><p>Akun <code>${targetId}</code>, session string, dan seluruh konfigurasi userbot akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>`,
      { inline_keyboard: [[
        { text: '🗑️ Ya, Hapus Permanen', callback_data: `rich:admin_delete_user:${targetId}` },
        { text: 'Batal', callback_data: `rich:admin_user:${targetId}` },
      ]] },
      { edit: true }
    );
  }

  if (action.startsWith('admin_delete_user:')) {
    if (!isOwner(ctx)) {return;}
    const targetId = Number(action.split(':')[1]);
    if (userbotManager.isRunning(targetId)) {
      await userbotManager.stopUserbot(targetId);
    }
    await deleteUserbot(targetId);
    revokeUser(targetId);
    await ctx.answerCallbackQuery({ text: `🗑️ Akun ${targetId} dihapus permanen.` });
    return sendRich(ctx, panelAdminUsers(1), keyboardAdminUsers(1), { edit: true });
  }

  if (action === 'admin_broadcast') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminBroadcast(), keyboardAdminBroadcast(), { edit: true });
  }

  if (action === 'admin_start_broadcast') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return ctx.conversation.enter('broadcast-conv');
  }

  if (action === 'admin_fleet') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
  }

  if (action === 'admin_fleet_restart') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery({ text: '🔄 Merestart seluruh userbot...' });
    await userbotManager.restartAllActive();
    return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
  }

  if (action === 'admin_fleet_stop_confirm') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx,
      `<h3>⚠️ Konfirmasi Emergency Stop</h3><p>Semua userbot yang sedang berjalan akan diputuskan sekarang. Jadwal tetap tersimpan, tetapi seluruh sesi menjadi offline.</p>`,
      { inline_keyboard: [[
        { text: '🛑 Ya, Stop Semua', callback_data: 'rich:admin_fleet_stop' },
        { text: 'Batal', callback_data: 'rich:admin_fleet' },
      ]] },
      { edit: true }
    );
  }

  if (action === 'admin_fleet_stop') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery({ text: '🛑 Menghentikan seluruh userbot...' });
    for (const id of Array.from(userbotManager.clients.keys())) {
      try {
        await userbotManager.stopUserbot(id);
        await updateUserbotStatus(id, 0);
      } catch (_) { /* ignore */ }
    }
    return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
  }

  if (action === 'admin_fleet_start') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery({ text: '🚀 Menyalakan seluruh userbot...' });
    const allUsers = getAllRegisteredUsers();
    for (const u of allUsers) {
      if (u.session_string && !userbotManager.isRunning(u.telegram_id)) {
        try {
          await userbotManager.startUserbot(u.telegram_id, u.session_string);
          await updateUserbotStatus(u.telegram_id, 1);
        } catch (_) { /* ignore */ }
      }
    }
    return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
  }

  if (action === 'admin_restart_bot_confirm') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx,
      `<h3>⚠️ Konfirmasi Restart Master Bot</h3><p>Master Bot akan berhenti sesaat dan menunggu supervisor/PM2 menyalakannya kembali. Pastikan deployment memakai process supervisor.</p>`,
      { inline_keyboard: [[
        { text: '🔄 Ya, Restart', callback_data: 'rich:admin_restart_bot' },
        { text: 'Batal', callback_data: 'rich:admin_fleet' },
      ]] },
      { edit: true }
    );
  }

  if (action === 'admin_restart_bot') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery({ text: '🔄 Merestart Master Bot...' });
    await ctx.replyWithRichMessage({ html: '<h3>🔄 Master Bot sedang direstart...</h3><p>Layanan akan kembali aktif dalam beberapa detik melalui PM2.</p>' });
    setTimeout(() => { process.exit(0); }, 1000);
    return;
  }

  if (action === 'admin_subs') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx), { edit: true });
  }

  if (action === 'admin_backup') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminBackup(), keyboardAdminBackup(), { edit: true });
  }

  if (action === 'admin_download_backup') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery({ text: '📦 Menyiapkan file backup...' });
    try {
      const users = await UserbotModel.find({}).lean();
      const backupData = JSON.stringify(users, null, 2);
      const filename = `backup_admin_${Date.now()}.json`;
      fs.writeFileSync(filename, backupData);
      await ctx.replyWithDocument(new InputFile(filename, `delta_backup_${Date.now()}.json`), {
        caption: `📦 <b>Backup Database MongoDB</b>\nTotal: ${users.length} userbot terdaftar.\nTanggal: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
        parse_mode: 'HTML'
      });
      setTimeout(() => { try { fs.unlinkSync(filename); } catch { /* diabaikan */ } }, 60000);
    } catch (err) {
      await ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal membuat backup:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>` });
    }
    return;
  }

  if (action === 'admin_settings') {
    if (!isOwner(ctx)) {return;}
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelAdminSettings(), keyboardAdminSettings(), { edit: true });
  }

  if (action === 'admin_toggle_auto_approve') {
    if (!isOwner(ctx)) {return;}
    const cur = getSystemVarValue('AUTO_APPROVE', '0');
    const next = cur === '1' ? '0' : '1';
    await setSystemVar('AUTO_APPROVE', next);
    await ctx.answerCallbackQuery({ text: next === '1' ? '🌐 Mode: BUKA BEBAS (Auto-Approve)' : '🔒 Mode: BUTUH APPROVAL OWNER' });
    return sendRich(ctx, panelAdminSettings(), keyboardAdminSettings(), { edit: true });
  }

  return NOT_HANDLED;
}
