/**
 * Sub-tab Diagnostik: status runtime, variabel, dan logout sesi.
 *
 * Dipecah dari SettingsTab.tsx (877 baris). JSX dipindahkan apa adanya;
 * state tetap milik SettingsTab dan diturunkan lewat props.
 */
import React from 'react';
import { Database, Shield, Activity, AlertTriangle, RefreshCw, LogOut, Bot, ShieldCheck, Ticket } from 'lucide-react';
import { VarsData, DiagnosticsData, UserMe } from '../../api';
import { triggerHaptic } from '../../telegram';
import { Card, SectionLabel, Row, Banner, Skeleton, Badge, Spinner, Tile } from '../../ui';

interface DiagSectionProps {
  diag: DiagnosticsData | null;
  diagLoading: boolean;
  loadDiag: () => void;
  vars: VarsData;
  user: UserMe;
  confirmLogout: boolean;
  setConfirmLogout: React.Dispatch<React.SetStateAction<boolean>>;
  loggingOut: boolean;
  doLogout: () => void;
}

export const DiagSection: React.FC<DiagSectionProps> = ({
  user,
  diag,
  diagLoading,
  loadDiag,
  vars,
  confirmLogout,
  setConfirmLogout,
  loggingOut,
  doLogout,
}) => (
      <>
        <section>
          <SectionLabel
            right={
              <button className="btn ghost sm" onClick={loadDiag} disabled={diagLoading}>
                <RefreshCw size={12} className={diagLoading ? 'spin' : ''} /> Uji ulang
              </button>
            }
          >
            <Activity size={13} /> Diagnostik MTProto
          </SectionLabel>

          {diagLoading && !diag ? (
            <Skeleton height={78} count={2} />
          ) : diag ? (
            <>
              <div className="grid-2 mb-16">
                <Tile
                  icon={<Activity size={15} />}
                  label="Latensi ping"
                  value={diag.pingMs > 0 ? `${diag.pingMs} ms` : 'Offline'}
                  foot={`DC ${diag.dcId}`}
                  accent={diag.pingMs > 0 ? 'var(--ok)' : 'var(--danger)'}
                />
                <Tile
                  icon={<ShieldCheck size={15} />}
                  label="Status koneksi"
                  value={diag.connected ? 'Terhubung' : 'Terputus'}
                  foot={diag.connected ? 'Stabil' : 'Perlu login ulang'}
                  accent={diag.connected ? 'var(--ok)' : 'var(--danger)'}
                />
              </div>
              <Card>
                <Row
                  icon={<Shield size={16} />}
                  title="FloodGuard"
                  desc={diag.floodGuard?.inCooldown ? 'Mode hibernasi aktif' : 'Tidak ada limit terdeteksi'}
                  right={
                    <Badge tone={diag.floodGuard?.inCooldown ? 'warn' : 'ok'}>
                      {diag.floodGuard?.inCooldown ? `Cooldown ${diag.floodGuard.remainingSeconds}s` : 'Normal'}
                    </Badge>
                  }
                />
                <Row
                  icon={<Database size={16} />}
                  title="Plugin aktif"
                  desc={`${diag.disabledPlugins} modul dinonaktifkan`}
                  value={<span className="num fw-8">{diag.activePlugins}</span>}
                />
                {typeof diag.uptime === 'number' && (
                  <Row
                    icon={<Activity size={16} />}
                    title="Uptime sesi"
                    value={<span className="num fw-8">{Math.floor(diag.uptime / 3600)}j {Math.floor((diag.uptime % 3600) / 60)}m</span>}
                  />
                )}
              </Card>
            </>
          ) : null}
        </section>

        <section>
          <SectionLabel><AlertTriangle size={13} /> Zona bahaya</SectionLabel>
          <Card
            pad
            style={{
              borderColor: 'color-mix(in srgb, var(--danger) 34%, transparent)',
              background: 'linear-gradient(180deg, var(--danger-soft), transparent 70%)',
            }}
          >
            <div className="center gap-8 mb-12">
              <AlertTriangle size={17} color="var(--danger)" />
              <span className="fs-14 fw-8" style={{ color: 'var(--danger)' }}>Logout & hapus sesi</span>
            </div>
            <p className="fs-12 op-75 m-0 mb-12" style={{ lineHeight: 1.55 }}>
              Memutuskan koneksi userbot dari server secara permanen. Anda perlu login ulang via OTP atau QR code untuk
              mengaktifkannya kembali.
            </p>

            {!confirmLogout ? (
              <button className="btn danger press" onClick={() => { triggerHaptic('warning'); setConfirmLogout(true); }}>
                <LogOut size={16} />
                <span>Logout sesi sekarang</span>
              </button>
            ) : (
              <div className="stack gap-10" style={{ animation: 'pageIn 0.2s ease' }}>
                <Banner tone="danger" icon={<AlertTriangle size={16} />}>
                  Yakin ingin logout permanen? Tindakan ini tidak bisa dibatalkan.
                </Banner>
                <div className="center gap-8">
                  <button className="btn ghost press" onClick={() => setConfirmLogout(false)}>Batal</button>
                  <button className="btn solid-danger press" onClick={doLogout} disabled={loggingOut}>
                    {loggingOut ? <Spinner size={16} /> : <LogOut size={16} />}
                    <span>{loggingOut ? 'Memproses…' : 'Ya, logout'}</span>
                  </button>
                </div>
              </div>
            )}
          </Card>
        </section>

        <section>
          <SectionLabel><Ticket size={13} /> Info akun</SectionLabel>
          <Card>
            <Row icon={<Bot size={16} />} title="Username" value={<span className="mono fs-12">@{user.username || '—'}</span>} />
            <Row icon={<Database size={16} />} title="Telegram ID" value={<span className="pill">{user.id}</span>} />
            <Row icon={<Shield size={16} />} title="Status akses" value={<Badge tone={user.isOwner ? 'gold' : user.isApproved ? 'ok' : 'muted'}>{user.isOwner ? 'Owner' : user.isApproved ? 'Approved' : 'User'}</Badge>} />
          </Card>
        </section>
      </>
);
