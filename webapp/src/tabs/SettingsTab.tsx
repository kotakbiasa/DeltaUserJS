import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders, Database, Shield, Activity, Check, AlertTriangle, Eye, EyeOff, Plus, Trash2, Edit2,
  RefreshCw, LogOut, Bot, ShieldCheck, MessageSquare, Sparkles, Ticket, Search, Save, RotateCcw,
} from 'lucide-react';
import { api, UserMe, UserSettings, VarsData, DiagnosticsData } from '../api';
import { triggerHaptic } from '../telegram';
import { Card, SectionLabel, Row, Switch, Banner, Skeleton, Badge, Empty, Spinner, Tile, Toast } from '../ui';

interface SettingsTabProps {
  user: UserMe;
  active?: boolean;
}

type SubTab = 'general' | 'vars' | 'access' | 'diag';

const PREFIXES = ['.', '!', ',', '#', '?', '~'];
const VAR_PRESETS = ['PREFIX', 'INLINE_BOT_TOKEN', 'LOG_CHAT_ID'];

export const SettingsTab: React.FC<SettingsTabProps> = ({ user, active = true }) => {
  const [sub, setSub] = useState<SubTab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const [settings, setSettings] = useState<UserSettings>({
    prefix: '.',
    antiPm: false,
    autoReply: false,
    afkReason: '',
    customName: '',
    logChatId: '',
    inlineBotToken: '',
    inlineBotUsername: '',
    approvedUsers: [],
    broadcastBlacklist: [],
  });

  const [vars, setVars] = useState<VarsData>({ userVars: {}, systemVars: {} });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [varKey, setVarKey] = useState('');
  const [varValue, setVarValue] = useState('');
  const [isSystemVar, setIsSystemVar] = useState(false);
  const [editing, setEditing] = useState<{ key: string; isSystem: boolean } | null>(null);
  const [varSearch, setVarSearch] = useState('');

  const [newApproved, setNewApproved] = useState('');
  const [newBlacklist, setNewBlacklist] = useState('');

  const [diag, setDiag] = useState<DiagnosticsData | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Token inline bot hanya dikirim ke server bila user benar-benar mengubahnya.
  // Tanpa ini, form yang gagal memuat data (state default '') akan menghapus token saat disimpan.
  const [tokenTouched, setTokenTouched] = useState(false);

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([api.getSettings(), api.getVars()]);
      if (s.success) {
        setSettings(s.settings);
        setTokenTouched(false);
      }
      if (v.success) setVars({ userVars: v.userVars || {}, systemVars: v.systemVars || {} });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat konfigurasi.', false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const res = await api.getDiagnostics();
      if (res.success) setDiag(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menjalankan diagnostik.', false);
    } finally {
      setDiagLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!active) return;
    loadAll();
  }, [active, loadAll]);

  useEffect(() => {
    if (active && sub === 'diag') loadDiag();
  }, [active, sub, loadDiag]);

  /* ------------------------------ actions ------------------------------ */

  const saveGeneral = async () => {
    setSaving(true);
    triggerHaptic('medium');
    try {
      // Kirim token HANYA kalau user mengubahnya — cegah penghapusan tak sengaja
      // (mis. form dimuat dari state default karena GET /api/settings gagal).
      const { inlineBotToken, ...rest } = settings;
      const payload = tokenTouched ? { ...rest, inlineBotToken } : rest;
      const res = await api.updateSettings(payload);
      if (res.success) {
        triggerHaptic('success');
        showToast(res.message || 'Setelan disimpan.', true);
        loadAll();
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan setelan.', false);
    } finally {
      setSaving(false);
    }
  };

  const saveVar = async () => {
    if (!varKey.trim() || !varValue.trim()) {
      showToast('Key dan nilai variabel wajib diisi.', false);
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await api.setVar(varKey.trim(), varValue.trim(), isSystemVar);
      if (res.success) {
        triggerHaptic('success');
        showToast(res.message || 'Variabel disimpan.', true);
        setVarKey('');
        setVarValue('');
        setIsSystemVar(false);
        setEditing(null);
        loadAll();
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan variabel.', false);
    }
  };

  const deleteVar = async (key: string, sys = false) => {
    triggerHaptic('warning');
    try {
      const res = await api.deleteVar(key, sys);
      if (res.success) {
        triggerHaptic('success');
        showToast(res.message || 'Variabel dihapus.', true);
        loadAll();
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menghapus variabel.', false);
    }
  };

  const startEditVar = (key: string, value: string, sys: boolean) => {
    triggerHaptic('light');
    setEditing({ key, isSystem: sys });
    setVarKey(key);
    setVarValue(String(value));
    setIsSystemVar(sys);
  };

  const addApproved = async () => {
    const id = Number(newApproved.trim());
    if (!id || Number.isNaN(id)) {
      showToast('Masukkan Telegram User ID numerik yang valid.', false);
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await api.addApprovedUser(id);
      if (res.success) {
        triggerHaptic('success');
        setSettings((p) => ({ ...p, approvedUsers: res.approvedUsers }));
        setNewApproved('');
        showToast(`User ${id} ditambahkan ke whitelist.`, true);
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menambah user.', false);
    }
  };

  const removeApproved = async (id: number) => {
    triggerHaptic('warning');
    try {
      const res = await api.removeApprovedUser(id);
      if (res.success) {
        setSettings((p) => ({ ...p, approvedUsers: res.approvedUsers }));
        showToast(`User ${id} dihapus dari whitelist.`, true);
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menghapus user.', false);
    }
  };

  const addBlacklist = async () => {
    const cid = newBlacklist.trim();
    if (!cid) {
      showToast('Masukkan Chat ID yang valid.', false);
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await api.addBroadcastBlacklist(cid);
      if (res.success) {
        setSettings((p) => ({ ...p, broadcastBlacklist: res.broadcastBlacklist }));
        setNewBlacklist('');
        showToast(`Chat ${cid} masuk blacklist broadcast.`, true);
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menambah blacklist.', false);
    }
  };

  const removeBlacklist = async (cid: string) => {
    triggerHaptic('warning');
    try {
      const res = await api.removeBroadcastBlacklist(cid);
      if (res.success) {
        setSettings((p) => ({ ...p, broadcastBlacklist: res.broadcastBlacklist }));
        showToast(`Chat ${cid} dihapus dari blacklist.`, true);
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menghapus blacklist.', false);
    }
  };

  const doLogout = async () => {
    setLoggingOut(true);
    triggerHaptic('heavy');
    try {
      const res = await api.logoutSession();
      if (res.success) {
        showToast(res.message || 'Sesi dihapus.', true);
        setTimeout(() => window.location.reload(), 1300);
      }
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal logout.', false);
      setLoggingOut(false);
    }
  };

  /* ------------------------------- render ------------------------------ */

  if (loading) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={44} count={1} />
        <Skeleton height={132} count={2} />
        <Skeleton height={88} count={1} />
      </div>
    );
  }

  const subTabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: 'general', label: 'Umum', icon: Sliders },
    { id: 'vars', label: 'Vars', icon: Database },
    { id: 'access', label: 'Akses', icon: Shield },
    { id: 'diag', label: 'Diagnostik', icon: Activity },
  ];

  const userVarEntries = Object.entries(vars.userVars || {}).filter(([k]) =>
    !varSearch.trim() || k.toLowerCase().includes(varSearch.toLowerCase().trim())
  );
  const sysVarEntries = Object.entries(vars.systemVars || {}).filter(([k]) =>
    !varSearch.trim() || k.toLowerCase().includes(varSearch.toLowerCase().trim())
  );

  const renderVarList = (
    entries: [string, string][],
    prefix: string,
    sys: boolean
  ) =>
    entries.map(([key, val]) => {
      const k = `${prefix}${key}`;
      const open = revealed[k];
      return (
        <div key={k} className="row" style={{ alignItems: 'flex-start' }}>
          <span className="row-body">
            <span className="pill" style={{ fontSize: 11 }}>{key}</span>
            <button
              onClick={() => {
                triggerHaptic('light');
                setRevealed((p) => ({ ...p, [k]: !p[k] }));
              }}
              style={{ display: 'block', background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', marginTop: 6 }}
            >
              <span className="mono fs-12" style={{ wordBreak: 'break-all', opacity: open ? 0.92 : 0.42 }}>
                {open ? String(val) : '••••••••••••••'}
              </span>
            </button>
          </span>
          <span className="center gap-6 shrink-0">
            <button className="icon-btn" style={{ width: 30, height: 30, border: 0, background: 'transparent' }} onClick={() => setRevealed((p) => ({ ...p, [k]: !p[k] }))} aria-label="Tampilkan">
              {open ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button className="icon-btn" style={{ width: 30, height: 30, border: 0, background: 'transparent' }} onClick={() => startEditVar(key, String(val), sys)} aria-label="Edit">
              <Edit2 size={15} />
            </button>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30, border: 0, background: 'transparent', color: 'var(--danger)' }}
              onClick={() => deleteVar(key, sys)}
              aria-label="Hapus"
            >
              <Trash2 size={15} />
            </button>
          </span>
        </div>
      );
    });

  return (
    <div className="page stack gap-14">
      {toast && (
        <Toast tone={toast.ok ? 'ok' : 'err'}>
          {toast.ok ? <Check size={17} /> : <AlertTriangle size={17} />}
          <span className="grow">{toast.text}</span>
        </Toast>
      )}

      {/* --------------------------- SUB TAB BAR --------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
          padding: 4,
          borderRadius: 'var(--r-md)',
          background: 'var(--tg-section)',
          border: 'var(--hairline) solid var(--tg-separator)',
        }}
      >
        {subTabs.map((t) => {
          const Icon = t.icon;
          const on = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                triggerHaptic('selectionChanged');
                setSub(t.id);
              }}
              className="press"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '8px 4px',
                borderRadius: 10,
                border: 0,
                cursor: 'pointer',
                background: on ? 'var(--tg-btn)' : 'transparent',
                color: on ? 'var(--tg-btn-text)' : 'var(--tg-hint)',
                fontSize: 11.5,
                fontWeight: on ? 750 : 600,
                transition: 'all 0.2s ease',
              }}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ============================= GENERAL ============================= */}
      {sub === 'general' && (
        <>
          <section>
            <SectionLabel><MessageSquare size={13} /> Prefix perintah</SectionLabel>
            <Card pad>
              <div className="between mb-12">
                <span className="fs-13 op-75">Karakter awalan modul</span>
                <span className="pill" style={{ fontSize: 15, padding: '4px 12px' }}>{settings.prefix}</span>
              </div>
              <div className="center gap-8 wrap">
                {PREFIXES.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      triggerHaptic('light');
                      setSettings((prev) => ({ ...prev, prefix: p }));
                    }}
                    className="press"
                    style={{
                      flex: '1 0 42px',
                      height: 42,
                      borderRadius: 'var(--r-md)',
                      border: settings.prefix === p ? '2px solid var(--info)' : 'var(--hairline) solid var(--tg-separator)',
                      background: settings.prefix === p ? 'var(--info-soft)' : 'var(--tg-section)',
                      color: 'inherit',
                      fontSize: 17,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                className="input mono mt-10"
                maxLength={5}
                placeholder="Prefix kustom…"
                value={settings.prefix}
                onChange={(e) => setSettings((p) => ({ ...p, prefix: e.target.value }))}
              />
            </Card>
          </section>

          <section>
            <SectionLabel><ShieldCheck size={13} /> Proteksi & respons</SectionLabel>
            <Card>
              <Row
                icon={<Shield size={16} />}
                title="Anti-PM Guard"
                desc="Peringatkan spammer di pesan pribadi"
                right={
                  <Switch
                    checked={settings.antiPm}
                    onChange={(v) => {
                      triggerHaptic('light');
                      setSettings((p) => ({ ...p, antiPm: v }));
                    }}
                    label="Anti-PM"
                  />
                }
              />
              <Row
                icon={<Bot size={16} />}
                title="Auto-reply / Mode AFK"
                desc="Balas otomatis saat ada yang menandai Anda"
                right={
                  <Switch
                    checked={settings.autoReply}
                    onChange={(v) => {
                      triggerHaptic('light');
                      setSettings((p) => ({ ...p, autoReply: v }));
                    }}
                    label="Auto-reply"
                  />
                }
              />
              <div style={{ padding: '14px 15px' }}>
                <div className="field-label">
                  <span>Pesan balasan AFK</span>
                  <span className="num op-6">{settings.afkReason.length}/200</span>
                </div>
                <textarea
                  className="input"
                  maxLength={200}
                  rows={2}
                  placeholder="Contoh: Sedang AFK, silakan tinggalkan pesan."
                  value={settings.afkReason}
                  onChange={(e) => setSettings((p) => ({ ...p, afkReason: e.target.value }))}
                />
              </div>
            </Card>
          </section>

          <section>
            <SectionLabel><Sparkles size={13} /> Identitas & integrasi</SectionLabel>
            <Card pad>
              <div className="mb-12">
                <div className="field-label">Nama kustom userbot</div>
                <input
                  className="input"
                  maxLength={50}
                  placeholder="Contoh: Delta Ubot VIP"
                  value={settings.customName}
                  onChange={(e) => setSettings((p) => ({ ...p, customName: e.target.value }))}
                />
              </div>

              <div className="mb-12">
                <div className="field-label">Chat ID log</div>
                <input
                  className="input mono"
                  placeholder="-1001234567890 atau me"
                  value={settings.logChatId}
                  onChange={(e) => setSettings((p) => ({ ...p, logChatId: e.target.value }))}
                />
              </div>

              <div
                style={{
                  padding: 13,
                  borderRadius: 'var(--r-md)',
                  background: 'color-mix(in srgb, var(--tg-bg) 45%, transparent)',
                  border: 'var(--hairline) solid var(--tg-separator)',
                }}
              >
                <div className="between mb-12">
                  <span className="center gap-7 fs-13 fw-7"><Bot size={15} color="var(--info)" /> Inline helper bot</span>
                  {settings.inlineBotUsername ? (
                    <Badge tone="ok">@{settings.inlineBotUsername}</Badge>
                  ) : (
                    <Badge tone="muted">Belum dipasang</Badge>
                  )}
                </div>
                <p className="fs-11 hint m-0 mb-12" style={{ lineHeight: 1.5 }}>
                  Token HTTP API dari @BotFather — mengaktifkan tombol navigasi interaktif pada menu <b>.help</b>.
                  {' '}Kosongkan field ini lalu simpan untuk mencopot token.
                </p>
                <input
                  className="input mono"
                  type="password"
                  placeholder="123456789:ABCDefgh…"
                  autoComplete="off"
                  value={settings.inlineBotToken}
                  onChange={(e) => {
                    setTokenTouched(true);
                    setSettings((p) => ({ ...p, inlineBotToken: e.target.value }));
                  }}
                />
              </div>
            </Card>
          </section>

          <button className="btn primary press" onClick={saveGeneral} disabled={saving}>
            {saving ? <Spinner size={17} /> : <Save size={17} />}
            <span>{saving ? 'Menyimpan…' : 'Simpan setelan'}</span>
          </button>
        </>
      )}

      {/* ============================== VARS ============================== */}
      {sub === 'vars' && (
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
                <button className="btn primary press" onClick={saveVar}>
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
      )}

      {/* ============================= ACCESS ============================= */}
      {sub === 'access' && (
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
      )}

      {/* ============================== DIAG ============================== */}
      {sub === 'diag' && (
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
      )}
    </div>
  );
};

/* Crown icon kecil untuk section label system vars */
const CrownIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold)' }}>
    <path d="M3 18h18M4 7l4 4 4-6 4 6 4-4-2 9H6L4 7z" />
  </svg>
);

export default SettingsTab;
