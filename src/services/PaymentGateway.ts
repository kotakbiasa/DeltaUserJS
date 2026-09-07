import crypto from 'crypto';
import fetch from 'node-fetch';
import config from '../config.js';
import { Logger } from '../utils/logger.js';

// ==========================================
// MIDTRANS INTEGRATION
// ==========================================

interface MidtransSnapResponse {
  token: string;
  redirect_url: string;
}

interface MidtransNotificationPayload {
  order_id: string;
  status_code: string;
  transaction_status: 'capture' | 'settlement' | 'pending' | 'deny' | 'cancel' | 'expire' | 'refund';
  fraud_status: 'accept' | 'challenge' | 'deny';
  payment_type: string;
  gross_amount: string;
  transaction_time: string;
  transaction_id: string;
  signature_key: string;
  status_message: string;
  [key: string]: any;
}

export async function createMidtransPayment(data: {
  orderId: string;
  amount: number;
  userId: number;
  userEmail: string;
  userPhone?: string;
  itemName: string;
  callbackUrl?: string;
}): Promise<MidtransSnapResponse> {
  const serverKey = config.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
  const isProduction = config.midtransIsProduction || process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const baseUrl = isProduction
    ? 'https://app.midtrans.com/snap/v1'
    : 'https://app.sandbox.midtrans.com/snap/v1';

  if (!serverKey) {
    throw new Error('Midtrans Server Key not configured');
  }

  const payload = {
    transaction_details: {
      order_id: data.orderId,
      gross_amount: data.amount,
    },
    customer_details: {
      first_name: `User${data.userId}`,
      email: data.userEmail,
      phone: data.userPhone || '',
    },
    item_details: [{
      id: data.orderId,
      price: data.amount,
      quantity: 1,
      name: data.itemName,
    }],
    callbacks: {
      finish: data.callbackUrl || `${config.appUrl}/payment/finish`,
      error: `${config.appUrl}/payment/error`,
      pending: `${config.appUrl}/payment/pending`,
    },
    expiry: {
      unit: 'minute',
      duration: 30,
    },
  };

  const auth = Buffer.from(`${serverKey}:`).toString('base64');

  const response = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Midtrans error: ${response.status} ${error}`);
  }

  return response.json();
}

export function verifyMidtransSignature(payload: MidtransNotificationPayload, serverKey: string): boolean {
  const { order_id, status_code, gross_amount, signature_key } = payload;
  const raw = `${order_id}${status_code}${gross_amount}${serverKey}`;
  const expectedSignature = crypto.createHash('sha512').update(raw).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature_key),
    Buffer.from(expectedSignature)
  );
}

export function mapMidtransStatus(payload: MidtransNotificationPayload): 'paid' | 'failed' | 'expired' | 'pending' {
  const { transaction_status, fraud_status } = payload;

  if (transaction_status === 'capture' || transaction_status === 'settlement') {
    return fraud_status === 'accept' ? 'paid' : 'pending'; // challenge = manual review
  }
  if (transaction_status === 'pending') {
    return 'pending';
  }
  if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
    return 'failed';
  }
  if (transaction_status === 'refund') {
    return 'failed'; // refunded = treat as failed for subscription
  }
  return 'pending';
}

// ==========================================
// XENDIT INTEGRATION
// ==========================================

interface XenditInvoiceResponse {
  id: string;
  external_id: string;
  user_id: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'SETTLED' | 'FAILED';
  amount: number;
  fee: number;
  amount_paid: number;
  invoice_url: string;
  expiry_date: string;
  created: string;
  updated: string;
  payment_method: string;
  payment_channel: string;
  payment_destination: string;
  paid_at: string;
  [key: string]: any;
}

interface XenditCallbackPayload {
  id: string;
  external_id: string;
  user_id: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'SETTLED' | 'FAILED';
  amount: number;
  fee: number;
  amount_paid: number;
  invoice_url: string;
  expiry_date: string;
  created: string;
  updated: string;
  payment_method: string;
  payment_channel: string;
  payment_destination: string;
  paid_at: string;
  [key: string]: any;
}

export async function createXenditInvoice(data: {
  externalId: string;
  amount: number;
  userId: number;
  userEmail: string;
  userPhone?: string;
  description: string;
  callbackUrl?: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
}): Promise<XenditInvoiceResponse> {
  const apiKey = config.xenditApiKey || process.env.XENDIT_API_KEY;
  const _isProduction = config.xenditIsProduction || process.env.XENDIT_IS_PRODUCTION === 'true';

  if (!apiKey) {
    throw new Error('Xendit API Key not configured');
  }

  const payload = {
    external_id: data.externalId,
    amount: data.amount,
    payer_email: data.userEmail,
    description: data.description,
    callback_virtual_account_id: config.xenditCallbackVaId,
    success_redirect_url: data.successRedirectUrl || `${config.appUrl}/payment/success`,
    failure_redirect_url: data.failureRedirectUrl || `${config.appUrl}/payment/failed`,
    items: [{
      name: data.description,
      quantity: 1,
      price: data.amount,
      category: 'Digital Goods',
      url: config.appUrl,
    }],
    fees: [],
  };

  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  const response = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Xendit error: ${response.status} ${error}`);
  }

  return response.json();
}

