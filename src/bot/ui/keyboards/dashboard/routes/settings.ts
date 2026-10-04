/**
 * Pengaturan userbot: prefix, AFK, AntiPM, vars, hapus sesi.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import userbotManager from '../../../../../userbot/engine/manager.js';
import { Logger } from '../../../../../utils/logger.js';
import { deleteUserbot } from '../../../../../infrastructure/database.js';
import { keyboardDangerDelete, keyboardInlineHelper, keyboardPrefixPicker, keyboardSettings, keyboardUserbot, keyboardUserbotDiag } from '../keyboards.js';
import { openMain, sendRich, toggleUserbotSetting } from '../richRuntime.js';
import { panelDangerDelete, panelInlineHelper, panelPrefixPicker, panelSettings, panelUserbot, panelUserbotDiag } from '../panels.js';
import { setUserVar } from '../../../../../services/SystemVarService.js';
import { NOT_HANDLED } from './types.js';
import { errorMessage } from '../../../../../utils/errors.js';

export async function handleSettingsRoutes(ctx) {
  const action = ctx.match[1];

  if (action === 'settings') {return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx));}

  if (action === 'edit_name') {
    await ctx.answerCallbackQuery();
    return ctx.conversation.enter('custom-name-conv');
  }

  if (action === 'pick_prefix') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelPrefixPicker(ctx), keyboardPrefixPicker(), { edit: true });
  }

  if (action.startsWith('set_prefix:')) {
    const newPrefix = action.split(':')[1];
    await setUserVar(ctx.from.id, 'PREFIX', newPrefix);
    await ctx.answerCallbackQuery({ text: `✅ Prefix diubah ke: ${newPrefix}` });
    return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { edit: true });
  }

  if (action === 'setup_helper') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelInlineHelper(ctx), keyboardInlineHelper(), { edit: true });
  }

  if (action === 'ubot_diag') {
    await ctx.answerCallbackQuery({ text: 'Menguji koneksi MTProto...' });
    const diagHtml = await panelUserbotDiag(ctx);
    return sendRich(ctx, diagHtml, keyboardUserbotDiag(ctx), { edit: true });
  }

  if (action === 'toggle_anti_pm') {
    return toggleUserbotSetting(ctx, 'anti_pm', 'Anti-PM', panelSettings, keyboardSettings);
  }

  if (action === 'toggle_afk') {
    return toggleUserbotSetting(ctx, 'auto_reply', 'AFK', panelSettings, keyboardSettings);
  }

  if (action === 'toggle_anti_pm_ubot') {
    return toggleUserbotSetting(ctx, 'anti_pm', 'Anti-PM', panelUserbot, keyboardUserbot);
  }

  if (action === 'toggle_afk_ubot') {
    return toggleUserbotSetting(ctx, 'auto_reply', 'AFK', panelUserbot, keyboardUserbot);
  }

  if (action === 'edit_afk') {
    await ctx.answerCallbackQuery();
    return ctx.conversation.enter('afk-reason-conv');
  }

  if (action === 'edit_vars') {
    await ctx.answerCallbackQuery();
    return ctx.conversation.enter('manage-vars-conv');
  }

  if (action === 'danger_delete_session') {
    await ctx.answerCallbackQuery();
    return sendRich(ctx, panelDangerDelete(ctx), keyboardDangerDelete(), { edit: true });
  }

  if (action === 'confirm_delete_session') {
    await ctx.answerCallbackQuery('Menghapus sesi...');
    const telegramId = ctx.from.id;

    try {
      const ubot = userbotManager.clients.get(telegramId);
      if (ubot && ubot.client) {
        if (typeof ubot.client.logOut === 'function') {
          await ubot.client.logOut();
        } else if (typeof ubot.client.call === 'function') {
          await ubot.client.call({ _: 'auth.logOut' });
        }
      }
    } catch (e: unknown) {
      Logger.logUser(telegramId, `Failed to logout: ${errorMessage(e)}`, 'WARN');
    }

    if (userbotManager.isRunning(telegramId)) {
      await userbotManager.stopUserbot(telegramId);
    }
    await deleteUserbot(telegramId);
    await ctx.replyWithRichMessage({ html: `<p>🗑️ <b>Sesi dihapus permanen.</b></p>` });
    return openMain(ctx, { deleteOld: true });
  }

  return NOT_HANDLED;
}
