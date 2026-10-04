/**
 * Loop user dan entry point registrasi OTP/QR.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import { approveUser, hasAcceptedTerms, isApproved } from '../../../../state/approvedUsers.js';
import { getSystemVarValue, isOwner } from '../shared.js';
import { keyboardTermsOfService, keyboardUserLoops } from '../keyboards.js';
import { panelTermsOfService, panelUserLoops } from '../panels.js';
import { sendAccessDeniedRich, sendRich } from '../richRuntime.js';
import { stopLoop } from '../../../../../userbot/handlers/util/loop.js';
import { NOT_HANDLED } from './types.js';
import type { BotContext } from '../../../../context.js';

export async function handleMiscRoutes(ctx: BotContext) {
  const action = ctx.match[1];


  if (action === 'user_loops' || action.startsWith('user_loops:')) {
    await ctx.answerCallbackQuery();
    const page = Number(action.split(':')[1]) || 1;
    return sendRich(ctx, panelUserLoops(ctx, page), keyboardUserLoops(ctx, page), { edit: true });
  }

  if (action === 'add_loop') {
    await ctx.answerCallbackQuery();
    return ctx.conversation.enter('user-add-loop-conv');
  }

  if (action.startsWith('del_loop:')) {
    const encodedTarget = action.split(':')[1];
    let targetChat: string;
    try {
      // Keep old hex-encoded buttons valid while new menus use compact base64url.
      const legacyHex = /^[0-9a-f]+$/i.test(encodedTarget) && encodedTarget.length % 2 === 0;
      targetChat = Buffer.from(encodedTarget, legacyHex ? 'hex' : 'base64url').toString('utf8');
    } catch (_) {
      await ctx.answerCallbackQuery({ text: '❌ Target jadwal tidak valid.', show_alert: true });
      return;
    }
    const stopped = stopLoop(ctx.from.id, targetChat, true);
    await ctx.answerCallbackQuery({ text: stopped ? '⏹️ Jadwal loop dihentikan dan dihapus!' : 'Jadwal dihapus.' });
    return sendRich(ctx, panelUserLoops(ctx, 1), keyboardUserLoops(ctx, 1), { edit: true });
  }

  if (action === 'otp') {
    const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
    if (!isOwner(ctx) && !isApproved(ctx.from.id) && !autoApprove) {
      return sendAccessDeniedRich(ctx);
    }
    if (autoApprove && !isApproved(ctx.from.id)) {
      approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
    }
    if (!hasAcceptedTerms(ctx.from.id)) {
      return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
    }
    return ctx.conversation.enter('otp-reg');
  }

  if (action === 'qr') {
    const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
    if (!isOwner(ctx) && !isApproved(ctx.from.id) && !autoApprove) {
      return sendAccessDeniedRich(ctx);
    }
    if (autoApprove && !isApproved(ctx.from.id)) {
      approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
    }
    if (!hasAcceptedTerms(ctx.from.id)) {
      return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
    }
    return ctx.conversation.enter('qr-reg');
  }

  return NOT_HANDLED;
}
