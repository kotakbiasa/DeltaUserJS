import { Bot, Context, InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import {
  getActivePlans,
  getPlan,
  getUserSubscription,
  getUserPayments,
  initTrialSubscription,
  cancelAutoRenew,
  createPayment,
  getSubscriptionStats,
  updatePaymentStatus,
} from '../../services/SubscriptionService.js';
import { handlePaymentWebhook, createPaymentViaGateway, generateOrderId } from '../../services/PaymentGateway.js';
import { getUserVar } from '../../infrastructure/database.js';

const GRACE_PERIOD_DAYS = 3;

function formatPrice(price: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 }).format(price);
}

function formatDate(date: Date | null | undefined): string {
  if (!date) {return '—';}
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function getSubscriptionStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    active: '🟢',
    trial: '🟡',
    grace: '🟠',
    expired: '🔴',
    cancelled: '⚫',
  };
  return emojis[status] || '⚪';
}

/**
 * Main subscription menu
 */
export async function showSubscriptionMenu(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) {return;}

  const sub = await getUserSubscription(userId);
  const plans = await getActivePlans();

  let text = `<b>💳 MANAJEMEN LANGGANAN</b>\n\n`;

  if (sub) {
    text += `<blockquote>`;
    text += `${getSubscriptionStatusEmoji(sub.status)} <b>Status:</b> ${sub.status.toUpperCase()}\n`;
    text += `📦 <b>Paket:</b> ${sub.planId}\n`;
    text += `📅 <b>Mulai:</b> ${formatDate(sub.startDate)}\n`;
    text += `📅 <b>Berakhir:</b> ${formatDate(sub.endDate)}\n`;
    if (sub.graceEndDate) {
      text += `⏳ <b>Grace Period:</b> ${formatDate(sub.graceEndDate)}\n`;
    }
    text += `🔄 <b>Auto-renew:</b> ${sub.autoRenew ? 'Ya' : 'Tidak'}\n`;
    text += `</blockquote>\n\n`;
  } else {
    text += `<blockquote>❌ Belum ada langganan aktif. Trial 3 hari gratis tersedia untuk user baru.</blockquote>\n\n`;
  }

  text += `<b>📋 PAKET TERSEDIA:</b>\n`;

  const keyboard = new InlineKeyboard();

  for (const plan of plans) {
    const priceText = plan.price === 0 ? 'Gratis' : formatPrice(plan.price);
    const durationText = plan.durationDays === 0 ? 'Lifetime' : `${plan.durationDays} hari`;
    const trialText = plan.trialDays > 0 ? ` (Trial ${plan.trialDays} hari)` : '';

    text += `• <b>${plan.name}</b> — ${priceText}/${durationText}${trialText}\n`;
    text += `  ${plan.features.join(', ')}\n`;

    keyboard.text(`💰 Beli ${plan.name}`, `sub:buy:${plan._id}`).row();
  }

  if (sub && sub.status !== 'cancelled') {
    keyboard.text('🔄 Perpanjang', 'sub:renew').row();
    keyboard.text('❌ Batalkan Auto-renew', `sub:cancel_autorenew`).row();
  }

  keyboard.text('📜 Riwayat Pembayaran', 'sub:history').row();
  keyboard.text('❓ Bantuan', 'sub:help').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Handle subscription callback queries
 */
