import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown, Ticket, CalendarDays, CheckCircle2, Sparkles, AlertCircle, ShieldCheck, Zap, Server, Cpu,
  Smartphone, RefreshCw,
} from 'lucide-react';
import { api, SubscriptionInfo } from '../api';
import { triggerHaptic } from '../telegram';
import { Card, SectionLabel, Banner, Skeleton, Badge, Bar, Toast, Spinner, formatDate, relativeTime } from '../ui';

interface SubscriptionTabProps {
  active?: boolean;
}

const PLANS = [
  {
    name: 'Paket 1 Bulan',
    price: 'Rp 25.000',
    duration: '30 hari',
    badge: 'POPULER',
    accent: 'var(--info)',
    features: ['Semua plugin aktif', 'FloodGuard anti-banned', 'Broadcast & auto-loop'],
  },
  {
    name: 'Paket 3 Bulan',
    price: 'Rp 65.000',
    duration: '90 hari',
    badge: 'HEMAT 15%',
    accent: 'var(--violet)',
    features: ['Semua fitur 1 bulan', 'Prioritas server', 'Bebas konsultasi setup'],
  },
  {
    name: 'Lifetime VIP',
    price: 'Rp 150.000',
    duration: 'Selamanya',
    badge: 'BEST VALUE',
    accent: 'var(--gold)',
    features: ['Akses seumur hidup', 'Tanpa perpanjangan', 'Dukungan prioritas owner'],
  },
];

export const SubscriptionTab: React.FC<SubscriptionTabProps> = ({ active = true }) => {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchSub = useCallback(async () => {
    try {
      const res = await api.getSubscription();
      if (res.success) setSub(res);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
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

  if (loading && !sub) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={146} count={1} />
        <Skeleton height={142} count={1} />
        <Skeleton height={76} count={3} />
      </div>
    );
  }

  const isOwner = Boolean(sub?.isOwner);
  const daysLeft = sub?.daysLeft ?? 0;
  const isExpired = Boolean(sub?.isExpired) || (!isOwner && daysLeft <= 0);
  const totalDays = 30;
  const pct = isOwner ? 100 : Math.max(0, Math.min(100, (daysLeft / totalDays) * 100));

  const statusTone = isOwner ? 'gold' : isExpired ? 'danger' : daysLeft <= 5 ? 'warn' : 'ok';
  const statusText = isOwner ? 'Unlimited' : isExpired ? 'Kedaluwarsa' : 'Aktif';

  return (
    <div className="page stack gap-14">
      {toast && (
        <Toast tone={toast.ok ? 'ok' : 'err'}>
          {toast.ok ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span className="grow">{toast.text}</span>
        </Toast>
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
          <Badge tone={statusTone as 'gold' | 'danger' | 'warn' | 'ok'}>{statusText}</Badge>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="between fs-12 hint mb-12" style={{ marginBottom: 8 }}>
            <span className="center gap-6">
              <CalendarDays size={14} />
              {isOwner
                ? 'Masa aktif: selamanya'
                : sub?.expiredAt
                ? `Berakhir ${formatDate(sub.expiredAt)}`
                : 'Belum ada masa aktif'}
            </span>
            {!isOwner && <span className="num fw-7" style={{ color: isExpired ? 'var(--danger)' : 'var(--tg-text)' }}>{daysLeft} hari</span>}
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
        <SectionLabel><Sparkles size={13} /> Paket perpanjangan</SectionLabel>
        <div className="stack gap-10">
          {PLANS.map((p) => (
            <div key={p.name} className={`plan ${p.badge === 'POPULER' ? 'featured' : ''}`}>
              <div className="grow">
                <div className="center gap-8 mb-12" style={{ marginBottom: 5 }}>
                  <span className="row-title">{p.name}</span>
                  <span
                    className="badge"
                    style={{ background: `color-mix(in srgb, ${p.accent} 15%, transparent)`, color: p.accent }}
                  >
                    {p.badge}
                  </span>
                </div>
                <div className="fs-12 hint" style={{ lineHeight: 1.5 }}>
                  {p.duration} · {p.features.length} keunggulan
                </div>
                <div className="stack gap-6 mt-10">
                  {p.features.map((f) => (
                    <div key={f} className="center gap-6 fs-12 op-75">
                      <CheckCircle2 size={13} style={{ color: p.accent, flexShrink: 0 }} />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="fw-8 num" style={{ fontSize: 16, color: p.accent }}>{p.price}</div>
                <div className="fs-11 hint">QRIS · Bank</div>
              </div>
            </div>
          ))}
        </div>
      </section>

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
            <Badge tone={isExpired ? 'danger' : 'ok'}>{isExpired ? 'Dibatasi' : 'Penuh'}</Badge>
          </div>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><Server size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Sesi Userbot</span>
              <span className="row-desc" style={{ display: 'block' }}>Koneksi MTProto</span>
            </span>
            <Badge tone={isExpired ? 'danger' : 'ok'}>{isExpired ? 'Nonaktif' : 'Aktif'}</Badge>
          </div>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><Smartphone size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Broadcast & Loop</span>
              <span className="row-desc" style={{ display: 'block' }}>Pengiriman massal</span>
            </span>
            <Badge tone={isExpired ? 'danger' : 'ok'}>{isExpired ? 'Terkunci' : 'Terbuka'}</Badge>
          </div>
          <div className="row">
            <span className="row-icon" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}><Cpu size={16} /></span>
            <span className="row-body">
              <span className="row-title" style={{ display: 'block' }}>Prioritas Resource</span>
              <span className="row-desc" style={{ display: 'block' }}>CPU & bandwidth</span>
            </span>
            <Badge tone={isOwner || daysLeft > 0 ? 'ok' : 'muted'}>{isOwner ? 'VIP' : daysLeft > 0 ? 'Standar' : '—'}</Badge>
          </div>
        </Card>
      </section>

      {isExpired && !isOwner && (
        <Banner tone="warn" icon={<AlertCircle size={17} />}>
          Masa aktif habis — klaim voucher atau pilih paket di atas untuk mengaktifkan kembali.
        </Banner>
      )}
    </div>
  );
};
