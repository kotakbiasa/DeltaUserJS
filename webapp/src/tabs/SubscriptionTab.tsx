import React, { useState, useEffect } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { Crown, Ticket, Calendar, Zap, CheckCircle2, ShieldCheck, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { api, SubscriptionInfo } from '../api';
import { triggerHaptic } from '../telegram';

export const SubscriptionTab: React.FC = () => {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [voucherCode, setVoucherCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [banner, setBanner] = useState<{ isSuccess: boolean; text: string } | null>(null);

  const fetchSubscription = async () => {
    try {
      const res = await api.getSubscription();
      if (res.success) {
        setSub(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  const handleRedeem = async () => {
    if (!voucherCode.trim()) {
      triggerHaptic('warning');
      setBanner({ isSuccess: false, text: 'Masukkan kode voucher terlebih dahulu.' });
      return;
    }

    triggerHaptic('medium');
    setRedeeming(true);
    setBanner(null);

    try {
      const res = await api.redeemVoucher(voucherCode.trim().toUpperCase());
      if (res.success) {
        triggerHaptic('success');
        setBanner({ isSuccess: true, text: res.message || 'Selamat! Voucher berhasil ditukarkan.' });
        setVoucherCode('');
        await fetchSubscription();
      } else {
        triggerHaptic('error');
        setBanner({ isSuccess: false, text: res.message || 'Voucher tidak valid atau kuota habis.' });
      }
    } catch (err) {
      triggerHaptic('error');
      setBanner({ isSuccess: false, text: err instanceof Error ? err.message : 'Gagal klaim voucher.' });
    } finally {
      setRedeeming(false);
    }
  };

  if (loading && !sub) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  const isOwner = Boolean(sub?.isOwner);

  const plans = [
    {
      name: 'Paket 1 Bulan',
      price: 'Rp 25.000',
      duration: '30 Hari',
      badge: 'POPULAR',
      features: ['Akses 58+ Plugin Lengkap', 'FloodGuard Anti-Banned', 'Broadcast & Auto-Loop'],
      color: '#38bdf8',
    },
    {
      name: 'Paket 3 Bulan',
      price: 'Rp 65.000',
      duration: '90 Hari',
      badge: 'HEMAT 15%',
      features: ['Semua Fitur 1 Bulan', 'Prioritas Server High-Speed', 'Bebas Konsultasi Setup'],
      color: '#a855f7',
    },
    {
      name: 'Lifetime VIP',
      price: 'Rp 150.000',
      duration: 'Selamanya',
      badge: 'BEST VALUE',
      features: ['Akses Seumur Hidup', 'Bebas Perpanjangan', 'Dukungan Prioritas Owner'],
      color: '#f59e0b',
    },
  ];

  return (
    <div style={{ padding: '16px 16px 40px 16px', maxWidth: 600, margin: '0 auto' }}>
      {banner && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            background: banner.isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${banner.isSuccess ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            color: banner.isSuccess ? '#4ade80' : '#fca5a5',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {banner.isSuccess ? <Sparkles size={20} color="#22c55e" /> : <AlertCircle size={20} color="#ef4444" />}
          <span style={{ fontWeight: 600 }}>{banner.text}</span>
        </div>
      )}

      {/* Gold VIP Member Status Card */}
      <div className="vip-gold-card" style={{ padding: '22px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 18px rgba(245, 158, 11, 0.4)',
              }}
            >
              <Crown size={26} color="#000000" strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#fbbf24', opacity: 0.9 }}>
                Status Keanggotaan
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff' }}>
                {sub?.planName}
              </div>
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.25)',
              color: '#fef08a',
              border: '1px solid rgba(245, 158, 11, 0.5)',
            }}
          >
            {isOwner ? 'UNLIMITED' : sub?.daysLeft && sub.daysLeft > 0 ? 'AKTIF' : 'EXPIRED'}
          </span>
        </div>

        {/* Expiry Details */}
        <div style={{ paddingTop: 14, borderTop: '1px solid rgba(245, 158, 11, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
            <Calendar size={16} color="#f59e0b" />
            <span>
              {isOwner
                ? 'Masa Aktif: Selamanya (Owner)'
                : sub?.expiredAt
                ? `Kedaluwarsa: ${new Date(sub.expiredAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'Belum ada masa aktif'}
            </span>
          </div>

          {!isOwner && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: sub?.daysLeft && sub.daysLeft > 5 ? '#4ade80' : '#f87171',
              }}
            >
              {sub?.daysLeft ? `${sub.daysLeft} Hari Tersisa` : 'Masa Aktif Habis'}
            </span>
          )}
        </div>
      </div>

      {/* Voucher Code Box */}
      <div className="glass-card" style={{ padding: '18px 18px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Ticket size={20} color="#38bdf8" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>🎟️ Klaim Kode Voucher Promo</span>
        </div>
        <p style={{ margin: '0 0 14px 0', fontSize: 13, color: 'var(--tg-hint)', lineHeight: 1.4 }}>
          Masukkan kode voucher promosi untuk mengaktifkan atau menambah masa durasi userbot Anda secara cuma-cuma.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Contoh: PROMO-DELTA-2026"
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--tg-card-border)',
              color: 'var(--tg-text)',
              fontSize: 14,
              fontFamily: 'monospace',
              fontWeight: 700,
              textTransform: 'uppercase',
              outline: 'none',
            }}
          />
          <button
            onClick={handleRedeem}
            disabled={redeeming || !voucherCode.trim()}
            className="tap-effect"
            style={{
              padding: '0 20px',
              borderRadius: 12,
              border: 'none',
              background: !voucherCode.trim() ? 'rgba(255, 255, 255, 0.1)' : 'var(--tg-btn, #0284c7)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: !voucherCode.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 80,
            }}
          >
            {redeeming ? <Spinner size="s" /> : 'Klaim'}
          </button>
        </div>
      </div>

      {/* Pricing Upgrade Cards */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>💎 Pilihan Paket Perpanjangan</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map((p) => (
          <div
            key={p.name}
            className="glass-card tap-effect"
            style={{
              padding: '16px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}44` }}>
                  {p.badge}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tg-hint)' }}>
                Durasi: <b>{p.duration}</b> • Akses 58 Plugin
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: p.color }}>
                {p.price}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                via QRIS / Bank
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
