import crypto from 'crypto';
import fetch from 'node-fetch';
import config from '../config.js';
import { Logger } from '../utils/logger.js';
export async function createMidtransPayment(data) {
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
export function verifyMidtransSignature(payload, serverKey) {
    const { order_id, status_code, gross_amount, signature_key } = payload;
    const raw = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const expectedSignature = crypto.createHash('sha512').update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature_key), Buffer.from(expectedSignature));
}
export function mapMidtransStatus(payload) {
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
export async function createXenditInvoice(data) {
    const apiKey = config.xenditApiKey || process.env.XENDIT_API_KEY;
    const isProduction = config.xenditIsProduction || process.env.XENDIT_IS_PRODUCTION === 'true';
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
export function verifyXenditSignature(payload, callbackToken) {
    // Xendit sends X-CALLBACK-TOKEN header, compare with configured token
    // Implementation depends on Xendit webhook setup
    return true; // Implement based on Xendit docs
}
export function mapXenditStatus(payload) {
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
export async function createPaymentViaGateway(gateway, data) {
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
export async function handlePaymentWebhook(gateway, payload, headers) {
    switch (gateway) {
        case 'midtrans': {
            const mp = payload;
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
            const xp = payload;
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
export function generateOrderId(userId, planId) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `SUB-${userId}-${planId}-${timestamp}-${random}`.toUpperCase();
}
