import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Power, Puzzle, Radio, Sliders, CreditCard, ShieldCheck, RefreshCw, Star, Zap, MoreHorizontal, X, ChevronRight,
} from 'lucide-react';
import { api, UserMe } from './api';
import { OverviewTab } from './tabs/OverviewTab';
import { PluginsTab } from './tabs/PluginsTab';
import { BroadcastTab } from './tabs/BroadcastTab';
import { SettingsTab } from './tabs/SettingsTab';
import { SubscriptionTab } from './tabs/SubscriptionTab';
import { AdminTab } from './tabs/AdminTab';
import { triggerHaptic, tg } from './telegram';
import { Spinner, Banner } from './ui';

type TabId = 'overview' | 'plugins' | 'broadcast' | 'settings' | 'subscription' | 'admin';

/** Slot utama di tab bar — bahasa desain Telegram terbaru: maksimal 4 tab. */
const PRIMARY: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Beranda', icon: Power },
  { id: 'plugins', label: 'Plugin', icon: Puzzle },
  { id: 'broadcast', label: 'Siaran', icon: Radio },
  { id: 'settings', label: 'Setelan', icon: Sliders },
];

/** Sisanya pindah ke sheet "Lainnya" — pola overflow ala Telegram. */
const SECONDARY: { id: TabId; label: string; desc: string; icon: React.ElementType; accent: string }[] = [
  { id: 'subscription', label: 'Paket & Langganan', desc: 'Masa aktif, voucher, perpanjangan', icon: CreditCard, accent: 'var(--gold)' },
  { id: 'admin', label: 'Pusat Kontrol Armada', desc: 'Statistik server & daftar akun', icon: ShieldCheck, accent: 'var(--violet)' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [visited, setVisited] = useState<Set<TabId>>(new Set(['overview']));

  const fetchUser = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await api.getMe();
      if (res.success) {
        setUser(res.user);
        setIsOnline(Boolean(res.isActive));
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal terhubung ke server bot.');
    } finally {
      setLoading(false);
      if (isManual) setTimeout(() => setRefreshing(false), 600);
    }
  }, []);

  useEffect(() => {
    fetchUser();
    const t = setInterval(() => fetchUser(false), 30000);
    return () => clearInterval(t);
  }, [fetchUser]);

  const secondary = user?.isOwner ? SECONDARY : SECONDARY.filter((t) => t.id !== 'admin');
  const inSecondary = secondary.some((t) => t.id === activeTab);

  /** Semua slot yang tampil di bar: 4 primer + tombol "Lainnya". */
  const slots: { id: TabId | 'more'; label: string; icon: React.ElementType }[] = [
    ...PRIMARY,
    { id: 'more', label: 'Lainnya', icon: MoreHorizontal },
  ];

  // Sliding pill mengikuti posisi slot aktif.
  // NB: kalau sheet "Lainnya" terbuka, pill ikut pindah ke slot itu — jangan
  // biarkan tab menyala (class .on) di satu tempat sementara pill di tempat lain.
  useEffect(() => {
    const key: TabId | 'more' = inSecondary || sheetOpen ? 'more' : activeTab;
    const idx = slots.findIndex((s) => s.id === key);
    const track = trackRef.current;
    if (!track || idx < 0) return;
    // NB: jangan pakai track.children — child pertama adalah elemen pill itu sendiri.
    const cell = track.querySelectorAll<HTMLElement>('.tab')[idx];
    if (!cell) return;
    setPill({ left: cell.offsetLeft, width: cell.offsetWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, inSecondary, sheetOpen, user?.isOwner, loading]);

  // BackButton Telegram menutup sheet lebih dulu, baru keluar app.
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb || !sheetOpen) return;
    const close = () => setSheetOpen(false);
    bb.onClick(close);
    bb.show();
    return () => {
      bb.offClick(close);
      bb.hide();
    };
  }, [sheetOpen]);

  // Escape menutup sheet (desktop / web preview).
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const goTo = (tab: TabId) => {
    triggerHaptic('selectionChanged');
    setActiveTab(tab);
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
    setSheetOpen(false);
    window.scrollTo({ top: 0 });
  };

  const handleSlot = (id: TabId | 'more') => {
    if (id === 'more') {
      triggerHaptic('light');
      setSheetOpen((v) => !v);
      return;
    }
    // Pindah ke tab primer saat sheet terbuka: tutup sheet-nya sekalian.
    if (sheetOpen) setSheetOpen(false);
    if (id === activeTab && !sheetOpen) return;
    goTo(id);
  };

  const handleManualRefresh = () => {
    triggerHaptic('medium');
    fetchUser(true);
  };

  if (loading && !user) {
    return (
      <div className="app-shell">
        <div className="app-bg" />
        <div
          className="page"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, minHeight: '80vh' }}
        >
          <div className="avatar" style={{ width: 68, height: 68, borderRadius: 22 }}>
            <Zap size={32} />
          </div>
          <Spinner size={26} />
          <div className="fs-13 op-75 fw-6">Menyiapkan dashboard…</div>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="app-shell">
        <div className="app-bg" />
        <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: '80vh', textAlign: 'center' }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 22,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <div className="fs-11 fw-8" style={{ letterSpacing: '0.08em', color: 'var(--danger)' }}>
            AKSES TERBATAS
          </div>
          <p className="fs-13 op-75 m-0" style={{ lineHeight: 1.6, maxWidth: 340 }}>
            {error}
          </p>
          <button className="btn primary press" style={{ maxWidth: 220 }} onClick={() => fetchUser(true)}>
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            <span>Coba Lagi</span>
          </button>
        </div>
      </div>
    );
  }

  const initial = (user?.firstName || 'U').charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <div className="app-bg" />

      <header className="appbar">
        <div className="appbar-inner">
          <div className="avatar">{initial}</div>

          <div className="identity">
            <div className="identity-top">
              <span className="name">{user?.firstName || 'User'}</span>
              {user?.isPremium && <Star size={14} fill="var(--gold)" color="var(--gold)" className="shrink-0" />}
              {user?.isOwner && <span className="badge gold">Owner</span>}
            </div>
            <div className="identity-sub">
              <span className="truncate">@{user?.username || `id:${user?.id ?? '—'}`}</span>
              <span>·</span>
              <span className="center gap-6">
                <span className={`dot ${isOnline ? '' : 'off'}`} />
                {isOnline ? 'Aktif' : 'Offline'}
              </span>
            </div>
          </div>

          <button className="icon-btn" onClick={handleManualRefresh} aria-label="Muat ulang data">
            <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {error && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <Banner tone="danger" icon={<ShieldCheck size={17} />}>{error}</Banner>
        </div>
      )}

      <main key={activeTab} className="grow">
        {activeTab === 'overview' && (
          <OverviewTab user={user} onRefreshUser={() => fetchUser(false)} onStatusChange={setIsOnline} active={true} />
        )}
        {activeTab === 'plugins' && <PluginsTab active={visited.has('plugins')} />}
        {activeTab === 'broadcast' && <BroadcastTab active={visited.has('broadcast')} />}
        {activeTab === 'settings' && <SettingsTab user={user} active={visited.has('settings')} />}
        {activeTab === 'subscription' && <SubscriptionTab active={visited.has('subscription')} />}
        {activeTab === 'admin' && user?.isOwner && <AdminTab active={visited.has('admin')} />}
      </main>

      {/* ------------------------- SHEET "LAINNYA" ------------------------- */}
      {sheetOpen && (
        <>
          <div className="sheet-scrim" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu lainnya">
            <div className="sheet-grip" />
            <div className="between" style={{ padding: '2px 4px 12px' }}>
              <span className="fs-15 fw-8">Menu lainnya</span>
              <button className="icon-btn" style={{ width: 30, height: 30, border: 0, background: 'transparent' }} onClick={() => setSheetOpen(false)} aria-label="Tutup">
                <X size={16} />
              </button>
            </div>

            <div className="stack gap-8">
              {secondary.map((item) => {
                const Icon = item.icon;
                const on = activeTab === item.id;
                return (
                  <button key={item.id} className="sheet-item" onClick={() => goTo(item.id)}>
                    <span
                      className="row-icon"
                      style={{ background: `color-mix(in srgb, ${item.accent} 15%, transparent)`, color: item.accent, width: 38, height: 38, borderRadius: 12 }}
                    >
                      <Icon size={19} />
                    </span>
                    <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                      <span className="row-title" style={{ display: 'block' }}>{item.label}</span>
                      <span className="row-desc" style={{ display: 'block' }}>{item.desc}</span>
                    </span>
                    {on ? <span className="badge">Sedang dibuka</span> : <ChevronRight size={17} className="hint" />}
                  </button>
                );
              })}

              <button className="sheet-item" onClick={() => { handleManualRefresh(); setSheetOpen(false); }}>
                <span className="row-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)', width: 38, height: 38, borderRadius: 12 }}>
                  <RefreshCw size={19} className={refreshing ? 'spin' : ''} />
                </span>
                <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                  <span className="row-title" style={{ display: 'block' }}>Muat ulang data</span>
                  <span className="row-desc" style={{ display: 'block' }}>Sinkronkan status terbaru dari server</span>
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ---------------------------- TAB BAR ---------------------------- */}
      <nav className="tabbar">
        <div className="tabbar-track" ref={trackRef}>
          <span className="tabbar-pill" style={{ left: pill.left, width: pill.width }} />
          {slots.map((s) => {
            const Icon = s.icon;
            const on = s.id === 'more' ? inSecondary || sheetOpen : activeTab === s.id;
            return (
              <button
                key={s.id}
                className={`tab ${on ? 'on' : ''}`}
                onClick={() => handleSlot(s.id)}
                aria-current={on}
                aria-expanded={s.id === 'more' ? sheetOpen : undefined}
              >
                <Icon size={21} strokeWidth={on ? 2.4 : 1.85} />
                <span className="tab-label">{s.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
