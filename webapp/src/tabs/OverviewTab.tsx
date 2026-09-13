import React, { useState, useEffect, useCallback } from 'react';
import {
  Power, ShieldCheck, ShieldAlert, Cpu, Activity, Phone, Star, Eye, EyeOff, Zap, Server, Clock, Layers,
} from 'lucide-react';
import { api, UserMe, UserbotStatus } from '../api';
import { triggerHaptic } from '../telegram';
import {
  Card, SectionLabel, Row, Tile, Banner, Skeleton, Spinner, Badge,
  formatUptime, maskPhone,
} from '../ui';

interface OverviewTabProps {
  user: UserMe | null;
  onRefreshUser: () => void;
  onStatusChange?: (online: boolean) => void;
  active?: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ user, onRefreshUser, onStatusChange, active = true }) => {
  const [status, setStatus] = useState<UserbotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setErrorMsg(null);
      const res = await api.getUserbotStatus();
      if (res.success) {
        setStatus(res);
        onStatusChange?.(Boolean(res.connected));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat status userbot');
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    if (!active) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [active, fetchStatus]);

  const handleToggle = async () => {
    if (!status || toggling) return;
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
      <div className="page stack gap-12">
        <Skeleton height={236} count={1} />
        <div className="grid-2">
          <Skeleton height={78} count={2} />
        </div>
        <Skeleton height={188} count={1} />
      </div>
    );
  }

  const isConnected = Boolean(status?.connected);
  const inFlood = Boolean(status?.floodGuard?.inCooldown);
  const plugins = status?.stats?.pluginsCount ?? 0;

  return (
    <div className="page stack gap-14">
      {errorMsg && <Banner tone="danger" icon={<ShieldAlert size={17} />}>{errorMsg}</Banner>}

      {/* ------------------------------ HERO ------------------------------ */}
      <section className="hero stagger">
        <div
          className="hero-glow"
          style={{ background: isConnected ? 'var(--ok)' : 'var(--danger)' }}
        />

        <div className="center" style={{ justifyContent: 'center', marginBottom: 14 }}>
          <button
            className="power"
            data-on={isConnected}
            onClick={handleToggle}
            disabled={toggling}
            aria-label={isConnected ? 'Matikan userbot' : 'Nyalakan userbot'}
            style={{
              background: isConnected
                ? 'linear-gradient(140deg, #22c55e, #0f9d58)'
                : 'linear-gradient(140deg, #ff6b6b, #d92d20)',
              color: isConnected ? '#16a34a' : '#ef4444',
              boxShadow: isConnected
                ? '0 14px 34px rgba(34, 197, 94, 0.4)'
                : '0 14px 34px rgba(239, 68, 68, 0.36)',
            }}
          >
            <span style={{ color: '#fff', display: 'grid', placeItems: 'center' }}>
              {toggling ? <Spinner size={30} /> : <Power size={40} strokeWidth={2.5} />}
            </span>
          </button>
        </div>

        <div className={`status-pill ${isConnected ? 'ok' : 'off'}`}>
          <span className="dot" style={isConnected ? undefined : { background: 'var(--danger)', boxShadow: 'none' }} />
          {isConnected ? 'USERBOT ONLINE' : 'USERBOT OFFLINE'}
        </div>

        <p className="fs-13 hint m-0" style={{ lineHeight: 1.5, maxWidth: 300, margin: '0 auto 16px' }}>
          {isConnected
            ? 'Mesin otomatisasi aktif — semua modul merespon perintah Telegram Anda.'
            : 'Sesi nonaktif. Ketuk tombol daya untuk menghidupkan kembali.'}
        </p>

        <button
          className={`btn press ${isConnected ? 'danger' : 'primary'}`}
          style={{ maxWidth: 300, margin: '0 auto' }}
          onClick={handleToggle}
          disabled={toggling}
        >
          <Power size={17} />
          <span>{isConnected ? 'Matikan Sesi' : 'Nyalakan Sesi'}</span>
        </button>
      </section>

      {/* --------------------------- FLOODGUARD --------------------------- */}
      {inFlood ? (
        <Banner tone="warn" icon={<ShieldAlert size={17} />}>
          <div className="fw-7">FloodGuard: mode hibernasi</div>
          <div className="fs-12 op-75 mt-6" style={{ lineHeight: 1.45 }}>
            Telegram mendeteksi laju pesan tinggi. Sesi dijeda sementara untuk mencegah banned.
          </div>
          <div className="mt-10">
            <Badge tone="warn">⏱ {status?.floodGuard.remainingSeconds}s tersisa</Badge>
          </div>
        </Banner>
      ) : (
        <div className="banner ok">
          <ShieldCheck size={18} className="shrink-0" />
          <span className="grow fw-6 fs-13">Proteksi FloodGuard siaga</span>
          <Badge tone="ok">Aman</Badge>
        </div>
      )}

      {/* ---------------------------- METRICS ----------------------------- */}
      <section>
        <SectionLabel>Ringkasan Mesin</SectionLabel>
        <div className="grid-2">
          <Tile
            icon={<Clock size={15} />}
            label="Uptime Mesin"
            value={status ? formatUptime(status.uptime) : '—'}
            foot="Node.js runtime"
            accent="var(--info)"
          />
          <Tile
            icon={<Cpu size={15} />}
            label="Pemakaian RAM"
            value={status ? `${status.stats.memoryUsageMb} MB` : '—'}
            foot="Heap memory"
            accent="var(--violet)"
          />
          <Tile
            icon={<Zap size={15} />}
            label="Modul Plugin"
            value={plugins ? `${plugins}` : '—'}
            foot="Siap digunakan"
            accent="var(--ok)"
          />
          <Tile
            icon={<Layers size={15} />}
            label="MTProto Layer"
            value="229"
            foot="Teleproto engine"
            accent="var(--gold)"
          />
        </div>
      </section>

      {/* ----------------------------- ACCOUNT ---------------------------- */}
      <section>
        <SectionLabel>Detail Akun</SectionLabel>
        <Card>
          <Row
            icon={<Phone size={16} />}
            title="Nomor Telepon"
            value={
              <span className="center gap-8">
                <span className="mono fw-7 fs-12">
                  {status?.phone ? (showPhone ? status.phone : maskPhone(status.phone)) : 'Belum ditautkan'}
                </span>
                {status?.phone && (
                  <button
                    className="icon-btn"
                    style={{ width: 28, height: 28, borderRadius: 9, border: 0, background: 'transparent' }}
                    onClick={() => setShowPhone((v) => !v)}
                    aria-label={showPhone ? 'Sembunyikan nomor' : 'Tampilkan nomor'}
                  >
                    {showPhone ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </span>
            }
          />
          <Row
            icon={<Star size={16} />}
            title="Telegram Premium"
            value={user?.isPremium ? <Badge tone="gold">⭐ Premium</Badge> : <Badge tone="muted">Reguler</Badge>}
          />
          <Row
            icon={<Server size={16} />}
            title="Telegram ID"
            value={<span className="pill">{user?.id || '—'}</span>}
          />
          <Row
            icon={<Activity size={16} />}
            title="Status Sesi"
            value={
              status?.hasSession ? (
                <Badge tone={isConnected ? 'ok' : 'warn'}>{isConnected ? 'Terhubung' : 'Terputus'}</Badge>
              ) : (
                <Badge tone="danger">Belum login</Badge>
              )
            }
          />
        </Card>
      </section>
    </div>
  );
};
