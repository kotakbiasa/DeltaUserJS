import React, { useState, useEffect } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { Power, Puzzle, Radio, CreditCard, ShieldCheck, RefreshCw, Star, Zap, Sliders } from 'lucide-react';
import { api, UserMe } from './api';
import { OverviewTab } from './tabs/OverviewTab';
import { PluginsTab } from './tabs/PluginsTab';
import { BroadcastTab } from './tabs/BroadcastTab';
import { SettingsTab } from './tabs/SettingsTab';
import { SubscriptionTab } from './tabs/SubscriptionTab';
import { AdminTab } from './tabs/AdminTab';
import { triggerHaptic } from './telegram';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'plugins' | 'broadcast' | 'settings' | 'subscription' | 'admin'>('overview');
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const fetchUser = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await api.getMe();
      if (res.success) {
        setUser(res.user);
        setIsOnline(res.isActive);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal terhubung ke server bot.');
    } finally {
      setLoading(false);
      if (isManual) setTimeout(() => setRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleTabChange = (tab: typeof activeTab) => {
    triggerHaptic('selectionChanged');
    setActiveTab(tab);
  };

  const handleManualRefresh = () => {
    triggerHaptic('medium');
    fetchUser(true);
  };

  if (loading && !user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(2, 132, 199, 0.4)' }}>
          <Zap size={32} color="#ffffff" />
        </div>
        <Spinner size="l" />
        <div style={{ fontSize: 14, opacity: 0.7, fontWeight: 500 }}>Memuat DeltaUserJS Dashboard...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <ShieldCheck size={36} color="#ef4444" />
        </div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>Akses Terbatas</h2>
        <p style={{ margin: '0 0 20px 0', fontSize: 14, opacity: 0.75, lineHeight: 1.6, maxWidth: 360 }}>
          {error}
        </p>
        <button
          className="tap-effect"
          onClick={() => fetchUser(true)}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            background: 'var(--tg-btn, #0284c7)',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const userInitial = user?.firstName?.charAt(0)?.toUpperCase() || 'U';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Power },
    { id: 'plugins', label: 'Plugin', icon: Puzzle },
    { id: 'broadcast', label: 'Siaran', icon: Radio },
    { id: 'settings', label: 'Setelan', icon: Sliders },
    { id: 'subscription', label: 'Paket', icon: CreditCard },
    ...(user?.isOwner ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : []),
  ] as const;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(80px + var(--safe-bottom))' }}>
      {/* Sleek Top Header Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--tg-card-border)',
          padding: 'calc(10px + var(--safe-top)) 16px 10px 16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* User Profile Snippet */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                color: '#ffffff',
                boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)',
                flexShrink: 0,
              }}
            >
              {userInitial}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.firstName || 'User'}
                </span>
                {user?.isPremium && (
                  <Star size={14} fill="#eab308" color="#eab308" style={{ flexShrink: 0 }} />
                )}
                {user?.isOwner && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.4)' }}>
                    OWNER
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.65 }}>
                <span>@{user?.username || `id:${user?.id}`}</span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: isOnline ? '#22c55e' : '#ef4444',
                      display: 'inline-block',
                    }}
                  />
                  {isOnline ? 'Aktif' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Refresh Action Button */}
          <button
            className="tap-effect"
            onClick={handleManualRefresh}
            title="Refresh Data"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--tg-text)',
            }}
          >
            <RefreshCw
              size={17}
              style={{
                transition: 'transform 0.5s ease',
                transform: refreshing ? 'rotate(360deg)' : 'none',
              }}
            />
          </button>
        </div>
      </header>

      {/* Main Tab Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'overview' && (
          <OverviewTab
            user={user}
            onRefreshUser={() => fetchUser(false)}
            onStatusChange={(online) => setIsOnline(online)}
          />
        )}
        {activeTab === 'plugins' && <PluginsTab />}
        {activeTab === 'broadcast' && <BroadcastTab />}
        {activeTab === 'settings' && <SettingsTab user={user} />}
        {activeTab === 'subscription' && <SubscriptionTab />}
        {activeTab === 'admin' && user?.isOwner && <AdminTab />}
      </main>

      {/* Floating Modern Tabbar */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '6px 12px calc(8px + var(--safe-bottom)) 12px',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--tg-card-border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', maxWidth: 480, margin: '0 auto' }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const isSelected = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id as any)}
                className="tap-effect"
                style={{
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 12,
                  transition: 'all 0.2s ease',
                  color: isSelected ? 'var(--tg-link, #38bdf8)' : 'rgba(255, 255, 255, 0.45)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    padding: 4,
                    borderRadius: 8,
                    background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Icon size={20} strokeWidth={isSelected ? 2.4 : 1.8} />
                </div>
                <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500, letterSpacing: -0.2 }}>
                  {t.label}
                </span>
                {isSelected && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      width: 14,
                      height: 3,
                      borderRadius: 2,
                      background: 'var(--tg-link, #38bdf8)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
