import mongoose from 'mongoose';

/**
 * Subscription Plans
 * Defines available subscription packages
 */
const planSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "monthly", "yearly", "lifetime"
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 }, // in smallest currency unit (IDR cents)
  currency: { type: String, default: 'IDR' },
  durationDays: { type: Number, required: true, min: 0 }, // 0 = lifetime
  features: [{ type: String }], // e.g., ["unlimited_bots", "priority_support", "custom_domain"]
  maxUserbots: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  trialDays: { type: Number, default: 0 }, // free trial period
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

planSchema.index({ isActive: 1, sortOrder: 1 });

/**
 * Payment Records
 * Tracks all payment attempts (successful, failed, pending, refunded)
 */
const paymentSchema = new mongoose.Schema({
  userId: { type: Number, required: true, index: true },
  planId: { type: String, required: true, index: true },
  amount: { type: Number, required: true }, // in smallest currency unit
  currency: { type: String, default: 'IDR' },
  gateway: { type: String, required: true, enum: ['midtrans', 'xendit', 'manual', 'trial'] },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled'],
    default: 'pending',
    index: true,
  },
  externalId: { type: String }, // Midtrans order_id, Xendit invoice_id (index dideklarasi manual di bawah, unique+sparse)
  paymentUrl: { type: String }, // checkout URL for user
  payload: { type: mongoose.Schema.Types.Mixed }, // raw webhook payload
  metadata: { type: mongoose.Schema.Types.Mixed }, // custom data
  paidAt: { type: Date },
  expiredAt: { type: Date },
  refundedAt: { type: Date },
  refundReason: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ externalId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ createdAt: -1 });

/**
 * User Subscriptions
 * Links users to their active/expired subscriptions
 */
const subscriptionSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true, index: true },
  planId: { type: String, required: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  status: {
    type: String,
    required: true,
    enum: ['active', 'expired', 'cancelled', 'trial', 'grace'],
    default: 'trial',
    index: true,
  },
  startDate: { type: Date, required: true, default: Date.now },
  endDate: { type: Date, required: true, index: true }, // when subscription expires
  graceEndDate: { type: Date }, // end of grace period
  autoRenew: { type: Boolean, default: true },
  lastPaymentAt: { type: Date },
  nextPaymentAt: { type: Date },
  cancelledAt: { type: Date },
  cancelReason: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 }); // for expiration checker
subscriptionSchema.index({ nextPaymentAt: 1, status: 1 }); // for auto-renew

/**
 * Audit Log
 * Tracks all important actions for compliance/debugging
 */
const auditLogSchema = new mongoose.Schema({
  userId: { type: Number, index: true }, // target user
  actorId: { type: Number, index: true }, // who performed action
  action: { type: String, required: true, index: true }, // e.g., "subscription.create", "user.ban"
  resource: { type: String, index: true }, // e.g., "subscription", "userbot", "plugin"
  resourceId: { type: String, index: true }, // ID of affected resource
  before: { type: mongoose.Schema.Types.Mixed }, // state before
  after: { type: mongoose.Schema.Types.Mixed }, // state after
  ip: { type: String },
  userAgent: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });

// Export models
export const PlanModel = (mongoose.models.Plan || mongoose.model('Plan', planSchema)) as mongoose.Model<any>;
export const PaymentModel = (mongoose.models.Payment || mongoose.model('Payment', paymentSchema)) as mongoose.Model<any>;
export const SubscriptionModel = (mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema)) as mongoose.Model<any>;
export const AuditLogModel = (mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema)) as mongoose.Model<any>;

// Types for TypeScript
export interface PlanDoc {
  _id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  maxUserbots: number;
  isActive: boolean;
  sortOrder: number;
  trialDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDoc {
  _id: mongoose.Types.ObjectId;
  userId: number;
  planId: string;
  amount: number;
  currency: string;
  gateway: 'midtrans' | 'xendit' | 'manual' | 'trial';
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'cancelled';
  externalId: string;
  paymentUrl: string;
  payload: any;
  metadata: any;
  paidAt?: Date;
  expiredAt?: Date;
  refundedAt?: Date;
  refundReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionDoc {
  _id: mongoose.Types.ObjectId;
  userId: number;
  planId: string;
  paymentId: mongoose.Types.ObjectId;
  status: 'active' | 'expired' | 'cancelled' | 'trial' | 'grace';
  startDate: Date;
  endDate: Date;
  graceEndDate?: Date;
  autoRenew: boolean;
  lastPaymentAt?: Date;
  nextPaymentAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogDoc {
  _id: mongoose.Types.ObjectId;
  userId?: number;
  actorId?: number;
  action: string;
  resource: string;
  resourceId?: string;
  before?: any;
  after?: any;
  ip?: string;
  userAgent?: string;
  metadata?: any;
  createdAt: Date;
}

/**
 * Default plans configuration
 */
export const DEFAULT_PLANS: Omit<PlanDoc, 'createdAt' | 'updatedAt'>[] = [
  {
    _id: 'trial',
    name: 'Trial Gratis',
    description: 'Coba gratis 3 hari, full features',
    price: 0,
    currency: 'IDR',
    durationDays: 3,
    features: ['full_access', '1_userbot', 'basic_support'],
    maxUserbots: 1,
    isActive: true,
    sortOrder: 0,
    trialDays: 3,
  },
  {
    _id: 'monthly',
    name: 'Bulanan',
    description: 'Langganan bulanan hemat',
    price: 5000000, // Rp 50.000
    currency: 'IDR',
    durationDays: 30,
    features: ['full_access', '3_userbot', 'priority_support', 'custom_prefix'],
    maxUserbots: 3,
    isActive: true,
    sortOrder: 1,
    trialDays: 0,
  },
  {
    _id: 'quarterly',
    name: 'Triwulanan (Hemat 10%)',
    description: 'Bayar 3 bulan sekaligus',
    price: 13500000, // Rp 135.000 (10% off)
    currency: 'IDR',
    durationDays: 90,
    features: ['full_access', '5_userbot', 'priority_support', 'custom_prefix', 'analytics'],
    maxUserbots: 5,
    isActive: true,
    sortOrder: 2,
    trialDays: 0,
  },
  {
    _id: 'yearly',
    name: 'Tahunan (Hemat 20%)',
    description: 'Bayar 1 tahun sekaligus, paling hemat',
    price: 48000000, // Rp 480.000 (20% off)
    currency: 'IDR',
    durationDays: 365,
    features: ['full_access', '10_userbot', 'priority_support', 'custom_prefix', 'analytics', 'dedicated_support'],
    maxUserbots: 10,
    isActive: true,
    sortOrder: 3,
    trialDays: 0,
  },
  {
    _id: 'lifetime',
    name: 'Lifetime (Sewa Hidup)',
    description: 'Bayar sekali, pakai selamanya',
    price: 150000000, // Rp 1.500.000
    currency: 'IDR',
    durationDays: 0, // 0 = unlimited
    features: ['full_access', 'unlimited_userbot', 'priority_support', 'custom_prefix', 'analytics', 'dedicated_support', 'custom_features'],
    maxUserbots: 999,
    isActive: true,
    sortOrder: 4,
    trialDays: 0,
  },
];