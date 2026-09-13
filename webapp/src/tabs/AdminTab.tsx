import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Server, Cpu, Terminal, RefreshCw, Smartphone, ShieldCheck, Search, X, Crown, Activity,
} from 'lucide-react';
import { api } from '../api';
import { triggerHaptic } from '../telegram';
import { Card, SectionLabel, Tile, Skeleton, Empty, Badge, Banner, formatDate, relativeTime } from '../ui';

interface AdminUserRow {
  telegramId: number | string;
  phone?: string | null;
  expiredAt?: string | null;
  isRunning?: boolean;
  firstName?: string;
  username?: string;
}

interface AdminStats {
  totalRegisteredUsers?: number;
  activeRunningClients?: number;
  memoryRssMb?: number;
  nodeVersion?: string;
  totalPlugins?: number;
  uptimeSeconds?: number;
}

export const AdminTab: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, usersRes] = await Promise.all([api.getAdminStats(), api.getAdminUsers()]);
      if (statsRes.success) setStats(statsRes.stats);
      if (usersRes.success) setUsers(usersRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data armada.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchData();
  }, [active, fetchData]);

  const handleRefresh = () => {
    triggerHaptic('medium');
    setRefreshing(true);
    fetchData();
  };

  if (loading && !stats) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={78} count={2} />
        <Skeleton height={74} count={4} />
      </div>
    );
  }

  const q = search.toLowerCase().trim();
  const filtered = users.filter(
    (u) =>
      !q ||
      String(u.telegramId).includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.firstName || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q)
  );

  const online = users.filter((u) => u.isRunning).length;

  return (
    <div className="page stack gap-14">
      <div className="between">
        <div className="center gap-10">
          <span className="row-icon" style={{ background: 'var(--gold-soft)', color: 'var(--gold)', width: 36, height: 36 }}>
            <Crown size={19} />
          </span>
          <div>
            <div className="fw-8" style={{ fontSize: 16.5, letterSpacing: '-0.2px' }}>Pusat Kontrol Armada</div>
            <div className="fs-11 fw-7" style={{ color: 'var(--gold)', letterSpacing: '0.05em' }}>AKSES OWNER</div>
          </div>
        </div>
        <button className="icon-btn" onClick={handleRefresh} aria-label="Muat ulang">
          <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {error && <Banner tone="danger" icon={<ShieldCheck size={17} />}>{error}</Banner>}

      {/* ------------------------------ STATS ------------------------------ */}
      <section>
        <SectionLabel>Statistik server</SectionLabel>
        <div className="grid-2">
          <Tile icon={<Users size={15} />} label="Total pengguna" value={stats?.totalRegisteredUsers ?? 0} foot="Terdaftar di DB" accent="var(--info)" />
          <Tile icon={<Server size={15} />} label="Userbot online" value={stats?.activeRunningClients ?? online} foot="Sedang berjalan" accent="var(--ok)" />
          <Tile icon={<Cpu size={15} />} label="Memory RSS" value={`${stats?.memoryRssMb ?? 0} MB`} foot="RAM server" accent="var(--violet)" />
          <Tile icon={<Terminal size={15} />} label="Engine runtime" value={stats?.nodeVersion || '—'} foot="Node.js · Teleproto" accent="var(--gold)" />
        </div>
      </section>

      {/* ------------------------------- FLEET ----------------------------- */}
      <section>
        <SectionLabel right={<Badge tone="muted">{users.length} akun</Badge>}>
          <Activity size={13} /> Daftar akun terdaftar
        </SectionLabel>

        {users.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search
              size={16}
              className="hint"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <input
              className="input"
              type="search"
              placeholder="Cari ID, username, atau nomor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36, paddingRight: search ? 38 : 12, fontSize: 15 }}
            />
            {search && (
              <button
                className="icon-btn"
                onClick={() => setSearch('')}
                aria-label="Bersihkan"
                style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, border: 0, background: 'transparent' }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        <Card>
          {users.length === 0 ? (
            <Empty icon="🚀" title="Belum ada akun" desc="Belum ada pengguna yang mendaftarkan userbot." />
          ) : filtered.length === 0 ? (
            <Empty icon="🔍" title="Tidak ditemukan" desc={`Tidak ada akun cocok dengan "${search}".`} />
          ) : (
            <div className="list-scroll no-scrollbar">
              {filtered.map((u) => {
                const exp = u.expiredAt;
                const expSoon = exp ? new Date(exp).getTime() - Date.now() < 3 * 86400000 : false;
                return (
                  <div key={String(u.telegramId)} className="row">
                    <span
                      className="row-icon"
                      style={
                        u.isRunning
                          ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                          : { background: 'var(--danger-soft)', color: 'var(--danger)' }
                      }
                    >
                      <Smartphone size={17} />
                    </span>
                    <span className="row-body">
                      <span className="row-title truncate" style={{ display: 'block' }}>
                        {u.firstName || `ID ${u.telegramId}`}
                      </span>
                      <span className="row-desc truncate" style={{ display: 'block' }}>
                        {u.username ? `@${u.username} · ` : ''}
                        {u.phone || 'tanpa nomor'}
                      </span>
                      <span className="fs-11 hint truncate" style={{ display: 'block', marginTop: 2 }}>
                        {exp ? `${expSoon ? '⚠ ' : ''}Berakhir ${formatDate(exp)} · ${relativeTime(exp)}` : 'Lifetime / tanpa batas'}
                      </span>
                    </span>
                    <Badge tone={u.isRunning ? 'ok' : 'danger'}>{u.isRunning ? 'Online' : 'Stop'}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
};
