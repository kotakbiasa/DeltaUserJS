import React, { useState, useEffect } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { ShieldCheck, Users, Server, Cpu, Terminal, RefreshCw, Smartphone, Key } from 'lucide-react';
import { api } from '../api';
import { triggerHaptic } from '../telegram';

export const AdminTab: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminUsers(),
      ]);
      if (statsRes.success) setStats(statsRes.stats);
      if (usersRes.success) setUsers(usersRes.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    triggerHaptic('medium');
    setLoading(true);
    fetchData();
  };

  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 40px 16px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={20} color="#eab308" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Pusat Kontrol Armada</h2>
            <div style={{ fontSize: 11, color: '#eab308', fontWeight: 600 }}>KHUSUS OWNER BOT</div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="tap-effect"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--tg-text)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 4 Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <Users size={16} color="#38bdf8" />
            <span>Total Pengguna</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
            {stats?.totalRegisteredUsers || 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg-hint)', marginTop: 2 }}>Terdaftar di DB</div>
        </div>

        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <Server size={16} color="#22c55e" />
            <span>Userbot Online</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
            {stats?.activeRunningClients || 0}
          </div>
          <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>Sedang berjalan</div>
        </div>

        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <Cpu size={16} color="#a855f7" />
            <span>Memory RSS</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
            {stats?.memoryRssMb || 0} MB
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg-hint)', marginTop: 2 }}>RAM Server</div>
        </div>

        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg-hint)', fontSize: 12, marginBottom: 6 }}>
            <Terminal size={16} color="#f59e0b" />
            <span>Engine Runtime</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>
            {stats?.nodeVersion || 'v24'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg-hint)', marginTop: 2 }}>Node.js & Teleproto</div>
        </div>
      </div>

      {/* Fleet User List */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>📋 Daftar Akun Terdaftar ({users.length})</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => (
          <div
            key={u.telegramId}
            className="glass-card"
            style={{
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: u.isRunning ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Smartphone size={18} color={u.isRunning ? '#22c55e' : '#ef4444'} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tg-text)' }}>
                  ID: {u.telegramId}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 2 }}>
                  {u.phone || 'No phone'} • Exp: {u.expiredAt ? new Date(u.expiredAt).toLocaleDateString('id-ID') : 'Lifetime'}
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 6,
                background: u.isRunning ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                color: u.isRunning ? '#4ade80' : '#f87171',
                border: `1px solid ${u.isRunning ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              }}
            >
              {u.isRunning ? 'ONLINE' : 'STOPPED'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
