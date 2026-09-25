import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown, Ticket, CalendarDays, CheckCircle2, Sparkles, AlertCircle, ShieldCheck, Zap, Server, Cpu,
  Smartphone, RefreshCw, CreditCard, History, XCircle,
} from 'lucide-react';
import { api, SubscriptionInfo, SubscriptionPayment, SubscriptionPlan } from '../api';
import { openPaymentLink, openTelegramUser, showConfirm, triggerHaptic } from '../telegram';
import { Card, SectionLabel, Banner, Skeleton, Badge, Bar, Toast, Spinner, formatDate, relativeTime } from '../ui';

interface SubscriptionTabProps {
  active?: boolean;
}

function formatPrice(price: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

function humanizeFeature(feature: string): string {
  const labels: Record<string, string> = {
    full_access: 'Akses fitur lengkap',
    basic_support: 'Dukungan dasar',
    priority_support: 'Dukungan prioritas',
    dedicated_support: 'Dukungan khusus owner',
    custom_prefix: 'Prefix Commands',
    analytics: 'Analitik lanjutan',
    custom_features: 'Permintaan fitur khusus',
  };
  return labels[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paymentTone(status: SubscriptionPayment['status']): 'ok' | 'warn' | 'danger' | 'muted' | 'info' {
  if (status === 'paid') {return 'ok';}
  if (status === 'pending') {return 'warn';}
  if (status === 'failed' || status === 'expired' || status === 'cancelled') {return 'danger';}
  if (status === 'refunded') {return 'info';}
  return 'muted';
}

export const SubscriptionTab: React.FC<SubscriptionTabProps> = ({ active = true }) => {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [availableGateways, setAvailableGateways] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<number | undefined>();
  const [buyingPlan, setBuyingPlan] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchSub = useCallback(async () => {
    const [subscriptionResult, planResult, paymentResult] = await Promise.allSettled([
      api.getSubscription(),
      api.getSubscriptionPlans(),
      api.getSubscriptionPayments(),
    ]);

    const errors: string[] = [];
    if (subscriptionResult.status === 'fulfilled' && subscriptionResult.value.success) {
      setSub(subscriptionResult.value);
    } else {
      errors.push('status langganan');
    }

    if (planResult.status === 'fulfilled' && planResult.value.success) {
      setPlans(planResult.value.plans || []);
      setAvailableGateways(planResult.value.availableGateways || []);
      setOwnerId(planResult.value.ownerId);
    } else {
      errors.push('daftar paket');
    }

    if (paymentResult.status === 'fulfilled' && paymentResult.value.success) {
      setPayments(paymentResult.value.payments || []);
    } else {
      errors.push('riwayat pembayaran');
    }

    setLoadError(
      errors.length > 0
        ? `Gagal memuat ${errors.join(', ')}. Data yang berhasil tetap ditampilkan.`
        : null
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchSub();
  }, [active, fetchSub]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      triggerHaptic('warning');
      setToast({ ok: false, text: 'Masukkan kode voucher terlebih dahulu.' });
      return;
    }
    triggerHaptic('medium');
    setRedeeming(true);
    try {
      const res = await api.redeemVoucher(trimmed.toUpperCase());
      if (res.success) {
        triggerHaptic('success');
        setToast({ ok: true, text: res.message || 'Voucher berhasil ditukarkan.' });
        setCode('');
        await fetchSub();
      } else {
        triggerHaptic('error');
        setToast({ ok: false, text: res.message || 'Voucher tidak valid.' });
      }
    } catch (err) {
      triggerHaptic('error');
      setToast({ ok: false, text: err instanceof Error ? err.message : 'Gagal klaim voucher.' });
    } finally {
      setRedeeming(false);
    }
  };

  const handlePurchase = async (plan: SubscriptionPlan) => {
    if (buyingPlan) {return;}
    const confirmed = await showConfirm(
      plan.price === 0
        ? `Aktifkan ${plan.name} sekarang?`
        : `Lanjut ke pembayaran ${plan.name} seh ${formatPrice(plan.price, plan.currency)}?`
    );
    if (!confirmed) {return;}

    triggerHaptic('medium');
    setBuyingPlan(plan.id);
    try {
      const response = await api.createSubscriptionCheckout(plan.id);
      triggerHaptic('success');
      if (response.paymentUrl) {
        setCheckoutUrl(response.paymentUrl);
        setToast({ ok: true, text: 'Checkout siap. Ketuk tombol lanjutkan pembayaran di bawah.' });
      } else {
        setToast({ ok: true, text: response.message || 'Paket berhasil diaktifkan.' });
      }
      await fetchSub();
    } catch (error) {
      triggerHaptic('error');
      setToast({
        ok: false,
        text: error instanceof Error ? error.message : 'Gagal membuat checkout.',
      });
    } finally {
      setBuyingPlan(null);
    }
  };

  const handleCancelAutoRenew = async () => {
    const confirmed = await showConfirm('Batalkan auto-renew? Paket tetap aktif sampai tanggal berakhir.');
    if (!confirmed) {return;}
    try {
      const response = await api.cancelSubscriptionAutoRenew();
      triggerHaptic('success');
      setToast({ ok: true, text: response.message });
      await fetchSub();
    } catch (error) {
      triggerHaptic('error');
      setToast({
        ok: false,
        text: error instanceof Error ? error.message : 'Gagal membatalkan auto-renew.',
      });
    }
  };

  if (loading && !sub) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={146} count={1} />
        <Skeleton height={142} count={1} />
        <Skeleton height={76} count={3} />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="page stack gap-12">
        <Banner tone="danger" icon={<AlertCircle size={17} />}>
          {loadError || 'Data langganan belum tersedia.'}
        </Banner>
        <button
          className="btn primary wide"
          onClick={() => {
            setLoading(true);
            fetchSub();
          }}
        >
          <RefreshCw size={16} /> Coba lagi
        </button>
      </div>
    );
  }

  const isOwner = Boolean(sub?.isOwner);
  const daysLeft = sub?.daysLeft ?? 0;
  const graceActive = Boolean(
    sub.status === 'grace' &&
    sub.graceEndDate &&
    new Date(sub.graceEndDate).getTime() > Date.now()
  );
  const isExpired = !isOwner && !graceActive && (Boolean(sub.isExpired) || daysLeft <= 0);
  const hasAccess = isOwner || Boolean(sub.isActive) || graceActive;
  const pct = isOwner
    ? 100
    : daysLeft <= 0
      ? 0
      : daysLeft >= 30
        ? 100
        : (daysLeft / 30) * 100;

  const statusTone = isOwner
    ? 'gold'
    : sub?.status === 'cancelled' || isExpired
      ? 'danger'
      : sub?.status === 'grace' || daysLeft <= 5
        ? 'warn'
        : sub?.status === 'trial'
          ? 'info'
          : 'ok';
  const statusText = isOwner
    ? 'Unlimited'
    : sub?.status === 'cancelled'
      ? 'Dibatalkan'
      : isExpired || sub?.status === 'expired'
        ? 'Kedaluwarsa'
        : sub?.status === 'grace'
          ? 'Masa tenggang'
          : sub?.status === 'trial'
            ? 'Trial'
            : 'Aktif';

  return (
    <div className="page stack gap-14">
      {toast && (
        <Toast tone={toast.ok ? 'ok' : 'err'}>
          {toast.ok ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span className="grow">{toast.text}</span>
        </Toast>
      )}

      {checkoutUrl && (
        <Banner tone="info" icon={<CreditCard size={17} />}>
          <div className="between gap-10">
            <span className="fs-12 grow">Pembayaran belum selesai. Buka checkout yang aman untuk melanjutkan.</span>
            <button
              className="btn primary sm"
              onClick={() => {
                if (!openPaymentLink(checkoutUrl)) {
                  setToast({ ok: false, text: 'URL checkout tidak valid atau tidak didukung.' });
                }
              }}
            >
              Lanjutkan
            </button>
          </div>
        </Banner>
      )}

      {loadError && (
        <Banner tone="warn" icon={<RefreshCw size={17} />}>
          <div className="between gap-10">
            <span className="fs-12 grow">{loadError}</span>
            <button className="btn ghost sm" onClick={() => { setLoading(true); fetchSub(); }}>
              <RefreshCw size={13} /> Ulangi
            </button>
          </div>
        </Banner>
      )}

      {/* ------------------------------- VIP ------------------------------- */}
      <section className="vip">
        <div className="between" style={{ position: 'relative', marginBottom: 16 }}>
          <div className="center gap-12">
            <span
              style={{
                width: 46, height: 46, borderRadius: 15, display: 'grid', placeItems: 'center',
                background: 'linear-gradient(140deg, var(--gold), #d99a00)', color: '#241a00',
                boxShadow: '0 8px 22px rgba(255, 201, 60, 0.34)',
              }}
            >
              <Crown size={24} strokeWidth={2.3} />
            </span>
            <div>
              <div className="fs-11 fw-8" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                Status keanggotaan
              </div>
              <div className="fs-13 fw-8" style={{ fontSize: 18 }}>{sub?.planName || 'Tidak ada paket'}</div>
            </div>
          </div>
          <Badge tone={statusTone as 'gold' | 'danger' | 'warn' | 'ok' | 'info'}>{statusText}</Badge>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="between fs-12 hint mb-12" style={{ marginBottom: 8 }}>
            <span className="center gap-6">
              <CalendarDays size={14} />
              {isOwner
                ? 'Masa aktif: selamanya'
                : sub?.status === 'grace' && sub.graceEndDate
                ? `Masa tenggang sampai ${formatDate(sub.graceEndDate)}`
                : sub?.expiredAt
                ? `Berakhir ${formatDate(sub.expiredAt)}`
                : 'Belum ada masa aktif'}
            </span>
            {!isOwner && (
              <span className="num fw-7" style={{ color: isExpired ? 'var(--danger)' : 'var(--tg-text)' }}>
                {sub?.isLifetime
                  ? 'Selamanya'
                  : sub?.status === 'grace'
                    ? `${sub.graceDaysLeft || 0} hari tenggang`
                    : `${daysLeft} hari`}
              </span>
            )}
          </div>
          <Bar pct={pct} />
          {!isOwner && sub?.expiredAt && (
            <div className="fs-11 hint mt-6">{relativeTime(sub.expiredAt)}</div>
          )}
        </div>
      </section>

      {/* ----------------------------- VOUCHER ----------------------------- */}
      <section>
        <SectionLabel><Ticket size={13} /> Klaim voucher</SectionLabel>
        <Card pad>
          <p className="fs-12 hint m-0 mb-12" style={{ lineHeight: 1.5 }}>
            Tukarkan kode promo untuk menambah masa aktif userbot tanpa biaya.
          </p>
          <div className="center gap-8">
            <input
              className="input mono fw-7"
              aria-label="Kode voucher"
              placeholder="PROMO-DELTA-2026"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn primary press shrink-0" style={{ width: 'auto' }} onClick={handleRedeem} disabled={redeeming || !code.trim()}>
              {redeeming ? <Spinner size={16} /> : 'Klaim'}
            </button>
          </div>
        </Card>
      </section>

      {/* ------------------------------ PLANS ------------------------------ */}
      <section>
        <SectionLabel
          right={
            <Badge tone={availableGateways.length > 0 ? 'ok' : 'warn'}>
              {availableGateways.length > 0 ? 'Checkout otomatis' : 'Manual owner'}
            </Badge>
          }
        >
          <Sparkles size={13} /> Paket perpanjangan
        </SectionLabel>
        <div className="stack gap-10">
          {plans.length === 0 ? (
            <Card pad>
              <div className="center fs-13 hint" style={{ minHeight: 72 }}>
                Belum ada paket yang dapat dibeli.
              </div>
            </Card>
          ) : (
            plans.map((plan, index) => {
              const accents = ['var(--info)', 'var(--violet)', 'var(--gold)', 'var(--ok)'];
              const accent = accents[index % accents.length];
              const duration = plan.durationDays === 0 ? 'Selamanya' : `${plan.durationDays} hari`;
              const label = plan.trialDays > 0
                ? `Trial ${plan.trialDays} hari`
                : plan.durationDays === 0
                  ? 'BEST VALUE'
                  : plan.durationDays >= 365
                    ? 'HEMAT'
                    : plan.durationDays >= 90
                      ? 'HEMAT'
                      : 'POPULER';
              const canCheckout = plan.price === 0 || availableGateways.length > 0;
              return (
                <article key={plan.id} className={`plan ${index === 1 ? 'featured' : ''}`}>
                  <div className="grow">
                    <div className="center gap-8 wrap" style={{ marginBottom: 5 }}>
                      <span className="row-title">{plan.name}</span>
                      <span
                        className="badge"
                        style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="fs-12 hint" style={{ lineHeight: 1.5 }}>
                      {plan.description || duration}
                    </div>
                    <div className="stack gap-6 mt-10">
                      {plan.features.slice(0, 4).map((feature) => (
                        <div key={feature} className="center gap-6 fs-12 op-75">
                          <CheckCircle2 size={13} style={{ color: accent, flexShrink: 0 }} />
                          <span>{humanizeFeature(feature)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="plan-purchase">
                    <div className="fw-8 num" style={{ fontSize: 16, color: accent }}>
                      {plan.price === 0 ? 'Gratis' : formatPrice(plan.price, plan.currency)}
                    </div>
                    <div className="fs-11 hint">{duration}</div>
                    {!isOwner && (
                      <button
                        className="btn primary sm mt-10"
                        aria-label={`${canCheckout ? 'Beli' : 'Hubungi owner untuk'} ${plan.name}`}
                        disabled={Boolean(buyingPlan)}
                        onClick={() => {
                          if (canCheckout) {
                            handlePurchase(plan);
                          } else if (ownerId) {
                            openTelegramUser(ownerId);
                          } else {
                            setToast({ ok: false, text: 'OWNER_ID belum dikonfigurasi.' });
                          }
                        }}
                      >
                        {buyingPlan === plan.id
                          ? <Spinner size={14} />
                          : canCheckout
                            ? <CreditCard size={14} />
                            : <ShieldCheck size={14} />}
                        {canCheckout ? (plan.price === 0 ? 'Aktifkan' : 'Beli') : 'Hubungi owner'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      {sub?.autoRenew && !isOwner && (
        <section>
          <Card pad>
            <div className="between gap-12">
              <div className="center gap-10" style={{ minWidth: 0 }}>
                <span className="row-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                  <RefreshCw size={17} />
                </span>
                <div>
                  <div className="row-title">Preferensi auto-renew</div>
                  <div className="fs-11 hint">Renewal belum ditagih otomatis; hubungi owner untuk perpanjangan.</div>
                </div>
              </div>
              <button className="btn ghost sm" onClick={handleCancelAutoRenew}>
                <XCircle size={14} /> Batalkan
              </button>
            </div>
          </Card>
        </section>
      )}

      {payments.length > 0 && (
        <section>
          <SectionLabel right={<Badge tone="muted">{payments.length}</Badge>}>
            <History size={13} /> Riwayat pembayaran
          </SectionLabel>
          <Card>
            {payments.map((payment) => (
              <div key={payment.id} className="row">
                <span className="row-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
                  <CreditCard size={16} />
                </span>
                <span className="row-body">
                  <span className="row-title" style={{ display: 'block' }}>{payment.planId}</span>
                  <span className="row-desc" style={{ display: 'block' }}>{formatDate(payment.createdAt)}</span>
                </span>
                <div style={{ textAlign: 'right' }}>
                  <div className="fs-13 fw-7 num">{formatPrice(payment.amount)}</div>
                  <Badge tone={paymentTone(payment.status)}>{payment.status}</Badge>
                  {payment.status === 'pending' && payment.paymentUrl && (
                    <button
                      className="btn primary sm mt-6"
                      aria-label={`Lanjutkan pembayaran ${payment.planId}`}
                      onClick={() => {
                        if (!openPaymentLink(payment.paymentUrl as string)) {
                          setToast({ ok: false, text: 'URL checkout tidak valid atau tidak didukung.' });
                        }
                      }}
                    >
                      Bayar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {!isOwner && availableGateways.length === 0 && ownerId && (
        <Banner tone="warn" icon={<AlertCircle size={17} />}>
          Payment gateway belum dikonfigurasi. Pilih “Hubungi owner” untuk transaksi manual.
        </Banner>
      )}

      {/* ---------------------------- ENTITLEMENT --------------------------- */}
      <section>
        <SectionLabel><ShieldCheck size={13} /> Hak akses akun</SectionLabel>
        <Card>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}><Zap size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Modul Plugin</span>
              <span className="row-desc" style={{ display: 'block' }}>Automation engine</span>
            </span>
            <Badge tone={hasAccess ? 'ok' : 'danger'}>{hasAccess ? 'Penuh' : 'Dibatasi'}</Badge>
          </div>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><Server size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Sesi Userbot</span>
              <span className="row-desc" style={{ display: 'block' }}>Koneksi MTProto</span>
            </span>
            <Badge tone={hasAccess ? 'ok' : 'danger'}>{hasAccess ? 'Aktif' : 'Nonaktif'}</Badge>
          </div>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><Smartphone size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Broadcast & Loop</span>
              <span className="row-desc" style={{ display: 'block' }}>Pengiriman massal</span>
            </span>
            <Badge tone={hasAccess ? 'ok' : 'danger'}>{hasAccess ? 'Terbuka' : 'Terkunci'}</Badge>
          </div>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}><Cpu size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Prioritas Resource</span>
              <span className="row-desc" style={{ display: 'block' }}>CPU & bandwidth</span>
            </span>
            <Badge tone={hasAccess ? 'ok' : 'muted'}>{isOwner ? 'VIP' : hasAccess ? 'Standar' : '—'}</Badge>
          </div>
        </Card>
      </section>

      {!hasAccess && !isOwner && (
        <Banner tone="warn" icon={<AlertCircle size={17} />}>
          {sub?.status === 'cancelled'
            ? 'Subscription dibatalkan. Pilih paket atau klaim voucher untuk mengaktifkan kembali.'
            : 'Masa aktif habis — klaim voucher atau pilih paket di atas untuk mengaktifkan kembali.'}
        </Banner>
      )}
    </div>
  );
};
