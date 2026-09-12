import React, { useState, useEffect } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { Send, Users, ShieldAlert, CheckCircle2, MessageSquare, Radio, CheckSquare, Square, Bold, Italic, Code, Eye } from 'lucide-react';
import { api, ChatItem } from '../api';
import { triggerHaptic } from '../telegram';

export const BroadcastTab: React.FC = () => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'groups' | 'channels'>('all');
  const [searchChat, setSearchChat] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ isSuccess: boolean; text: string } | null>(null);

  const fetchChats = async () => {
    try {
      const res = await api.getChats();
      if (res.success) {
        setChats(res.chats);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();
  }, []);

  const handleToggleChat = (id: string) => {
    triggerHaptic('light');
    setSelectedChatIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const filteredChats = chats.filter((c) => {
    const matchesFilter =
      chatFilter === 'all' ||
      (chatFilter === 'groups' && c.isGroup) ||
      (chatFilter === 'channels' && c.isChannel);
    const matchesSearch = !searchChat || c.title.toLowerCase().includes(searchChat.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleSelectAll = () => {
    triggerHaptic('medium');
    const filteredIds = filteredChats.map((c) => c.id);
    const allSelected = filteredIds.every((id) => selectedChatIds.includes(id));

    if (allSelected) {
      setSelectedChatIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedChatIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const insertFormat = (prefix: string, suffix = prefix) => {
    triggerHaptic('light');
    setMessage((prev) => prev + `${prefix}Teks${suffix}`);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      triggerHaptic('warning');
      setStatusBanner({ isSuccess: false, text: 'Pesan siaran tidak boleh kosong.' });
      return;
    }
    if (selectedChatIds.length === 0) {
      triggerHaptic('warning');
      setStatusBanner({ isSuccess: false, text: 'Pilih minimal satu target obrolan.' });
      return;
    }

    triggerHaptic('medium');
    setSending(true);
    setStatusBanner(null);

    try {
      const res = await api.sendBroadcast(selectedChatIds, message);
      if (res.success) {
        triggerHaptic('success');
        setStatusBanner({ isSuccess: true, text: res.message || 'Siaran berhasil dikirim di background!' });
        setMessage('');
        setSelectedChatIds([]);
      }
    } catch (err) {
      triggerHaptic('error');
      setStatusBanner({ isSuccess: false, text: err instanceof Error ? err.message : 'Gagal mengirim siaran.' });
    } finally {
      setSending(false);
    }
  };

  const groupsCount = chats.filter((c) => c.isGroup).length;
  const channelsCount = chats.filter((c) => c.isChannel).length;

  return (
    <div style={{ padding: '16px 16px 40px 16px', maxWidth: 600, margin: '0 auto' }}>
      {statusBanner && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: statusBanner.isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${statusBanner.isSuccess ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: statusBanner.isSuccess ? '#4ade80' : '#fca5a5',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {statusBanner.isSuccess ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
          <span>{statusBanner.text}</span>
        </div>
      )}

      {/* FloodGuard notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 12,
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          fontSize: 13,
          color: '#38bdf8',
          marginBottom: 16,
        }}
      >
        <Radio size={18} style={{ flexShrink: 0 }} />
        <span>Siaran otomatis memakai jeda 1.2 detik per chat agar terhindar dari limit FloodWait Telegram.</span>
      </div>

      {/* Composer Card */}
      <div className="glass-card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>✍️ Tulis Pesan Siaran</span>
          {/* Quick format toolbars */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => insertFormat('**', '**')}
              title="Bold"
              className="tap-effect"
              style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: 'var(--tg-text)', cursor: 'pointer' }}
            >
              <Bold size={14} />
            </button>
            <button
              onClick={() => insertFormat('*', '*')}
              title="Italic"
              className="tap-effect"
              style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: 'var(--tg-text)', cursor: 'pointer' }}
            >
              <Italic size={14} />
            </button>
            <button
              onClick={() => insertFormat('`', '`')}
              title="Code"
              className="tap-effect"
              style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: 'var(--tg-text)', cursor: 'pointer' }}
            >
              <Code size={14} />
            </button>
          </div>
        </div>

        <textarea
          placeholder="Ketik isi pesan siaran Anda di sini... (Mendukung format teks & link)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 12,
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--tg-card-border)',
            color: 'var(--tg-text)',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12, color: 'var(--tg-hint)' }}>
          <span>{message.length} Karakter</span>
          {message.trim() && <span style={{ color: 'var(--tg-link)' }}>Preview tersedia di bawah ↓</span>}
        </div>

        {/* Telegram Chat Bubble Preview */}
        {message.trim() && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--tg-hint)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={13} />
              <span>Simulasi Tampilan di Telegram</span>
            </div>
            <div className="tg-bubble">
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</div>
              <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.7, marginTop: 4, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                <span>12:00</span>
                <span>✓✓</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Target Selector Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>🎯 Pilih Target Obrolan</span>
          <span style={{ fontSize: 12, color: 'var(--tg-hint)', marginLeft: 8 }}>
            ({selectedChatIds.length} dipilih)
          </span>
        </div>
        {filteredChats.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="tap-effect"
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: 'var(--tg-link)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {filteredChats.every((c) => selectedChatIds.includes(c.id)) ? 'Batal Pilih' : 'Pilih Semua'}
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setChatFilter('all')}
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            border: chatFilter === 'all' ? '1px solid var(--tg-link)' : '1px solid var(--tg-card-border)',
            background: chatFilter === 'all' ? 'rgba(56, 189, 248, 0.15)' : 'var(--tg-card-bg)',
            color: chatFilter === 'all' ? 'var(--tg-link)' : 'var(--tg-hint)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Semua ({chats.length})
        </button>
        <button
          onClick={() => setChatFilter('groups')}
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            border: chatFilter === 'groups' ? '1px solid var(--tg-link)' : '1px solid var(--tg-card-border)',
            background: chatFilter === 'groups' ? 'rgba(56, 189, 248, 0.15)' : 'var(--tg-card-bg)',
            color: chatFilter === 'groups' ? 'var(--tg-link)' : 'var(--tg-hint)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Grup ({groupsCount})
        </button>
        <button
          onClick={() => setChatFilter('channels')}
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            border: chatFilter === 'channels' ? '1px solid var(--tg-link)' : '1px solid var(--tg-card-border)',
            background: chatFilter === 'channels' ? 'rgba(56, 189, 248, 0.15)' : 'var(--tg-card-bg)',
            color: chatFilter === 'channels' ? 'var(--tg-link)' : 'var(--tg-hint)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Channel ({channelsCount})
        </button>
      </div>

      {/* Target Chats List Container */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner size="m" />
        </div>
      ) : chats.length === 0 ? (
        <div className="glass-card" style={{ padding: 24, textAlign: 'center', color: 'var(--tg-hint)' }}>
          Tidak ada daftar obrolan aktif. Pastikan userbot sudah online dan terhubung.
        </div>
      ) : (
        <div
          className="glass-card no-scrollbar"
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filteredChats.map((c) => {
            const isSelected = selectedChatIds.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => handleToggleChat(c.id)}
                className="tap-effect"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                }}
              >
                {/* Checkbox icon */}
                <div style={{ color: isSelected ? '#38bdf8' : 'var(--tg-hint)' }}>
                  {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                </div>
                {/* Chat Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tg-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                    {c.isChannel ? '📢 Saluran' : c.isGroup ? '👥 Grup' : '💬 Pribadi'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Primary Send Button */}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || selectedChatIds.length === 0}
          className="tap-effect"
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: 14,
            border: 'none',
            background: !message.trim() || selectedChatIds.length === 0
              ? 'rgba(255, 255, 255, 0.1)'
              : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 700,
            cursor: !message.trim() || selectedChatIds.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: message.trim() && selectedChatIds.length > 0 ? '0 6px 24px rgba(2, 132, 199, 0.35)' : 'none',
          }}
        >
          {sending ? (
            <Spinner size="m" />
          ) : (
            <>
              <Send size={18} />
              <span>Kirim Siaran ({selectedChatIds.length} Obrolan)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
