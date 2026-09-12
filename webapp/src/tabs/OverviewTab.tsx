import React, { useState, useEffect } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { Power, ShieldCheck, ShieldAlert, Cpu, Activity, Phone, Star, RefreshCw, Eye, EyeOff, CheckCircle2, Zap } from 'lucide-react';
import { api, UserMe, UserbotStatus } from '../api';
import { triggerHaptic } from '../telegram';

interface OverviewTabProps {
  user: UserMe | null;
  onRefreshUser: () => void;
  onStatusChange?: (online: boolean) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ user, onRefreshUser, onStatusChange }) => {
  const [status, setStatus] = useState<UserbotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setErrorMsg(null);
      const res = await api.getUserbotStatus();
      if (res.success) {
        setStatus(res);
        onStatusChange?.(res.connected);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat status userbot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (!status) return;
    triggerHaptic('medium');
    setToggling(true);
    try {
      const res = await api.toggleUserbot(!status.connected);
      if (res.success) {
        triggerHaptic(res.connected ? 'success' : 'warning');
        await fetchStatus();
        onRefreshUser();
      }
    } catch (err) {
      triggerHaptic('error');
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status daya userbot');
    } finally {
      setToggling(false);
    }
  };

  if (loading && !status) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  const isConnected = Boolean(status?.connected);
  const inFloodCooldown = Boolean(status?.floodGuard?.inCooldown);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}h ${h}j`;
    if (h > 0) return `${h}j ${m}m`;
    return `${m}m ${Math.floor(seconds % 60)}d`;
  };

  return (
    <div style={{ padding: '16px 16px 40px 16px', maxWidth: 600, margin: '0 auto' }}>
      {errorMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Hero Power & Connection Card */}
      <div
        className="glass-card"
        style={{
          padding: '24px 20px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 16,
          background: isConnected
            ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)'
            : 'linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
          borderColor: isConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }}
      >
        {/* Glow backdrop effect */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: isConnected ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }}
        />

        {/* Big Circular Power Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`tap-effect ${isConnected ? 'pulse-green' : 'pulse-red'}`}
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              border: `3px solid ${isConnected ? '#22c55e' : '#ef4444'}`,
              background: isConnected
                ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)'
                : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: isConnected
                ? '0 10px 28px rgba(34, 197, 94, 0.45)'
                : '0 10px 28px rgba(239, 68, 68, 0.45)',
              transition: 'all 0.3s ease',
            }}
          >
            {toggling ? (
              <Spinner size="m" />
            ) : (
              <Power size={40} strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* Connection Status Label */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: isConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: isConnected ? '#4ade80' : '#f87171' }}>
            {isConnected ? 'USERBOT ONLINE' : 'USERBOT OFFLINE'}
          </span>
        </div>

        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--tg-hint, #94a3b8)', lineHeight: 1.4 }}>
          {isConnected
            ? 'Semua 58 plugin otomatisasi aktif dan merespon perintah Telegram'
            : 'Userbot nonaktif. Ketuk tombol daya di atas untuk menyalakan'}
        </p>

        {/* Action Toggle Switch Button */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className="tap-effect"
          style={{
            width: '100%',
            maxWidth: 280,
            margin: '0 auto',
            padding: '12px 20px',
            borderRadius: 12,
            border: isConnected ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
            background: isConnected ? 'rgba(239, 68, 68, 0.15)' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: isConnected ? '#f87171' : '#ffffff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Power size={17} />
          <span>{isConnected ? 'Matikan Sesi Userbot' : 'Nyalakan Sesi Userbot'}</span>
        </button>
      </div>

      {/* FloodGuard Protection Status Banner */}
      {inFloodCooldown ? (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.08) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldAlert size={20} color="#f59e0b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>
              🛡️ FloodGuard: Mode Hibernasi Aktif
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.4, marginBottom: 8 }}>
              Telegram mendeteksi laju pesan tinggi. Akun dihibernasikan sementara untuk mencegah banned.
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.2)', fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
              ⏱️ {status?.floodGuard.remainingSeconds} Detik Tersisa
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ShieldCheck size={20} color="#22c55e" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#4ade80' }}>
            Proteksi FloodGuard Siaga
          </div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 700 }}>
            AMAN
          </span>
        </div>
      )}

      {/* 4 Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* Metric 1: Uptime */}
        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={15} color="#38bdf8" />
            </div>
            <span>Uptime Mesin</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
            {status ? formatUptime(status.uptime) : '-'}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Node.js runtime</div>
        </div>

        {/* Metric 2: Memory RAM */}
        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Cpu size={15} color="#a855f7" />
            </div>
            <span>Pemakaian RAM</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
            {status ? `${status.stats.memoryUsageMb} MB` : '-'}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Heap memory</div>
        </div>

        {/* Metric 3: Active Plugins */}
        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(34, 197, 94, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={15} color="#22c55e" />
            </div>
            <span>Modul Plugin</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>
            {status?.stats.pluginsCount || 58} Modul
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Siap digunakan</div>
        </div>

        {/* Metric 4: Telegram Engine */}
        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(234, 179, 8, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={15} color="#eab308" />
            </div>
            <span>MTProto Layer</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
            Layer 229
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Teleproto engine</div>
        </div>
      </div>

      {/* Account Info Card */}
      <div className="glass-card" style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📱 Detail Akun Telegram</span>
        </div>

        {/* Phone number row with show/hide spoiler */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Phone size={17} color="#38bdf8" />
            <span style={{ fontSize: 13, opacity: 0.8 }}>Nomor Telepon</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
              {status?.phone ? (showPhone ? status.phone : `${status.phone.substring(0, 5)}••••${status.phone.slice(-3)}`) : 'Belum ditautkan'}
            </span>
            {status?.phone && (
              <button
                onClick={() => setShowPhone(!showPhone)}
                className="tap-effect"
                style={{ background: 'none', border: 'none', color: 'var(--tg-hint)', cursor: 'pointer', padding: 2 }}
              >
                {showPhone ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Telegram Premium status row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Star size={17} color="#eab308" />
            <span style={{ fontSize: 13, opacity: 0.8 }}>Telegram Premium</span>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: user?.isPremium ? 'rgba(234, 179, 8, 0.18)' : 'rgba(255, 255, 255, 0.06)',
              color: user?.isPremium ? '#eab308' : 'inherit',
              border: user?.isPremium ? '1px solid rgba(234, 179, 8, 0.4)' : 'none',
            }}
          >
            {user?.isPremium ? '⭐ Ya (Premium)' : '⚪ Tidak (Reguler)'}
          </span>
        </div>

        {/* Telegram ID row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14 }}>🆔</span>
            <span style={{ fontSize: 13, opacity: 0.8 }}>Telegram ID</span>
          </div>
          <span className="code-pill">
            {user?.id || '-'}
          </span>
        </div>
      </div>
    </div>
  );
};