export function registerSubscriptionHandlers(bot: Bot) {
  // Show subscription menu
  bot.callbackQuery('sub:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSubscriptionMenu(ctx);
  });

  // Buy plan
  bot.callbackQuery(/^sub:buy:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const planId = ctx.match[1];
    const userId = ctx.from?.id;
    if (!userId) {return;}

    const plan = await getPlan(planId);
    if (!plan) {
      await ctx.reply('❌ Paket tidak ditemukan.');
      return;
    }

    if (plan.price === 0) {
      // Free trial
      await initTrialSubscription(userId);
      await ctx.reply(`✅ Trial ${plan.name} diaktifkan untuk ${plan.trialDays} hari!`);
      return;
    }

    // Create payment
    const orderId = generateOrderId(userId, planId);
    const userEmail = `${userId}@telegram.local`; // fallback
    const userPhone = getUserVar(userId, 'PHONE') || undefined;

    try {
      const _payment = await createPayment({
        userId,
        planId,
        amount: plan.price,
        currency: 'IDR',
        gateway: 'midtrans',
        metadata: { orderId },
      });

      const result = await createPaymentViaGateway('midtrans', {
        orderId,
        amount: plan.price,
        userId,
        userEmail,
        userPhone,
        itemName: `Langganan ${plan.name}`,
      });

      await ctx.reply(
        `<b>💳 PEMBAYARAN ${plan.name.toUpperCase()}</b>\n\n` +
        `📦 Paket: ${plan.name}\n` +
        `💰 Harga: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(plan.price)}\n` +
        `⏰ Expired: 30 menit\n\n` +
        `<a href="${result.paymentUrl}">👉 BAYAR SEKARANG VIA MIDTRANS</a>\n\n` +
        `<i>Setelah bayar, langganan otomatis aktif. Cek status di menu ini.</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .url('💳 Bayar Sekarang', result.paymentUrl)
            .row()
            .text('🔄 Cek Status', 'sub:menu')
            .row(),
        }
      );
    } catch (err) {
      Logger.logSystem(`Payment creation failed: ${err}`, 'ERROR');
      await ctx.reply('❌ Gagal membuat pembayaran. Coba lagi nanti.');
    }
  });

  // Renew subscription
  bot.callbackQuery('sub:renew', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) {return;}

    const sub = await getUserSubscription(userId);
    if (!sub) {
      await ctx.reply('❌ Tidak ada langganan untuk diperpanjang.');
      return;
    }

    const plan = await getPlan(sub.planId);
    if (!plan) {
      await ctx.reply('❌ Paket tidak ditemukan.');
      return;
    }

    // Same flow as buy
    const orderId = generateOrderId(userId, plan._id);
    const userEmail = `${userId}@telegram.local`;

    try {
      await createPayment({
        userId,
        planId: plan._id,
        amount: plan.price,
        currency: 'IDR',
        gateway: 'midtrans',
        metadata: { orderId, isRenewal: true },
      });

      const result = await createPaymentViaGateway('midtrans', {
        orderId,
        amount: plan.price,
        userId,
        userEmail,
        itemName: `Perpanjangan ${plan.name}`,
      });

      await ctx.reply(
        `<b>🔄 PERPANJANGAN ${plan.name.toUpperCase()}</b>\n\n` +
        `💰 Harga: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(plan.price)}\n` +
        `⏰ Expired: 30 menit\n\n` +
        `<a href="${result.paymentUrl}">👉 BAYAR SEKARANG</a>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .url('💳 Bayar Perpanjangan', result.paymentUrl)
            .row()
            .text('🔄 Cek Status', 'sub:menu')
            .row(),
        }
      );
    } catch (err) {
      Logger.logSystem(`Renewal payment failed: ${err}`, 'ERROR');
      await ctx.reply('❌ Gagal membuat pembayaran perpanjangan.');
    }
  });

  // Cancel auto-renew
  bot.callbackQuery('sub:cancel_autorenew', async (ctx) => {
    await ctx.answerCallbackQuery('Auto-renew dibatalkan');
    const userId = ctx.from?.id;
    if (!userId) {return;}

    await cancelAutoRenew(userId, 'User cancelled via bot');
    await ctx.reply('✅ Auto-renew dibatalkan. Langganan tetap aktif hingga tanggal berakhir.');
  });

  // Payment history
  bot.callbackQuery('sub:history', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) {return;}

    const payments = await getUserPayments(userId, 10);

    if (payments.length === 0) {
      await ctx.reply('📭 Belum ada riwayat pembayaran.');
      return;
    }

    let text = `<b>📜 RIWAYAT PEMBAYARAN</b>\n\n`;
    for (const p of payments) {
      const statusEmoji = {
        paid: '✅',
        failed: '❌',
        pending: '⏳',
        expired: '⏰',
        refunded: '🔄',
        cancelled: '⚫',
      }[p.status] || '❓';

      text += `${statusEmoji} <b>${p.planId}</b> — ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(p.amount)}\n`;
      text += `   Status: ${p.status.toUpperCase()} | ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(p.createdAt)}\n`;
      if (p.paidAt) {text += `   Dibayar: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(p.paidAt)}\n`;}
      text += `\n`;
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔙 Kembali', 'sub:menu').row(),
    });
  });

  // Help
  bot.callbackQuery('sub:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `<b>❓ BANTUAN LANGGANAN</b>\n\n` +
      `<b>🆓 Trial Gratis:</b> 3 hari full features untuk user baru\n` +
      `<b>💳 Pembayaran:</b> Via Midtrans (VA, E-Wallet, QRIS, CC)\n` +
      `<b>⏰ Aktivasi:</b> Otomatis setelah pembayaran sukses\n` +
      `<b>⏳ Grace Period:</b> ${GRACE_PERIOD_DAYS} hari setelah expired\n` +
      `<b>🔄 Auto-renew:</b> Otomatis perpanjang (bisa dimatikan)\n` +
      `<b>📞 Bantuan:</b> Hubungi owner via /start`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔙 Kembali', 'sub:menu').row(),
      }
    );
  });

  // Owner: Subscription stats
  bot.command('substats', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}
    const stats = await getSubscriptionStats();
    await ctx.reply(
      `<b>📊 STATISTIK LANGGANAN</b>\n\n` +
      `👥 Total User: ${stats.total}\n` +
      `🟢 Aktif: ${stats.active}\n` +
      `🟡 Trial: ${stats.trial}\n` +
      `🟠 Grace: ${stats.grace}\n` +
      `🔴 Expired: ${stats.expired}\n` +
      `⚫ Cancelled: ${stats.cancelled}\n\n` +
      `💰 Total Revenue: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(stats.totalRevenue)}\n\n` +
      `<b>Revenue per Paket:</b>\n` +
      stats.revenueByPlan.map(r => `• ${r._id}: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(r.total)} (${r.count}x)`).join('\n') +
      `\n\n<b>Bulanan (12 bln):</b>\n` +
      stats.monthlyRevenue.slice(-6).map(m => `• ${m._id}: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(m.total)}`).join('\n'),
      { parse_mode: 'HTML' }
    );
  });

  // Owner: List all subscriptions
  bot.command('sublist', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}
    // Implementation for listing all subscriptions with pagination
    await ctx.reply('📋 Fitur dalam pengembangan. Gunakan dashboard web untuk melihat daftar lengkap.');
  });
}

