import { PlanModel, PaymentModel, SubscriptionModel, AuditLogModel, DEFAULT_PLANS, PlanDoc, PaymentDoc, SubscriptionDoc } from '../infrastructure/subscriptionModels.js';
import config from '../config.js';
import { Logger } from '../utils/logger.js';
import { dbCache, persistField } from '../infrastructure/dbCore.js';
import { notifyUser, notifyOwner } from './notifyService.js';

const GRACE_PERIOD_DAYS = 3;
const TRIAL_PLAN_ID = 'trial';
const FULFILLMENT_LEASE_MS = 5 * 60 * 1000;

/**
 * Ensure default plans exist in database
 */
export async function seedDefaultPlans() {
  // Versi lama salah menyimpan rupiah dalam satuan sent sehingga paket
  // tampak 100× lebih mahal. Migrasikan hanya nilai persis dari seed lama;
  // harga yang sudah diubah owner tidak disentuh.
  const legacyPrices: Record<string, number> = {
    monthly: 5_000_000,
    quarterly: 13_500_000,
    yearly: 48_000_000,
    lifetime: 150_000_000,
  };

  for (const plan of DEFAULT_PLANS) {
    const existing = await PlanModel.findById(plan._id);
    if (!existing) {
      await PlanModel.create(plan);
      Logger.logSystem(`📦 Created default plan: ${plan._id} (${plan.name})`, 'INFO');
    } else if (legacyPrices[plan._id] === existing.price && plan.price !== existing.price) {
      await PlanModel.findByIdAndUpdate(plan._id, { price: plan.price, updatedAt: new Date() });
      Logger.logSystem(`📦 Corrected legacy price for default plan: ${plan._id}`, 'INFO');
    }
  }
}

/**
 * Get all active plans for display
 */
export async function getActivePlans(): Promise<PlanDoc[]> {
  return PlanModel.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
}

/**
 * Get plan by ID
 */
export async function getPlan(planId: string): Promise<PlanDoc | null> {
  return PlanModel.findById(planId).lean();
}

/**
 * Create or update a plan (owner only)
 */
export async function upsertPlan(data: Partial<PlanDoc> & { _id: string }) {
  const plan = await PlanModel.findByIdAndUpdate(
    data._id,
    { ...data, updatedAt: new Date() },
    { upsert: true, new: true, runValidators: true }
  );
  await logAudit('plan.upsert', 'plan', data._id, null, plan.toObject(), config.ownerId);
  return plan;
}

/**
 * Delete a plan (owner only)
 */
export async function deletePlan(planId: string) {
  // Check if any subscription uses this plan
  const subs = await SubscriptionModel.countDocuments({ planId });
  if (subs > 0) {
    throw new Error(`Cannot delete plan: ${subs} active subscriptions`);
  }
  await PlanModel.findByIdAndDelete(planId);
  await logAudit('plan.delete', 'plan', planId, null, null, config.ownerId);
}

/**
 * Create a new payment record
 */
export async function createPayment(data: {
  userId: number;
  planId: string;
  amount: number;
  currency?: string;
  gateway: 'midtrans' | 'xendit' | 'manual' | 'trial';
  externalId?: string;
  paymentUrl?: string;
  expiredAt?: Date;
  metadata?: any;
}): Promise<PaymentDoc> {
  const payment = await PaymentModel.create({
    ...data,
    currency: data.currency || 'IDR',
    status: 'pending',
    fulfillmentStatus: 'pending',
  });
  await logAudit('payment.create', 'payment', payment._id.toString(), null, payment.toObject(), data.userId);
  return payment;
}

/** Attach gateway checkout details to an existing pending payment. */
export async function attachPaymentCheckout(
  paymentId: string,
  data: { externalId: string; paymentUrl: string; expiresAt: Date }
): Promise<PaymentDoc | null> {
  return PaymentModel.findByIdAndUpdate(
    paymentId,
    {
      externalId: data.externalId,
      paymentUrl: data.paymentUrl,
      expiredAt: data.expiresAt,
      updatedAt: new Date(),
    },
    { new: true }
  );
}

/**
 * Update payment status (called from webhook)
 */
