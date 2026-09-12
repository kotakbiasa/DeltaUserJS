import React, { useState, useEffect } from 'react';
import { Card, Spinner, Cell, Section } from '@telegram-apps/telegram-ui';
import { ShieldCheck, Users, Server, Cpu, Terminal } from 'lucide-react';
import { api } from '../api';

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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 80px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <ShieldCheck size={22} color="#eab308" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Owner Fleet Control</h2>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card type="plain" style={{ padding: 14, borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7, marginBottom: 4 }}>
            <Users size={16} color="#38bdf8" />
            <span style={{ fontSize: 12 }}>Total Pengguna</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats?.totalRegisteredUsers || 0}</div>
        </Card>

        <Card type="plain" style={{ padding: 14, borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7, marginBottom: 4 }}>
            <Server size={16} color="#22c55e" />
            <span style={{ fontSize: 12 }}>Userbot Online</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{stats?.activeRunningClients || 0}</div>
        </Card>

        <Card type="plain" style={{ padding: 14, borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7, marginBottom: 4 }}>
            <Cpu size={16} color="#a855f7" />
            <span style={{ fontSize: 12 }}>Memory RSS</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{stats?.memoryRssMb || 0} MB</div>
        </Card>

        <Card type="plain" style={{ padding: 14, borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7, marginBottom: 4 }}>
            <Terminal size={16} color="#f59e0b" />
            <span style={{ fontSize: 12 }}>Node.js Engine</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{stats?.nodeVersion || 'v24'}</div>
        </Card>
      </div>

      {/* Registered Users Section */}
      <Section header={`Daftar Armada Userbot (${users.length})`}>
        {users.map((u) => (
          <Cell
            key={u.telegramId}
            description={`Phone: ${u.phone} • Expired: ${u.expiredAt ? new Date(u.expiredAt).toLocaleDateString('id-ID') : 'Lifetime'}`}
            after={
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: u.isRunning ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: u.isRunning ? '#22c55e' : '#ef4444',
                }}
              >
                {u.isRunning ? 'Running' : 'Stopped'}
              </span>
            }
          >
            ID: {u.telegramId}
          </Cell>
        ))}
      </Section>
    </div>
  );
};