export function verifyXenditSignature(_payload: XenditCallbackPayload, callbackToken: string): boolean {
  // Xendit mengirim header x-callback-token; bandingkan dengan token terkonfigurasi
  const expected = config.xenditCallbackToken || process.env.XENDIT_CALLBACK_TOKEN;
  if (!expected || !callbackToken) {return false;}
  return callbackToken === expected;
}

export function mapXenditStatus(payload: XenditCallbackPayload): 'paid' | 'failed' | 'expired' | 'pending' {
  const { status } = payload;

  switch (status) {
    case 'PAID':
    case 'SETTLED':
      return 'paid';
    case 'EXPIRED':
      return 'expired';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
    default:
      return 'pending';
  }
}

// ==========================================
// GENERIC PAYMENT FACTORY
// ==========================================

export type GatewayType = 'midtrans' | 'xendit' | 'manual' | 'trial';

export interface PaymentResult {
  paymentUrl: string;
  externalId: string;
  expiresAt: Date;
}

export async function createPaymentViaGateway(gateway: GatewayType, data: {
  orderId: string;
  amount: number;
  userId: number;
  userEmail: string;
  userPhone?: string;
  itemName: string;
  callbackUrl?: string;
}): Promise<PaymentResult> {
  switch (gateway) {
    case 'midtrans': {
      const result = await createMidtransPayment(data);
      return {
        paymentUrl: result.redirect_url,
        externalId: result.token,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      };
    }
    case 'xendit': {
      const result = await createXenditInvoice({
        ...data,
        externalId: data.orderId,
        description: data.itemName,
      });
      return {
        paymentUrl: result.invoice_url,
        externalId: result.id,
        expiresAt: new Date(result.expiry_date),
      };
    }
    case 'manual':
    case 'trial':
      return {
        paymentUrl: '',
        externalId: data.orderId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours for manual
      };
    default:
      throw new Error(`Unsupported gateway: ${gateway}`);
  }
}

export async function handlePaymentWebhook(gateway: GatewayType, payload: any, headers: Record<string, string>): Promise<{
  orderId: string;
  status: 'paid' | 'failed' | 'expired' | 'pending';
  payload: any;
} | null> {
  switch (gateway) {
    case 'midtrans': {
      const mp = payload as MidtransNotificationPayload;
      const serverKey = config.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
      if (!verifyMidtransSignature(mp, serverKey)) {
        Logger.logSystem('Midtrans signature verification failed', 'WARN');
        return null;
      }
      return {
        orderId: mp.order_id,
        status: mapMidtransStatus(mp),
        payload,
      };
    }
    case 'xendit': {
      const xp = payload as XenditCallbackPayload;
      const callbackToken = headers['x-callback-token'] || config.xenditCallbackToken;
      if (!verifyXenditSignature(xp, callbackToken)) {
        Logger.logSystem('Xendit signature verification failed', 'WARN');
        return null;
      }
      return {
        orderId: xp.external_id,
        status: mapXenditStatus(xp),
        payload,
      };
    }
    default:
      return null;
  }
}

// ==========================================
// HELPER: Generate Order ID
// ==========================================

export function generateOrderId(userId: number, planId: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `SUB-${userId}-${planId}-${timestamp}-${random}`.toUpperCase();
}