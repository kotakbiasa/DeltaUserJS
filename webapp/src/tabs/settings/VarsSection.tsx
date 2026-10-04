/**
 * Sub-tab Variables: pencarian, editor, dan daftar var user/sistem.
 *
 * Dipecah dari SettingsTab.tsx (877 baris). JSX dipindahkan apa adanya;
 * state tetap milik SettingsTab dan diturunkan lewat props.
 */
import React from 'react';
import { Database, Plus, Search, RotateCcw } from 'lucide-react';
import { VarsData, UserMe } from '../../api';
import { triggerHaptic } from '../../telegram';
import { Card, SectionLabel, Row, Switch, Badge, Empty } from '../../ui';
import { VAR_PRESETS } from './constants.js';
import { CrownIcon } from './CrownIcon.js';

interface VarsSectionProps {
  vars: VarsData;
  user: UserMe;
  varSearch: string;
  setVarSearch: React.Dispatch<React.SetStateAction<string>>;
  varKey: string;
  setVarKey: React.Dispatch<React.SetStateAction<string>>;
  varValue: string;
  setVarValue: React.Dispatch<React.SetStateAction<string>>;
  editing: { key: string; isSystem: boolean } | null;
  setEditing: React.Dispatch<React.SetStateAction<{ key: string; isSystem: boolean } | null>>;
  isSystemVar: boolean;
  setIsSystemVar: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  saveVar: () => void;
  userVarEntries: [string, string][];
  sysVarEntries: [string, string][];
  renderVarList: (entries: [string, string][], prefix: string, sys: boolean) => React.ReactNode;
}

export const VarsSection: React.FC<VarsSectionProps> = ({
  user,
  vars,
  varSearch,
  setVarSearch,
  varKey,
  setVarKey,
  varValue,
  setVarValue,
  editing,
  setEditing,
  isSystemVar,
  setIsSystemVar,
  saving,
  saveVar,
  userVarEntries,
  sysVarEntries,
  renderVarList,
}) => (
      <>
        <section>
          <SectionLabel
            right={
              editing ? (
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    setEditing(null);
                    setVarKey('');
                    setVarValue('');
                    setIsSystemVar(false);
                  }}
                >
                  <RotateCcw size={12} /> Batal
                </button>
              ) : null
            }
          >
            <Database size={13} /> {editing ? `Edit ${editing.key}` : 'Tambah variabel'}
          </SectionLabel>

          <Card pad>
            {!editing && (
              <div className="mb-12">
                <div className="field-label">Preset cepat</div>
                <div className="center gap-6 wrap">
                  {VAR_PRESETS.map((p) => (
                    <button
                      key={p}
                      className="chip"
                      style={{ padding: '5px 10px', fontSize: 11.5 }}
                      onClick={() => {
                        triggerHaptic('light');
                        setVarKey(p);
                        setIsSystemVar(false);
                      }}
                    >
                      +{p}
                    </button>
                  ))}
                  {user.isOwner && (
                    <button
                      className="chip"
                      style={{ padding: '5px 10px', fontSize: 11.5, color: 'var(--gold)', borderColor: 'color-mix(in srgb, var(--gold) 40%, transparent)' }}
                      onClick={() => {
                        triggerHaptic('light');
                        setIsSystemVar(true);
                        setVarKey('SYSTEM_LOG_CHAT_ID');
                      }}
                    >
                      👑 System var
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="stack gap-10">
              <input
                className="input mono"
                placeholder="KUNCI"
                value={varKey}
                disabled={Boolean(editing)}
                onChange={(e) => setVarKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              />
              <input
                className="input"
                placeholder="Nilai variabel…"
                value={varValue}
                onChange={(e) => setVarValue(e.target.value)}
              />
              {user.isOwner && !editing && (
                <Row
                  title="Simpan sebagai system var"
                  desc="Konfigurasi global master"
                  right={<Switch checked={isSystemVar} onChange={setIsSystemVar} label="System var" />}
                />
              )}
              <button className="btn primary wide press" onClick={saveVar}>
                <Plus size={16} />
                <span>{editing ? 'Perbarui variabel' : 'Simpan variabel'}</span>
              </button>
            </div>
          </Card>
        </section>

        {Object.keys(vars.userVars || {}).length > 4 && (
          <div style={{ position: 'relative' }}>
            <Search size={15} className="hint" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              className="input"
              placeholder="Cari variabel…"
              value={varSearch}
              onChange={(e) => setVarSearch(e.target.value)}
              style={{ paddingLeft: 35, fontSize: 15 }}
            />
          </div>
        )}

        <section>
          <SectionLabel right={<Badge tone="muted">{Object.keys(vars.userVars || {}).length}</Badge>}>
            Variabel akun Anda
          </SectionLabel>
          <Card>
            {userVarEntries.length === 0 ? (
              <Empty icon="🗂" title="Belum ada variabel" desc="Tambahkan variabel untuk menyimpan konfigurasi." />
            ) : (
              renderVarList(userVarEntries, 'user_', false)
            )}
          </Card>
        </section>

        {user.isOwner && (
          <section>
            <SectionLabel right={<Badge tone="gold">{Object.keys(vars.systemVars || {}).length}</Badge>}>
              <CrownIcon /> System vars (master)
            </SectionLabel>
            <Card style={{ borderColor: 'color-mix(in srgb, var(--gold) 30%, transparent)' }}>
              {sysVarEntries.length === 0 ? (
                <Empty icon="👑" title="Belum ada system var" desc="System var berlaku global untuk semua userbot." />
              ) : (
                renderVarList(sysVarEntries, 'sys_', true)
              )}
            </Card>
          </section>
        )}
      </>
);