/**
 * Webhook endpoints for payment gateways
 */
export async function handleMidtransWebhook(payload: any, headers: Record<string, string>) {
  const result = await handlePaymentWebhook('midtrans', payload, headers);
  if (!result) {return { success: false, message: 'Invalid signature' };}

  const { orderId, status } = result;
  Logger.logSystem(`Midtrans webhook: ${orderId} -> ${status}`, 'INFO');

  if (status === 'paid') {
    // Find payment by externalId
    const { PaymentModel } = await import('../../infrastructure/subscriptionModels.js');
    const payment = await PaymentModel.findOne({ externalId: orderId });
    if (payment && payment.status !== 'paid') {
      await updatePaymentStatus(orderId, { status: 'paid', payload, paidAt: new Date() });

      // Activate subscription
      const { activateSubscription, renewSubscription } = await import('../../services/SubscriptionService.js');
      const isRenewal = payment.metadata?.isRenewal;
      if (isRenewal) {
        await renewSubscription(payment.userId, payment.planId, payment._id.toString());
      } else {
        await activateSubscription(payment.userId, payment.planId, payment._id.toString());
      }

      // Notify user
      // TODO: send notification via bot
    }

    return { success: true };
  }

  if (status === 'failed' || status === 'expired') {
    await updatePaymentStatus(orderId, { status, payload });
    return { success: true };
  }

  return { success: false, message: 'Unhandled status' };
}

export async function handleXenditWebhook(payload: any, headers: Record<string, string>) {
  const result = await handlePaymentWebhook('xendit', payload, headers);
  if (!result) {return { success: false, message: 'Invalid signature' };}

  const { orderId, status } = result;
  Logger.logSystem(`Xendit webhook: ${orderId} -> ${status}`, 'INFO');

  // Similar handling as Midtrans
  return { success: true };
}