export async function updatePaymentStatus(externalId: string, data: {
  status: 'paid' | 'failed' | 'expired' | 'refunded' | 'cancelled';
  payload?: any;
  paidAt?: Date;
}): Promise<PaymentDoc | null> {
  const payment = await PaymentModel.findOneAndUpdate(
    data.status === 'paid'
      ? { externalId }
      : data.status === 'refunded'
        ? { externalId, status: 'paid' }
        : { externalId, status: { $ne: 'paid' } },
    {
      ...data,
      status: data.status,
      updatedAt: new Date(),
      paidAt: data.status === 'paid' ? (data.paidAt || new Date()) : undefined,
    },
    { new: true }
  );
  if (payment) {
    await logAudit('payment.status_update', 'payment', externalId, null, data, payment.userId);
  }
  return payment;
}

/**
 * Atomically claim a paid webhook so duplicate/concurrent notifications can
 * never activate or renew a subscription twice.
 */
export async function claimPaidPayment(
  externalId: string,
  payload: unknown,
  paidAt = new Date()
): Promise<PaymentDoc | null> {
  const staleBefore = new Date(paidAt.getTime() - FULFILLMENT_LEASE_MS);
  const payment = await PaymentModel.findOneAndUpdate(
    {
      externalId,
      status: { $ne: 'refunded' },
      fulfillmentStatus: { $ne: 'fulfilled' },
      $or: [
        { fulfillmentStatus: { $exists: false } },
        { fulfillmentStatus: 'pending' },
        { fulfillmentStatus: 'processing', fulfillmentClaimedAt: { $exists: false } },
        { fulfillmentStatus: 'processing', fulfillmentClaimedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        status: 'paid',
        fulfillmentStatus: 'processing',
        fulfillmentClaimedAt: paidAt,
        payload,
        paidAt,
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
  if (payment) {
    await logAudit(
      'payment.status_update',
      'payment',
      externalId,
      null,
      { status: 'paid', fulfillmentStatus: 'processing', paidAt },
      payment.userId
    );
  }
  return payment;
}

/** Mark a paid payment as fully activated/renewed. */
export async function markPaymentFulfilled(externalId: string): Promise<void> {
  await PaymentModel.updateOne(
    { externalId, status: 'paid', fulfillmentStatus: 'processing' },
    {
      $set: {
        fulfillmentStatus: 'fulfilled',
        fulfilledAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { fulfillmentClaimedAt: 1 },
    }
  );
}

/** Release a paid claim when fulfillment failed so a retry/recovery can run. */
export async function releasePaidPaymentClaim(externalId: string): Promise<void> {
  await PaymentModel.updateOne(
    { externalId, status: 'paid', fulfillmentStatus: 'processing' },
    {
      $set: { fulfillmentStatus: 'pending', updatedAt: new Date() },
      $unset: { fulfillmentClaimedAt: 1 },
    }
  );
}

/**
 * Get user's current subscription
 */
export async function getUserSubscription(userId: number): Promise<SubscriptionDoc | null> {
  return SubscriptionModel.findOne({ userId }).lean();
}

/**
 * Get user's payment history
 */
export async function getUserPayments(userId: number, limit = 20): Promise<PaymentDoc[]> {
  return PaymentModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Activate subscription after successful payment
 */
export async function activateSubscription(userId: number, planId: string, paymentId: string): Promise<SubscriptionDoc> {
  const alreadyActivated = await SubscriptionModel.findOne({ paymentId }).exec();
  if (alreadyActivated) {return alreadyActivated;}

  const currentSubscription = await SubscriptionModel.findOne({ userId }).lean();
  if (
    currentSubscription &&
    currentSubscription.planId !== planId &&
    ['active', 'trial', 'grace'].includes(currentSubscription.status)
  ) {
    throw new Error('Paket aktif berbeda tidak dapat ditimpa.');
  }

  const plan = await getPlan(planId);
  if (!plan) {throw new Error(`Plan ${planId} not found`);}

  const now = new Date();
  const endDate = plan.durationDays > 0
    ? new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    : null; // lifetime = no end date

  const graceEndDate = endDate
    ? new Date(endDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const subscription = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      userId,
      planId,
      paymentId,
      status: planId === TRIAL_PLAN_ID ? 'trial' : 'active',
      startDate: now,
      endDate,
      graceEndDate,
      autoRenew: false,
      lastPaymentAt: now,
      nextPaymentAt: endDate,
      cancelledAt: null,
      cancelReason: null,
      metadata: {},
    },
    { upsert: true, new: true, runValidators: true }
  );

  // Update userbot expired_at
  await updateUserbotExpiration(userId, endDate);

  await logAudit('subscription.activate', 'subscription', subscription._id.toString(), null, subscription.toObject(), userId);
  return subscription;
}

/**
 * Extend existing subscription (renewal)
 */
export async function renewSubscription(userId: number, planId: string, paymentId: string): Promise<SubscriptionDoc> {
  const alreadyRenewed = await SubscriptionModel.findOne({ paymentId }).exec();
  if (alreadyRenewed) {return alreadyRenewed;}

  const plan = await getPlan(planId);
  if (!plan) {throw new Error(`Plan ${planId} not found`);}

  const subscription = await SubscriptionModel.findOne({ userId });
  if (!subscription) {throw new Error('No existing subscription to renew');}
  if (subscription.planId !== planId) {throw new Error('Paket perpanjangan harus sama dengan paket aktif.');}

  const now = new Date();
  const baseDate = subscription.endDate && subscription.endDate > now ? subscription.endDate : now;
  const endDate = plan.durationDays > 0
    ? new Date(baseDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    : null;

  const graceEndDate = endDate
    ? new Date(endDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      planId,
      paymentId,
      status: 'active',
      endDate,
      graceEndDate,
      autoRenew: false,
      lastPaymentAt: now,
      nextPaymentAt: endDate,
      metadata: { ...subscription.metadata, lastRenewal: now },
    },
    { new: true }
  );

  await updateUserbotExpiration(userId, endDate);
  await logAudit('subscription.renew', 'subscription', subscription._id.toString(), subscription, updated.toObject(), userId);
  return updated;
}

/** Activate/renew a paid payment and persist the fulfillment state. */
export async function fulfillSubscriptionPayment(payment: PaymentDoc): Promise<void> {
  try {
    if (payment.metadata?.isRenewal) {
      await renewSubscription(payment.userId, payment.planId, payment._id.toString());
    } else {
      await activateSubscription(payment.userId, payment.planId, payment._id.toString());
    }
    await markPaymentFulfilled(payment.externalId as string);
  } catch (error) {
    await releasePaidPaymentClaim(payment.externalId as string).catch(() => undefined);
    throw error;
  }
}

/** Retry paid payments whose process died before fulfillment completed. */
export async function recoverPendingSubscriptionFulfillments(limit = 50): Promise<number> {
  const payments = await PaymentModel.find({
    status: 'paid',
    fulfillmentStatus: { $ne: 'fulfilled' },
  })
    .sort({ paidAt: 1 })
    .limit(Math.max(1, Math.min(100, limit)))
    .lean();

  let recovered = 0;
  for (const payment of payments) {
    if (!payment.externalId) {continue;}
    const claimed = await claimPaidPayment(payment.externalId, payment.payload, new Date());
    if (!claimed) {continue;}
    try {
      await fulfillSubscriptionPayment(claimed);
      recovered += 1;
    } catch (error) {
      Logger.logSystem(
        `Payment fulfillment recovery failed for ${payment.externalId}: ${error instanceof Error ? error.message : String(error)}`,
        'ERROR'
      );
    }
  }
  return recovered;
}

/**
 * Cancel auto-renew (keep active until endDate)
 */
export async function cancelAutoRenew(userId: number, reason?: string): Promise<SubscriptionDoc | null> {
  const subscription = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      autoRenew: false,
      cancelledAt: new Date(),
      cancelReason: reason || 'User cancelled',
    },
    { new: true }
  );

  if (subscription) {
    await logAudit('subscription.cancel_autorenew', 'subscription', subscription._id.toString(), null, { autoRenew: false, reason }, userId);
  }
  return subscription;
}

/**
 * Fully cancel subscription (immediate deactivate)
 */
export async function cancelSubscription(userId: number, reason?: string): Promise<SubscriptionDoc | null> {
  const subscription = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      status: 'cancelled',
      autoRenew: false,
      cancelledAt: new Date(),
      cancelReason: reason || 'User cancelled',
      endDate: new Date(), // immediate
    },
    { new: true }
  );

  if (subscription) {
    await updateUserbotExpiration(userId, new Date());
    await logAudit('subscription.cancel', 'subscription', subscription._id.toString(), null, { status: 'cancelled', reason }, userId);
  }
  return subscription;
}

/**
 * Check and handle expired subscriptions (called by expiration checker)
 */
export async function checkExpiredSubscriptions() {
  const now = new Date();

  // Find subscriptions that expired but still in grace period
  const inGrace = await SubscriptionModel.find({
    status: 'active',
    endDate: { $lt: now },
    graceEndDate: { $gt: now },
  }).lean();

  let graceCount = 0;
  for (const sub of inGrace) {
    const transitioned = await SubscriptionModel.findOneAndUpdate(
      { _id: sub._id, status: 'active' },
      { $set: { status: 'grace' } },
      { new: true }
    );
    if (!transitioned) {continue;}
    graceCount += 1;
    // Grace masih boleh memakai userbot sampai graceEndDate, bukan hanya endDate.
    await updateUserbotExpiration(sub.userId, sub.graceEndDate);
    await logAudit('subscription.grace_start', 'subscription', sub._id.toString(), { status: 'active' }, { status: 'grace' }, sub.userId);
    // Notify user: masa grace berjalan (userbot masih aktif sampai grace habis)
    const graceDays = sub.graceEndDate ? Math.max(1, Math.ceil((new Date(sub.graceEndDate).getTime() - now.getTime()) / 86400000)) : GRACE_PERIOD_DAYS;
    await notifyUser(sub.userId,
      `⚠️ <b>Masa aktif userbot kamu sudah habis</b>\n\n` +
      `<blockquote>Bot memasuki masa tenggang <b>${graceDays} hari</b>. ` +
      `Perpanjang sekarang agar userbot tidak dinonaktifkan otomatis.</blockquote>\n\n` +
      `Buka bot → Subscription untuk perpanjang.`);
    await notifyOwner(`📢 Subscription <code>${sub._id}</code> masuk masa tenggang (user <code>${sub.userId}</code>).`);
  }

  // Find subscriptions past grace period -> hard expire
  const expired = await SubscriptionModel.find({
    status: { $in: ['active', 'grace'] },
    $or: [
      { endDate: { $lt: now }, graceEndDate: { $lt: now } },
      { endDate: { $lt: now }, graceEndDate: null },
    ],
  }).lean();

  let expiredCount = 0;
  for (const sub of expired) {
    const transitioned = await SubscriptionModel.findOneAndUpdate(
      { _id: sub._id, status: { $in: ['active', 'grace'] } },
      { $set: { status: 'expired', autoRenew: false } },
      { new: true }
    );
    if (!transitioned) {continue;}
    expiredCount += 1;
    await updateUserbotExpiration(sub.userId, new Date()); // deactivate userbot
    await logAudit('subscription.expired', 'subscription', sub._id.toString(), { status: sub.status }, { status: 'expired' }, sub.userId);
    // Notify user: userbot dinonaktifkan otomatis
    await notifyUser(sub.userId,
      `🚫 <b>Userbot kamu dinonaktifkan</b>\n\n` +
      `<blockquote>Masa aktif dan masa tenggang sudah berakhir. ` +
      `Perpanjang subscription untuk mengaktifkan kembali userbot kamu.</blockquote>\n\n` +
      `Buka bot → Subscription untuk perpanjang.`);
    await notifyOwner(`🚫 Subscription <code>${sub._id}</code> expired — userbot user <code>${sub.userId}</code> dinonaktifkan.`);
  }

  // Handle trial expired
  const trialExpired = await SubscriptionModel.find({
    status: 'trial',
    endDate: { $lt: now },
  }).lean();

  let trialExpiredCount = 0;
  for (const sub of trialExpired) {
    const transitioned = await SubscriptionModel.findOneAndUpdate(
      { _id: sub._id, status: 'trial' },
      { $set: { status: 'expired', autoRenew: false } },
      { new: true }
    );
    if (!transitioned) {continue;}
    trialExpiredCount += 1;
    await updateUserbotExpiration(sub.userId, new Date());
    await logAudit('subscription.trial_expired', 'subscription', sub._id.toString(), { status: 'trial' }, { status: 'expired' }, sub.userId);
    // Notify user: trial habis
    await notifyUser(sub.userId,
      `⏰ <b>Trial userbot kamu berakhir</b>\n\n` +
      `<blockquote>Masa trial sudah habis dan userbot dinonaktifkan. ` +
      `Upgrade ke plan berbayar untuk melanjutkan.</blockquote>\n\n` +
      `Buka bot → Subscription untuk upgrade.`);
    await notifyOwner(`⏰ Trial <code>${sub._id}</code> expired (user <code>${sub.userId}</code>).`);
  }

  return { grace: graceCount, expired: expiredCount, trialExpired: trialExpiredCount };
}

/**
 * Get subscription stats for dashboard
 */
export async function getSubscriptionStats() {
  const [
    total,
    active,
    expired,
    trial,
    grace,
    cancelled,
    revenue,
  ] = await Promise.all([
    SubscriptionModel.countDocuments(),
    SubscriptionModel.countDocuments({ status: 'active' }),
    SubscriptionModel.countDocuments({ status: 'expired' }),
    SubscriptionModel.countDocuments({ status: 'trial' }),
    SubscriptionModel.countDocuments({ status: 'grace' }),
    SubscriptionModel.countDocuments({ status: 'cancelled' }),
    PaymentModel.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const totalRevenue = revenue[0]?.total || 0;

  // Revenue by plan
  const revenueByPlan = await PaymentModel.aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: '$planId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  // Monthly revenue (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const monthlyRevenue = await PaymentModel.aggregate([
    { $match: { status: 'paid', paidAt: { $gte: twelveMonthsAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    total,
    active,
    expired,
    trial,
    grace,
    cancelled,
    totalRevenue,
    revenueByPlan,
    monthlyRevenue,
  };
}

/**
 * Initialize trial subscription for new user
 */
export async function initTrialSubscription(userId: number): Promise<SubscriptionDoc> {
  const existing = await getUserSubscription(userId);
  if (existing) {return existing;}

  const plan = await getPlan(TRIAL_PLAN_ID);
  if (!plan) {throw new Error('Trial plan not configured');}

  const now = new Date();
  const endDate = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);

  const subscription = await SubscriptionModel.create({
    userId,
    planId: TRIAL_PLAN_ID,
    paymentId: null,
    status: 'trial',
    startDate: now,
    endDate,
    graceEndDate: new Date(endDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
    autoRenew: false,
    lastPaymentAt: null,
    nextPaymentAt: null,
    metadata: { isTrial: true },
  });

  await updateUserbotExpiration(userId, endDate);
  await markTrialClaimed(userId);
  await logAudit('subscription.trial_start', 'subscription', subscription._id.toString(), null, subscription.toObject(), userId);
  return subscription;
}

/**
 * Update userbot's expired_at in database
 */
async function updateUserbotExpiration(userId: number, endDate: Date | null) {
  const id = Number(userId);
  const cached = dbCache.get(id);
  if (cached) {cached.expired_at = endDate;}
  await persistField(id, 'expired_at', endDate)
    .catch(err => Logger.logSystem(`Failed to update userbot expiration: ${err}`, 'ERROR'));
}

export async function markTrialClaimed(userId: number): Promise<void> {
  const id = Number(userId);
  const cached = dbCache.get(id);
  const claimedAt = new Date();
  if (cached) {cached.trial_claimed_at = claimedAt;}
  await persistField(id, 'trial_claimed_at', claimedAt)
    .catch(err => Logger.logSystem(`Failed to mark trial as claimed: ${err}`, 'ERROR'));
}

/**
 * Audit log helper
 */
async function logAudit(
  action: string,
  resource: string,
  resourceId: string,
  before: any,
  after: any,
  actorId: number,
  userId?: number,
  metadata?: any
) {
  try {
    await AuditLogModel.create({
      userId: userId || actorId,
      actorId,
      action,
      resource,
      resourceId,
      before,
      after,
      metadata,
    });
  } catch (err) {
    Logger.logSystem(`Audit log failed: ${err}`, 'ERROR');
  }
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(filters: {
  userId?: number;
  actorId?: number;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}) {
  const query: any = {};

  if (filters.userId) {query.userId = filters.userId;}
  if (filters.actorId) {query.actorId = filters.actorId;}
  if (filters.action) {query.action = filters.action;}
  if (filters.resource) {query.resource = filters.resource;}
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {query.createdAt.$gte = filters.startDate;}
    if (filters.endDate) {query.createdAt.$lte = filters.endDate;}
  }

  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip(filters.skip || 0)
    .limit(filters.limit || 50)
    .lean();
}

/**
 * Export audit logs to CSV/JSON
 */
export async function exportAuditLogs(filters: {
  userId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const query = AuditLogModel.find({
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.startDate || filters.endDate ? {
      createdAt: {
        ...(filters.startDate && { $gte: filters.startDate }),
        ...(filters.endDate && { $lte: filters.endDate }),
      }
    } : {}),
  }).sort({ createdAt: -1 });

  if (filters.limit) {
    query.limit(filters.limit);
  }

  return query.lean();
}