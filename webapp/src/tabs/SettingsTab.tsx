import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders, Database, Shield, Activity, Check, AlertTriangle, Eye, EyeOff, Plus, Trash2, Edit2,
  RefreshCw, LogOut, Bot, ShieldCheck, MessageSquare, Sparkles, Ticket, Search, Save, RotateCcw,
} from 'lucide-react';
import { api, UserMe, UserSettings, VarsData, DiagnosticsData } from '../api';
import { PREFIXES, VAR_PRESETS } from './settings/constants.js';
import { triggerHaptic } from '../telegram';
import { Card, SectionLabel, Row, Switch, Banner, Skeleton, Badge, Empty, Spinner, Tile, Toast } from '../ui';
import { GeneralSection } from './settings/GeneralSection.js';
import { VarsSection } from './settings/VarsSection.js';
import { AccessSection } from './settings/AccessSection.js';
import { DiagSection } from './settings/DiagSection.js';

interface SettingsTabProps {
  user: UserMe;
  active?: boolean;
}

type SubTab = 'general' | 'vars' | 'access' | 'diag';


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
        <GeneralSection
          settings={settings}
          setSettings={setSettings}
          setTokenTouched={setTokenTouched}
          saving={saving}
          saveGeneral={saveGeneral}
        />
      )}

      {/* ============================== VARS ============================== */}
      {sub === 'vars' && (
        <VarsSection
          user={user}
          vars={vars}
          varSearch={varSearch}
          setVarSearch={setVarSearch}
          varKey={varKey}
          setVarKey={setVarKey}
          varValue={varValue}
          setVarValue={setVarValue}
          editing={editing}
          setEditing={setEditing}
          isSystemVar={isSystemVar}
          setIsSystemVar={setIsSystemVar}
          saving={saving}
          saveVar={saveVar}
          userVarEntries={userVarEntries}
          sysVarEntries={sysVarEntries}
          renderVarList={renderVarList}
        />
      )}

      {/* ============================= ACCESS ============================= */}
      {sub === 'access' && (
        <AccessSection
          settings={settings}
          newApproved={newApproved}
          setNewApproved={setNewApproved}
          addApproved={addApproved}
          removeApproved={removeApproved}
          newBlacklist={newBlacklist}
          setNewBlacklist={setNewBlacklist}
          addBlacklist={addBlacklist}
          removeBlacklist={removeBlacklist}
        />
      )}

      {/* ============================== DIAG ============================== */}
      {sub === 'diag' && (
        <DiagSection
          user={user}
          diag={diag}
          diagLoading={diagLoading}
          loadDiag={loadDiag}
          vars={vars}
          confirmLogout={confirmLogout}
          setConfirmLogout={setConfirmLogout}
          loggingOut={loggingOut}
          doLogout={doLogout}
        />
      )}
    </div>
  );
};


export default SettingsTab;
