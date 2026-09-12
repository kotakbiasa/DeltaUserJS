import React, { useState, useEffect } from 'react';
import { Button, Card, Spinner, Banner, Checkbox, Cell, Textarea } from '@telegram-apps/telegram-ui';
import { Send, ShieldAlert } from 'lucide-react';
import { api, ChatItem } from '../api';
import { triggerHaptic } from '../telegram';

export const BroadcastTab: React.FC = () => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'section' | 'inline'; isSuccess: boolean; text: string } | null>(null);

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

  const handleSelectAll = () => {
    triggerHaptic('medium');
    if (selectedChatIds.length === chats.length) {
      setSelectedChatIds([]);
    } else {
      setSelectedChatIds(chats.map((c) => c.id));
    }
  };

  const handleSend = async () => {
    if (!message.trim()) {
      triggerHaptic('warning');
      setStatusBanner({ type: 'section', isSuccess: false, text: 'Pesan siaran tidak boleh kosong.' });
      return;
    }
    if (selectedChatIds.length === 0) {
      triggerHaptic('warning');
      setStatusBanner({ type: 'section', isSuccess: false, text: 'Pilih minimal satu target chat/grup.' });
      return;
    }

    triggerHaptic('medium');
    setSending(true);
    setStatusBanner(null);

    try {
      const res = await api.sendBroadcast(selectedChatIds, message);
      if (res.success) {
        triggerHaptic('success');
        setStatusBanner({ type: 'section', isSuccess: true, text: res.message || 'Siaran berhasil dijadwalkan!' });
        setMessage('');
        setSelectedChatIds([]);
      }
    } catch (err) {
      triggerHaptic('error');
      setStatusBanner({ type: 'section', isSuccess: false, text: err instanceof Error ? err.message : 'Gagal mengirim siaran.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: '12px 16px 80px 16px' }}>
      {statusBanner && (
        <Banner
          type={statusBanner.type}
          header={statusBanner.isSuccess ? 'Sukses' : 'Peringatan'}
          description={statusBanner.text}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Safety Notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          color: '#38bdf8',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        <ShieldAlert size={18} />
        <span>Pesan disiarkan dengan interval cerdas anti-flood (1.2s jeda).</span>
      </div>

      {/* Message Composer Card */}
      <Card type="plain" style={{ padding: 16, borderRadius: 14, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 600 }}>Tulis Pesan Siaran</h3>
        <Textarea
          placeholder="Ketik isi pesan siaran Anda di sini..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />

        {message.trim() && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(0, 0, 0, 0.2)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>PREVIEW PESAN:</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{message}</div>
          </div>
        )}
      </Card>

      {/* Target Chats Selection */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Pilih Target ({selectedChatIds.length}/{chats.length})
        </h3>
        {chats.length > 0 && (
          <Button size="s" mode="bezeled" onClick={handleSelectAll}>
            {selectedChatIds.length === chats.length ? 'Batal Pilih' : 'Pilih Semua'}
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size="m" />
        </div>
      ) : chats.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', opacity: 0.6, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
          Tidak ada daftar obrolan aktif. Pastikan userbot sudah online dan memiliki riwayat chat.
        </div>
      ) : (
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.08)', maxHeight: 280, overflowY: 'auto' }}>
          {chats.map((c) => {
            const isSelected = selectedChatIds.includes(c.id);
            return (
              <Cell
                key={c.id}
                before={<Checkbox checked={isSelected} onChange={() => handleToggleChat(c.id)} />}
                description={c.isChannel ? 'Saluran / Channel' : c.isGroup ? 'Grup Obrolan' : 'Obrolan Pribadi'}
                onClick={() => handleToggleChat(c.id)}
              >
                {c.title}
              </Cell>
            );
          })}
        </div>
      )}

      {/* Send Button */}
      <div style={{ marginTop: 16 }}>
        <Button
          size="l"
          stretched
          loading={sending}
          disabled={!message.trim() || selectedChatIds.length === 0}
          onClick={handleSend}
          before={<Send size={18} />}
        >
          Kirim Siaran ({selectedChatIds.length} Tujuan)
        </Button>
      </div>
    </div>
  );
};
