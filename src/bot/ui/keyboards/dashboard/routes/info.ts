/**
 * Statistik, panduan, help center, donasi.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import { keyboardBack, keyboardHelpBack, keyboardHelpCenter } from '../keyboards.js';
import { panelDonate, panelHelpCommands, panelHelpFaq, panelHelpQuickstart, panelQuickHelp, panelStats } from '../panels.js';
import { sendRich } from '../richRuntime.js';
import { NOT_HANDLED } from './types.js';
import type { BotContext } from '../../../../context.js';

export async function handleInfoRoutes(ctx: BotContext) {
  const action = ctx.match[1];

  if (action === 'stats') {return sendRich(ctx, panelStats(ctx), keyboardBack('main'), { edit: true });}

  if (action === 'guide') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelQuickHelp(ctx), keyboardHelpCenter(), { edit: true });
  }

  if (action === 'help_quickstart') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelHelpQuickstart(), keyboardHelpBack(), { edit: true });
  }

  if (action === 'help_commands') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelHelpCommands(ctx), keyboardHelpBack(), { edit: true });
  }

  if (action === 'help_faq') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelHelpFaq(), keyboardHelpBack(), { edit: true });
  }

  if (action === 'donate') {return sendRich(ctx, panelDonate(ctx), keyboardBack('main'), { edit: true });}

  return NOT_HANDLED;
}
