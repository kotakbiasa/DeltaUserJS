/**
 * Sub-tab Akses: whitelist PM dan blacklist chat.
 *
 * Dipecah dari SettingsTab.tsx (877 baris). JSX dipindahkan apa adanya;
 * state tetap milik SettingsTab dan diturunkan lewat props.
 */
import React from 'react';
import { Shield, Plus, Trash2, MessageSquare } from 'lucide-react';
import { UserSettings } from '../../api';
import { Card, SectionLabel, Badge } from '../../ui';

interface AccessSectionProps {
  settings: UserSettings;
  newApproved: string;
  setNewApproved: React.Dispatch<React.SetStateAction<string>>;
  addApproved: () => void;
  removeApproved: (id: number) => void;
  newBlacklist: string;
  setNewBlacklist: React.Dispatch<React.SetStateAction<string>>;
  addBlacklist: () => void;
  removeBlacklist: (cid: string) => void;
}

export const AccessSection: React.FC<AccessSectionProps> = ({
  settings,
  newApproved,
  setNewApproved,
  addApproved,
  removeApproved,
  newBlacklist,
  setNewBlacklist,
  addBlacklist,
  removeBlacklist,
}) => (
      <>
        <section>
          <SectionLabel right={<Badge tone="ok">{settings.approvedUsers.length}</Badge>}>
            <Shield size={13} /> Whitelist user
          </SectionLabel>
          <Card pad>
            <p className="fs-12 hint m-0 mb-12" style={{ lineHeight: 1.5 }}>
              ID pengguna yang boleh bypass proteksi PM atau memakai bot.
            </p>
            <div className="center gap-8 mb-12">
              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="Telegram User ID…"
                value={newApproved}
                onChange={(e) => setNewApproved(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <button className="btn ok press shrink-0" style={{ width: 'auto' }} onClick={addApproved} disabled={!newApproved.trim()}>
                <Plus size={16} />
              </button>
            </div>
            {settings.approvedUsers.length === 0 ? (
              <div className="fs-12 hint" style={{ textAlign: 'center', padding: '10px 0' }}>Belum ada user di whitelist.</div>
            ) : (
              <div className="stack gap-8">
                {settings.approvedUsers.map((uid) => (
                  <div key={uid} className="between" style={{ padding: '9px 12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--tg-bg) 40%, transparent)', border: 'var(--hairline) solid var(--tg-separator)' }}>
                    <span className="mono fs-13 fw-7">{uid}</span>
                    <button className="icon-btn" style={{ width: 28, height: 28, border: 0, background: 'transparent', color: 'var(--danger)' }} onClick={() => removeApproved(uid)} aria-label="Hapus">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section>
          <SectionLabel right={<Badge tone="danger">{settings.broadcastBlacklist.length}</Badge>}>
            <MessageSquare size={13} /> Blacklist siaran
          </SectionLabel>
          <Card pad>
            <p className="fs-12 hint m-0 mb-12" style={{ lineHeight: 1.5 }}>
              Chat ID yang dikecualikan dari broadcast massal.
            </p>
            <div className="center gap-8 mb-12">
              <input
                className="input mono"
                placeholder="-1001234567890"
                value={newBlacklist}
                onChange={(e) => setNewBlacklist(e.target.value)}
              />
              <button className="btn solid-danger press shrink-0" style={{ width: 'auto' }} onClick={addBlacklist} disabled={!newBlacklist.trim()}>
                <Plus size={16} />
              </button>
            </div>
            {settings.broadcastBlacklist.length === 0 ? (
              <div className="fs-12 hint" style={{ textAlign: 'center', padding: '10px 0' }}>Belum ada chat di blacklist.</div>
            ) : (
              <div className="stack gap-8">
                {settings.broadcastBlacklist.map((cid) => (
                  <div key={cid} className="between" style={{ padding: '9px 12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--tg-bg) 40%, transparent)', border: 'var(--hairline) solid var(--tg-separator)' }}>
                    <span className="mono fs-13 fw-7">{cid}</span>
                    <button className="icon-btn" style={{ width: 28, height: 28, border: 0, background: 'transparent', color: 'var(--danger)' }} onClick={() => removeBlacklist(cid)} aria-label="Hapus">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </>
);
