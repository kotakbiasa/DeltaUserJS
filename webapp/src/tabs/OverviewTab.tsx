import React, { useState, useEffect } from 'react';
import { Card, Button, Spinner, Cell, Section, List, Banner } from '@telegram-apps/telegram-ui';
import { Power, ShieldCheck, RefreshCw, Cpu, Activity, Phone, UserCheck, Star } from 'lucide-react';
import { api, UserMe, UserbotStatus } from '../api';
import { triggerHaptic } from '../telegram';

interface OverviewTabProps {
  user: UserMe | null;
  onRefreshUser: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ user, onRefreshUser }) => {
  const [status, setStatus] = useState<UserbotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setErrorMsg(null);
      const res = await api.getUserbotStatus();
      if (res.success) {
        setStatus(res);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat status userbot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
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
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status userbot');
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

  return (
    <List style={{ padding: '12px 16px 80px 16px' }}>
      {errorMsg && (
        <Banner
          type="section"
          header="Peringatan"
          description={errorMsg}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* FloodGuard Alert Banner */}
      {inFloodCooldown ? (
        <Banner
          type="section"
          header="🛡️ FloodGuard: Mode Hibernasi Aktif"
          description={`Telegram mendeteksi laju pesan tinggi. Userbot sengaja dihibernasikan selama ${status?.floodGuard.remainingSeconds} detik untuk mencegah banned.`}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            color: '#22c55e',
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 16,
          }}
        >
          <ShieldCheck size={18} />
          <span>Proteksi FloodGuard Siaga & Aman</span>
        </div>
      )}

      {/* Main Power & Status Card */}
      <Card
        type="plain"
        style={{
          padding: 20,
          borderRadius: 16,
          background: isConnected
            ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)'
            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.05) 100%)',
          border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          marginBottom: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: isConnected ? '#22c55e' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isConnected
                ? '0 0 24px rgba(34, 197, 94, 0.4)'
                : '0 0 24px rgba(239, 68, 68, 0.4)',
              transition: 'all 0.3s ease',
            }}
          >
            <Power size={32} color="#ffffff" />
          </div>
        </div>

        <h2 style={{ margin: '4px 0 2px 0', fontSize: 20, fontWeight: 700 }}>
          {isConnected ? 'Userbot Aktif & Online' : 'Userbot Offline'}
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, opacity: 0.7 }}>
          {isConnected
            ? 'Semua plugin otomatisasi berjalan normal'
            : 'Userbot dinonaktifkan sementara'}
        </p>

        <Button
          size="l"
          stretched
          mode={isConnected ? 'outline' : 'filled'}
          loading={toggling}
          onClick={handleToggle}
          style={{
            fontWeight: 600,
            color: isConnected ? '#ef4444' : undefined,
            borderColor: isConnected ? 'rgba(239, 68, 68, 0.5)' : undefined,
          }}
        >
          {isConnected ? 'Matikan Userbot' : 'Nyalakan Userbot'}
        </Button>
      </Card>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card type="plain" style={{ padding: 14, borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7, marginBottom: 4 }}>
            <Activity size={16} color="#38bdf8" />
            <span style={{ fontSize: 12 }}>Uptime Server</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {status ? `${Math.floor(status.uptime / 60)}m ${Math.floor(status.uptime % 60)}s` : '-'}
          </div>
        </Card>

        <Card type="plain" style={{ padding: 14, borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7, marginBottom: 4 }}>
            <Cpu size={16} color="#a855f7" />
            <span style={{ fontSize: 12 }}>Pemakaian RAM</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {status ? `${status.stats.memoryUsageMb} MB` : '-'}
          </div>
        </Card>
      </div>

      {/* Info Profil Akun */}
      <Section header="Informasi Akun Userbot">
        <Cell
          before={<Phone size={20} color="#38bdf8" />}
          description="Nomor Telegram terhubung"
        >
          {status?.phone || 'Belum terhubung'}
        </Cell>
        <Cell
          before={<UserCheck size={20} color="#22c55e" />}
          description="Nama Pemilik"
        >
          {user ? `${user.firstName} ${user.lastName}`.trim() : '-'}
        </Cell>
        <Cell
          before={<Star size={20} color="#eab308" />}
          description="Status Telegram Premium"
          after={
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 6,
                background: user?.isPremium ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                color: user?.isPremium ? '#eab308' : 'inherit',
              }}
            >
              {user?.isPremium ? '⭐ Premium' : 'Reguler'}
            </span>
          }
        >
          Akun Telegram
        </Cell>
        <Cell
          before={<RefreshCw size={20} color="#64748b" />}
          description="Total Plugin Tersedia"
          after={
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              {status?.stats.pluginsCount || 58} Modul
            </span>
          }
        >
          Library Ekstensi
        </Cell>
      </Section>
    </List>
  );
};
