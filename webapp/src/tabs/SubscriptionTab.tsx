import React, { useState, useEffect } from 'react';
import { Card, Button, Spinner, Banner, Input, Cell, Section } from '@telegram-apps/telegram-ui';
import { Crown, Ticket, Calendar, Zap } from 'lucide-react';
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
        setBanner({ isSuccess: true, text: res.message || 'Voucher berhasil diklaim!' });
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

  return (
    <div style={{ padding: '12px 16px 80px 16px' }}>
      {banner && (
        <Banner
          type="section"
          header={banner.isSuccess ? 'Sukses' : 'Peringatan'}
          description={banner.text}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Subscription Status Card */}
      <Card
        type="plain"
        style={{
          padding: 20,
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(202, 138, 4, 0.05) 100%)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              backgroundColor: '#eab308',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Crown size={24} color="#000000" />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Paket Layanan Saat Ini</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{sub?.planName}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.8 }}>
            <Calendar size={16} />
            <span>
              {isOwner
                ? 'Masa Aktif: Selamanya (Owner)'
                : sub?.expiredAt
                ? `Kedaluwarsa: ${new Date(sub.expiredAt).toLocaleDateString('id-ID')}`
                : 'Belum berlangganan'}
            </span>
          </div>
          {!isOwner && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 6,
                background: sub?.daysLeft && sub.daysLeft > 5 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: sub?.daysLeft && sub.daysLeft > 5 ? '#22c55e' : '#ef4444',
              }}
            >
              {sub?.daysLeft ? `${sub.daysLeft} Hari Tersisa` : 'Kadaluwarsa'}
            </span>
          )}
        </div>
      </Card>

      {/* Voucher Code Card */}
      <Card type="plain" style={{ padding: 16, borderRadius: 14, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ticket size={20} color="#38bdf8" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Klaim Kode Voucher</h3>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: 13, opacity: 0.7 }}>
          Punya kode promo atau voucher gift? Masukkan kode untuk menambah masa aktif userbot instan!
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Input
              placeholder="Contoh: DELTA-PROMO-2026"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
            />
          </div>
          <Button
            mode="filled"
            loading={redeeming}
            disabled={!voucherCode.trim()}
            onClick={handleRedeem}
          >
            Klaim
          </Button>
        </div>
      </Card>

      {/* Available Plans Catalog */}
      <Section header="Pilihan Paket Perpanjangan">
        <Cell
          before={<Zap size={20} color="#38bdf8" />}
          description="Akses penuh 30 hari ke semua 58 plugin & anti-flood guard"
          after={
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
              Rp 25.000
            </span>
          }
        >
          Paket 1 Bulan
        </Cell>
        <Cell
          before={<Zap size={20} color="#a855f7" />}
          description="Akses hemat 90 hari + prioritas update fitur"
          after={
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
              Rp 65.000
            </span>
          }
        >
          Paket 3 Bulan
        </Cell>
        <Cell
          before={<Crown size={20} color="#eab308" />}
          description="Akses seumur hidup tanpa batas masa aktif"
          after={
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(234, 179, 8, 0.2)', color: '#eab308' }}>
              Rp 150.000
            </span>
          }
        >
          Paket Lifetime VIP
        </Cell>
      </Section>
    </div>
  );
};
