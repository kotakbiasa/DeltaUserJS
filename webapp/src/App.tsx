import React, { useState, useEffect } from 'react';
import { Tabbar, Spinner } from '@telegram-apps/telegram-ui';
import { Power, Puzzle, Radio, CreditCard, ShieldCheck } from 'lucide-react';
import { api, UserMe } from './api';
import { OverviewTab } from './tabs/OverviewTab';
import { PluginsTab } from './tabs/PluginsTab';
import { BroadcastTab } from './tabs/BroadcastTab';
import { SubscriptionTab } from './tabs/SubscriptionTab';
import { AdminTab } from './tabs/AdminTab';
import { triggerHaptic } from './telegram';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'plugins' | 'broadcast' | 'subscription' | 'admin'>('overview');
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    try {
      const res = await api.getMe();
      if (res.success) {
        setUser(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal terhubung ke server bot.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleTabChange = (tab: typeof activeTab) => {
    triggerHaptic('light');
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: 16 }}>
        <Spinner size="l" />
        <div style={{ fontSize: 14, opacity: 0.7 }}>Memuat Dashboard DeltaUserJS...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Akses Terbatas</h2>
        <p style={{ margin: '0 0 16px 0', fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.02)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>DeltaUserJS</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Web Dashboard Mini App</div>
          </div>
        </div>
        {user?.isOwner && (
          <span
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(234, 179, 8, 0.2)',
              color: '#eab308',
              fontWeight: 700,
            }}
          >
            OWNER
          </span>
        )}
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1 }}>
        {activeTab === 'overview' && <OverviewTab user={user} onRefreshUser={fetchUser} />}
        {activeTab === 'plugins' && <PluginsTab />}
        {activeTab === 'broadcast' && <BroadcastTab />}
        {activeTab === 'subscription' && <SubscriptionTab />}
        {activeTab === 'admin' && user?.isOwner && <AdminTab />}
      </div>

      {/* Bottom Tabbar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--tg-theme-bg-color, #18222d)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Tabbar>
          <Tabbar.Item
            text="Overview"
            selected={activeTab === 'overview'}
            onClick={() => handleTabChange('overview')}
          >
            <Power size={20} />
          </Tabbar.Item>
          <Tabbar.Item
            text="Plugin"
            selected={activeTab === 'plugins'}
            onClick={() => handleTabChange('plugins')}
          >
            <Puzzle size={20} />
          </Tabbar.Item>
          <Tabbar.Item
            text="Siaran"
            selected={activeTab === 'broadcast'}
            onClick={() => handleTabChange('broadcast')}
          >
            <Radio size={20} />
          </Tabbar.Item>
          <Tabbar.Item
            text="Paket"
            selected={activeTab === 'subscription'}
            onClick={() => handleTabChange('subscription')}
          >
            <CreditCard size={20} />
          </Tabbar.Item>
          {user?.isOwner && (
            <Tabbar.Item
              text="Admin"
              selected={activeTab === 'admin'}
              onClick={() => handleTabChange('admin')}
            >
              <ShieldCheck size={20} />
            </Tabbar.Item>
          )}
        </Tabbar>
      </div>
    </div>
  );
}
