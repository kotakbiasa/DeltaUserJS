import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Power, Puzzle, Radio, Sliders, CreditCard, ShieldCheck, RefreshCw, Star, Zap } from 'lucide-react';
import { api, UserMe } from './api';
import { OverviewTab } from './tabs/OverviewTab';
import { PluginsTab } from './tabs/PluginsTab';
import { BroadcastTab } from './tabs/BroadcastTab';
import { SettingsTab } from './tabs/SettingsTab';
import { SubscriptionTab } from './tabs/SubscriptionTab';
import { AdminTab } from './tabs/AdminTab';
import { triggerHaptic } from './telegram';
import { Spinner, Banner } from './ui';

type TabId = 'overview' | 'plugins' | 'broadcast' | 'settings' | 'subscription' | 'admin';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Power },
  { id: 'plugins', label: 'Plugin', icon: Puzzle },
  { id: 'broadcast', label: 'Siaran', icon: Radio },
  { id: 'settings', label: 'Setelan', icon: Sliders },
  { id: 'subscription', label: 'Paket', icon: CreditCard },
  { id: 'admin', label: 'Admin', icon: ShieldCheck },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
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

  const tabs = user?.isOwner ? TABS : TABS.filter((t) => t.id !== 'admin');

  // Sliding pill mengikuti posisi tab aktif.
  useEffect(() => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    const track = trackRef.current;
    if (!track || idx < 0) return;
    // NB: jangan pakai track.children — child pertama adalah elemen pill itu sendiri.
    const cell = track.querySelectorAll<HTMLElement>('.tab')[idx];
    if (!cell) return;
    setPill({ left: cell.offsetLeft, width: cell.offsetWidth });
  }, [activeTab, tabs.length, user?.isOwner]);

  const handleTabChange = (tab: TabId) => {
    if (tab === activeTab) return;
    triggerHaptic('selectionChanged');
    setActiveTab(tab);
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
    window.scrollTo({ top: 0 });
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

      <nav className="tabbar">
        <div className="tabbar-track" ref={trackRef}>
          <span className="tabbar-pill" style={{ left: pill.left, width: pill.width }} />
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = activeTab === t.id;
            return (
              <button key={t.id} className={`tab ${on ? 'on' : ''}`} onClick={() => handleTabChange(t.id)} aria-current={on}>
                <Icon size={21} strokeWidth={on ? 2.4 : 1.85} />
                <span className="tab-label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
