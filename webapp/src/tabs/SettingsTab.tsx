import React, { useState, useEffect } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import {
  Sliders,
  Database,
  Shield,
  Activity,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  LogOut,
  Bot,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { api, UserMe, UserSettings, VarsData, DiagnosticsData } from '../api';
import { triggerHaptic } from '../telegram';

interface SettingsTabProps {
  user: UserMe;
}

const COMMON_PREFIXES = ['.', '!', ',', '#', '?', '~'];

export function SettingsTab({ user }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<'general' | 'vars' | 'access' | 'diag'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // General Settings State
  const [settings, setSettings] = useState<UserSettings>({
    prefix: '.',
    antiPm: false,
    autoReply: false,
    afkReason: 'Sedang AFK, silakan tinggalkan pesan.',
    customName: '',
    logChatId: '',
    inlineBotToken: '',
    inlineBotUsername: '',
    approvedUsers: [],
    broadcastBlacklist: [],
  });

  // Vars State
  const [varsData, setVarsData] = useState<VarsData>({ userVars: {}, systemVars: {} });
  const [revealedVars, setRevealedVars] = useState<Record<string, boolean>>({});
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [isSystemVarInput, setIsSystemVarInput] = useState(false);
  const [editingVar, setEditingVar] = useState<{ key: string; value: string; isSystem: boolean } | null>(null);

  // Access (Whitelist / Blacklist) State
  const [newApprovedId, setNewApprovedId] = useState('');
  const [newBlacklistId, setNewBlacklistId] = useState('');

  // Diagnostics State
  const [diag, setDiag] = useState<DiagnosticsData | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Danger Zone
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const showBanner = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [setRes, varsRes] = await Promise.all([api.getSettings(), api.getVars()]);
      if (setRes.success) {
        setSettings(setRes.settings);
      }
      if (varsRes.success) {
        setVarsData({
          userVars: varsRes.userVars || {},
          systemVars: varsRes.systemVars || {},
        });
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Gagal memuat konfigurasi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const res = await api.getDiagnostics();
      if (res.success) {
        setDiag(res);
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Gagal menjalankan diagnostik.', 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (subTab === 'diag') {
      loadDiagnostics();
    }
  }, [subTab]);

  // Save General Settings
  const handleSaveGeneral = async () => {
    setSaving(true);
    triggerHaptic('medium');
    try {
      const res = await api.updateSettings(settings);
      if (res.success) {
        triggerHaptic('success');
        showBanner(res.message, 'success');
        loadAllData();
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menyimpan setelan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Var Reveal
  const toggleReveal = (key: string) => {
    triggerHaptic('light');
    setRevealedVars((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Save or Update Var
  const handleSaveVar = async () => {
    if (!newVarKey.trim() || !newVarValue.trim()) {
      showBanner('Key dan Value variabel wajib diisi.', 'error');
      return;
    }

    triggerHaptic('medium');
    try {
      const res = await api.setVar(newVarKey.trim(), newVarValue.trim(), isSystemVarInput);
      if (res.success) {
        triggerHaptic('success');
        showBanner(res.message, 'success');
        setNewVarKey('');
        setNewVarValue('');
        setIsSystemVarInput(false);
        setEditingVar(null);
        loadAllData();
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menyimpan variabel.', 'error');
    }
  };

  // Delete Var
  const handleDeleteVar = async (key: string, isSystem = false) => {
    triggerHaptic('warning');
    try {
      const res = await api.deleteVar(key, isSystem);
      if (res.success) {
        triggerHaptic('success');
        showBanner(res.message, 'success');
        loadAllData();
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menghapus variabel.', 'error');
    }
  };

  // Whitelist Add
  const handleAddApproved = async () => {
    const idNum = Number(newApprovedId.trim());
    if (!idNum || isNaN(idNum)) {
      showBanner('Masukkan Telegram User ID angka yang valid.', 'error');
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await api.addApprovedUser(idNum);
      if (res.success) {
        triggerHaptic('success');
        setSettings((prev) => ({ ...prev, approvedUsers: res.approvedUsers }));
        setNewApprovedId('');
        showBanner(`User ${idNum} berhasil ditambahkan ke Whitelist!`, 'success');
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menambah user.', 'error');
    }
  };

  // Whitelist Remove
  const handleRemoveApproved = async (id: number) => {
    triggerHaptic('warning');
    try {
      const res = await api.removeApprovedUser(id);
      if (res.success) {
        triggerHaptic('success');
        setSettings((prev) => ({ ...prev, approvedUsers: res.approvedUsers }));
        showBanner(`User ${id} dihapus dari Whitelist.`, 'success');
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menghapus user.', 'error');
    }
  };

  // Blacklist Add
  const handleAddBlacklist = async () => {
    const cid = newBlacklistId.trim();
    if (!cid) {
      showBanner('Masukkan Chat ID yang valid (misal: -100...).', 'error');
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await api.addBroadcastBlacklist(cid);
      if (res.success) {
        triggerHaptic('success');
        setSettings((prev) => ({ ...prev, broadcastBlacklist: res.broadcastBlacklist }));
        setNewBlacklistId('');
        showBanner(`Chat ${cid} masuk daftar Blacklist Broadcast!`, 'success');
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menambah blacklist.', 'error');
    }
  };

  // Blacklist Remove
  const handleRemoveBlacklist = async (cid: string) => {
    triggerHaptic('warning');
    try {
      const res = await api.removeBroadcastBlacklist(cid);
      if (res.success) {
        triggerHaptic('success');
        setSettings((prev) => ({ ...prev, broadcastBlacklist: res.broadcastBlacklist }));
        showBanner(`Chat ${cid} dihapus dari Blacklist.`, 'success');
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal menghapus blacklist.', 'error');
    }
  };

  // Session Logout
  const handleLogout = async () => {
    setLoggingOut(true);
    triggerHaptic('heavy');
    try {
      const res = await api.logoutSession();
      if (res.success) {
        showBanner(res.message, 'success');
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err) {
      triggerHaptic('error');
      showBanner(err instanceof Error ? err.message : 'Gagal logout.', 'error');
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 14 }}>
        <Spinner size="l" />
        <div style={{ fontSize: 13, opacity: 0.7, fontWeight: 500 }}>Memuat Setelan Akun &amp; Variabel...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 30 }}>
      {/* Segment Switcher Header */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          background: 'rgba(255, 255, 255, 0.05)',
          padding: 4,
          borderRadius: 14,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflowX: 'auto',
        }}
      >
        <button
          onClick={() => {
            triggerHaptic('selectionChanged');
            setSubTab('general');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12,
            fontWeight: subTab === 'general' ? 700 : 500,
            background: subTab === 'general' ? 'var(--tg-theme-button-color, #0284c7)' : 'transparent',
            color: subTab === 'general' ? '#ffffff' : 'inherit',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
          }}
        >
          <Sliders size={14} />
          <span>Umum</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('selectionChanged');
            setSubTab('vars');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12,
            fontWeight: subTab === 'vars' ? 700 : 500,
            background: subTab === 'vars' ? 'var(--tg-theme-button-color, #0284c7)' : 'transparent',
            color: subTab === 'vars' ? '#ffffff' : 'inherit',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
          }}
        >
          <Database size={14} />
          <span>Vars</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('selectionChanged');
            setSubTab('access');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12,
            fontWeight: subTab === 'access' ? 700 : 500,
            background: subTab === 'access' ? 'var(--tg-theme-button-color, #0284c7)' : 'transparent',
            color: subTab === 'access' ? '#ffffff' : 'inherit',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
          }}
        >
          <Shield size={14} />
          <span>Akses</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('selectionChanged');
            setSubTab('diag');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12,
            fontWeight: subTab === 'diag' ? 700 : 500,
            background: subTab === 'diag' ? 'var(--tg-theme-button-color, #0284c7)' : 'transparent',
            color: subTab === 'diag' ? '#ffffff' : 'inherit',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
          }}
        >
          <Activity size={14} />
          <span>Diagnostik</span>
        </button>
      </div>

      {/* Status Feedback Toast/Banner */}
      {message && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: message.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: message.type === 'success' ? '#22c55e' : '#ef4444',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {message.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 1: UMUM (GENERAL SETTINGS) */}
      {/* ============================================================ */}
      {subTab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Card: Command Prefix */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>💬</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Prefix Perintah</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>Karakter awalan untuk memanggil modul</div>
                </div>
              </div>
              <span className="code-pill" style={{ fontSize: 14, fontWeight: 800, padding: '4px 10px' }}>
                {settings.prefix}
              </span>
            </div>

            {/* Quick Pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {COMMON_PREFIXES.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    triggerHaptic('light');
                    setSettings((prev) => ({ ...prev, prefix: p }));
                  }}
                  style={{
                    flex: '1 0 40px',
                    height: 38,
                    borderRadius: 10,
                    border: settings.prefix === p ? '2px solid var(--tg-theme-button-color, #0284c7)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: settings.prefix === p ? 'rgba(2, 132, 199, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: 'inherit',
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                maxLength={5}
                placeholder="Prefix kustom..."
                value={settings.prefix}
                onChange={(e) => setSettings((prev) => ({ ...prev, prefix: e.target.value }))}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Card: Proteksi Anti-PM & Mode AFK */}
          <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>
              🛡️ Proteksi &amp; Respons Otomatis
            </div>

            {/* Anti-PM Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Anti-PM Guard</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>Peringatkan dan batasi spammer di pesan pribadi</div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.antiPm}
                  onChange={(e) => {
                    triggerHaptic('light');
                    setSettings((prev) => ({ ...prev, antiPm: e.target.checked }));
                  }}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: settings.antiPm ? 'var(--tg-theme-button-color, #0284c7)' : 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 24,
                    transition: '0.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      content: '""',
                      height: 18,
                      width: 18,
                      left: settings.antiPm ? 22 : 3,
                      bottom: 3,
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.2s',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  />
                </span>
              </label>
            </div>

            <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.06)' }} />

            {/* AFK Auto-Reply Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Auto-Reply / Mode AFK</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>Balas otomatis saat ada yang menandai Anda</div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.autoReply}
                  onChange={(e) => {
                    triggerHaptic('light');
                    setSettings((prev) => ({ ...prev, autoReply: e.target.checked }));
                  }}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: settings.autoReply ? 'var(--tg-theme-button-color, #0284c7)' : 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 24,
                    transition: '0.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      content: '""',
                      height: 18,
                      width: 18,
                      left: settings.autoReply ? 22 : 3,
                      bottom: 3,
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.2s',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  />
                </span>
              </label>
            </div>

            {/* AFK Reason Input */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.85 }}>Pesan Balasan AFK:</div>
              <textarea
                maxLength={200}
                rows={2}
                value={settings.afkReason}
                onChange={(e) => setSettings((prev) => ({ ...prev, afkReason: e.target.value }))}
                placeholder="Alasan AFK..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 10, opacity: 0.5, textAlign: 'right', marginTop: 2 }}>
                {settings.afkReason.length}/200 karakter
              </div>
            </div>
          </div>

          {/* Card: Identitas & Helper Bot */}
          <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>
              🏷️ Identitas &amp; Integrasi Bot
            </div>

            {/* Custom Bot Name */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.85 }}>Nama Kustom Userbot:</div>
              <input
                type="text"
                maxLength={50}
                placeholder="Contoh: Delta Ubot VIP"
                value={settings.customName}
                onChange={(e) => setSettings((prev) => ({ ...prev, customName: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Log Chat ID */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.85 }}>
                Chat ID Log (<code>LOG_CHAT_ID</code>):
              </div>
              <input
                type="text"
                placeholder="Contoh: -1001234567890 atau me"
                value={settings.logChatId}
                onChange={(e) => setSettings((prev) => ({ ...prev, logChatId: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Inline Helper Bot */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bot size={16} color="var(--tg-theme-button-color, #0284c7)" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Inline Helper Bot (@BotFather)</span>
                </div>
                {settings.inlineBotUsername ? (
                  <span style={{ fontSize: 11, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                    @{settings.inlineBotUsername}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, opacity: 0.5 }}>Belum terpasang</span>
                )}
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>
                Dipakai agar menu <code>.help</code> menampilkan tombol navigasi interaktif. Masukkan HTTP API Token dari @BotFather.
              </p>
              <input
                type="password"
                placeholder="123456789:ABCDefgh..."
                value={settings.inlineBotToken}
                onChange={(e) => setSettings((prev) => ({ ...prev, inlineBotToken: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 12,
                  outline: 'none',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Action Button: Simpan Semua */}
          <button
            onClick={handleSaveGeneral}
            disabled={saving}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, var(--tg-theme-button-color, #0284c7) 0%, #0369a1 100%)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.3)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Spinner size="s" /> : <Check size={18} />}
            <span>{saving ? 'Menyimpan...' : 'Simpan Setelan'}</span>
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 2: VARS (VARIABEL AKUN & SISTEM) */}
      {/* ============================================================ */}
      {subTab === 'vars' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Card: Add / Edit Var Form */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Database size={18} color="var(--tg-theme-button-color, #0284c7)" />
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {editingVar ? `Edit Variabel: ${editingVar.key}` : 'Tambah Variabel Baru'}
                </span>
              </div>
              {editingVar && (
                <button
                  onClick={() => {
                    setEditingVar(null);
                    setNewVarKey('');
                    setNewVarValue('');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
              )}
            </div>

            {/* Preset Buttons */}
            {!editingVar && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>Preset Cepat:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['PREFIX', 'INLINE_BOT_TOKEN', 'LOG_CHAT_ID'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        triggerHaptic('light');
                        setNewVarKey(preset);
                        setIsSystemVarInput(false);
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.07)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '4px 8px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      +{preset}
                    </button>
                  ))}
                  {user.isOwner && (
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setIsSystemVarInput(true);
                        setNewVarKey('SYSTEM_LOG_CHAT_ID');
                      }}
                      style={{
                        background: 'rgba(234, 179, 8, 0.15)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        padding: '4px 8px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#eab308',
                        cursor: 'pointer',
                      }}
                    >
                      👑 +System Var
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="KUNCI (Misal: MY_CONFIG)"
                value={newVarKey}
                disabled={Boolean(editingVar)}
                onChange={(e) => setNewVarKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />

              <input
                type="text"
                placeholder="Nilai variabel..."
                value={newVarValue}
                onChange={(e) => setNewVarValue(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                }}
              />

              {user.isOwner && !editingVar && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isSystemVarInput}
                    onChange={(e) => setIsSystemVarInput(e.target.checked)}
                  />
                  <span>Simpan sebagai <b>System Var</b> (Global Master)</span>
                </label>
              )}

              <button
                onClick={handleSaveVar}
                style={{
                  padding: '10px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--tg-theme-button-color, #0284c7)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Plus size={16} />
                <span>{editingVar ? 'Perbarui Variabel' : 'Simpan Variabel'}</span>
              </button>
            </div>
          </div>

          {/* List: Variabel Akun Pengguna */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>
                📋 Variabel Akun Anda ({Object.keys(varsData.userVars).length})
              </div>
              <button
                onClick={loadAllData}
                style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer' }}
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {Object.keys(varsData.userVars).length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.5, textAlign: 'center', padding: '16px 0' }}>
                Belum ada variabel tersimpan.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(varsData.userVars).map(([key, val]) => {
                  const isRevealed = revealedVars[`user_${key}`];
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span className="code-pill" style={{ fontSize: 12, fontWeight: 700 }}>
                            {key}
                          </span>
                        </div>
                        <div
                          onClick={() => toggleReveal(`user_${key}`)}
                          style={{
                            fontSize: 12,
                            fontFamily: 'monospace',
                            opacity: isRevealed ? 0.9 : 0.45,
                            cursor: 'pointer',
                            wordBreak: 'break-all',
                          }}
                        >
                          {isRevealed ? String(val) : '•••••••••••••••• (tap to see)'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => toggleReveal(`user_${key}`)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 6,
                            color: 'inherit',
                            opacity: 0.7,
                            cursor: 'pointer',
                          }}
                        >
                          {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          onClick={() => {
                            triggerHaptic('light');
                            setEditingVar({ key, value: String(val), isSystem: false });
                            setNewVarKey(key);
                            setNewVarValue(String(val));
                            setIsSystemVarInput(false);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 6,
                            color: 'inherit',
                            opacity: 0.7,
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteVar(key, false)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 6,
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Owner Only: System Vars */}
          {user.isOwner && varsData.systemVars && (
            <div
              className="glass-card"
              style={{
                padding: '16px',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                background: 'linear-gradient(180deg, rgba(234, 179, 8, 0.05) 0%, rgba(0, 0, 0, 0.15) 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="#eab308" />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#eab308', textTransform: 'uppercase' }}>
                    👑 System Vars (Master Config)
                  </span>
                </div>
                <span className="code-pill" style={{ fontSize: 11, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
                  {Object.keys(varsData.systemVars).length} Vars
                </span>
              </div>

              {Object.keys(varsData.systemVars).length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', padding: '12px 0' }}>
                  Belum ada system vars yang disetel.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(varsData.systemVars).map(([key, val]) => {
                    const isRevealed = revealedVars[`sys_${key}`];
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(234, 179, 8, 0.15)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#fef08a' }}>
                            {key}
                          </div>
                          <div
                            onClick={() => toggleReveal(`sys_${key}`)}
                            style={{
                              fontSize: 11,
                              fontFamily: 'monospace',
                              opacity: isRevealed ? 0.9 : 0.45,
                              cursor: 'pointer',
                              wordBreak: 'break-all',
                            }}
                          >
                            {isRevealed ? String(val) : '••••••••••••••••'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => toggleReveal(`sys_${key}`)}
                            style={{ background: 'transparent', border: 'none', padding: 6, color: 'inherit', opacity: 0.7, cursor: 'pointer' }}
                          >
                            {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button
                            onClick={() => {
                              triggerHaptic('light');
                              setEditingVar({ key, value: String(val), isSystem: true });
                              setNewVarKey(key);
                              setNewVarValue(String(val));
                              setIsSystemVarInput(true);
                            }}
                            style={{ background: 'transparent', border: 'none', padding: 6, color: 'inherit', opacity: 0.7, cursor: 'pointer' }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteVar(key, true)}
                            style={{ background: 'transparent', border: 'none', padding: 6, color: '#ef4444', cursor: 'pointer' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 3: AKSES (WHITELIST & BLACKLIST) */}
      {/* ============================================================ */}
      {subTab === 'access' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Whitelist Users */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={18} color="#22c55e" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Whitelist User (Approved)</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>ID pengguna yang diizinkan bypass PM atau pakai bot</div>
              </div>
            </div>

            {/* Input Add User ID */}
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input
                type="number"
                placeholder="Telegram User ID (angka)..."
                value={newApprovedId}
                onChange={(e) => setNewApprovedId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAddApproved}
                style={{
                  padding: '0 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#22c55e',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Plus size={16} />
                <span>Tambah</span>
              </button>
            </div>

            {settings.approvedUsers.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', padding: '12px 0' }}>
                Belum ada user yang di-whitelist.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settings.approvedUsers.map((uid) => (
                  <div
                    key={uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{uid}</span>
                    <button
                      onClick={() => handleRemoveApproved(uid)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: 4, cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Broadcast Blacklist */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MessageSquare size={18} color="#ef4444" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Blacklist Siaran (Gcast)</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>ID Chat yang dikecualikan agar tidak menerima broadcast</div>
              </div>
            </div>

            {/* Input Add Chat ID */}
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input
                type="text"
                placeholder="Chat ID (contoh: -100123...)"
                value={newBlacklistId}
                onChange={(e) => setNewBlacklistId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAddBlacklist}
                style={{
                  padding: '0 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Plus size={16} />
                <span>Tambah</span>
              </button>
            </div>

            {settings.broadcastBlacklist.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', padding: '12px 0' }}>
                Belum ada chat yang di-blacklist.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settings.broadcastBlacklist.map((cid) => (
                  <div
                    key={cid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{cid}</span>
                    <button
                      onClick={() => handleRemoveBlacklist(cid)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: 4, cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 4: DIAGNOSTIK & SESI (DANGER ZONE) */}
      {/* ============================================================ */}
      {subTab === 'diag' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Card: MTProto Live Diagnostics */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="var(--tg-theme-button-color, #0284c7)" />
                <span style={{ fontSize: 14, fontWeight: 700 }}>Diagnostik Mesin Userbot</span>
              </div>
              <button
                onClick={loadDiagnostics}
                disabled={diagLoading}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'inherit',
                  cursor: diagLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={13} className={diagLoading ? 'spin-icon' : ''} />
                <span>Uji Ulang</span>
              </button>
            </div>

            {diagLoading && !diag ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <Spinner size="m" />
              </div>
            ) : diag ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Latensi Ping (DC)</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: diag.pingMs > 0 ? '#22c55e' : '#ef4444' }}>
                    {diag.pingMs > 0 ? `${diag.pingMs} ms` : 'Offline'}
                  </div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>DataCenter ID</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>DC {diag.dcId}</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Status Koneksi</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: diag.connected ? '#22c55e' : '#ef4444' }}>
                    {diag.connected ? '🟢 Terhubung' : '🔴 Terputus'}
                  </div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>FloodGuard</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: diag.floodGuard?.inCooldown ? '#ef4444' : '#22c55e' }}>
                    {diag.floodGuard?.inCooldown ? `⚠️ Cooldown ${diag.floodGuard.remainingSeconds}s` : '🟢 Normal / Safe'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Card: Danger Zone / Logout */}
          <div
            className="glass-card"
            style={{
              padding: '16px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, rgba(0, 0, 0, 0.15) 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={18} color="#ef4444" />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>Zona Bahaya (Danger Zone)</span>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
              Menghapus sesi akun akan memutuskan koneksi userbot dari server secara permanen. Anda perlu registrasi / login ulang via OTP atau QR Code untuk menggunakan bot kembali.
            </p>

            {!showLogoutConfirm ? (
              <button
                onClick={() => {
                  triggerHaptic('warning');
                  setShowLogoutConfirm(true);
                }}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: 12,
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <LogOut size={16} />
                <span>Logout &amp; Hapus Sesi Akun</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textAlign: 'center' }}>
                  Apakah Anda yakin ingin logout permanen?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 10,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'transparent',
                      color: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: loggingOut ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loggingOut ? 'Memproses...' : 'Ya, Logout Sekarang'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
