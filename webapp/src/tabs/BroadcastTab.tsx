import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send, ShieldAlert, CheckCircle2, Radio, Check, Bold, Italic, Code, Eye, Search, X, Megaphone,
} from 'lucide-react';
import { api, ChatItem } from '../api';
import { triggerHaptic } from '../telegram';
import { Card, SectionLabel, Banner, Skeleton, Empty, Badge, Toast, Spinner } from '../ui';

type Filter = 'all' | 'groups' | 'channels';

export const BroadcastTab: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchChats = useCallback(async () => {
    try {
      const res = await api.getChats();
      if (res.success) setChats(res.chats);
    } catch (err) {
      setToast({ ok: false, text: err instanceof Error ? err.message : 'Gagal memuat daftar obrolan.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchChats();
  }, [active, fetchChats]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredChats = useMemo(() => {
    const q = search.toLowerCase().trim();
    return chats.filter((c) => {
      if (filter === 'groups' && !c.isGroup) return false;
      if (filter === 'channels' && !c.isChannel) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [chats, filter, search]);

  const counts = useMemo(
    () => ({
      all: chats.length,
      groups: chats.filter((c) => c.isGroup).length,
      channels: chats.filter((c) => c.isChannel).length,
    }),
    [chats]
  );

  const toggleChat = (id: string) => {
    triggerHaptic('light');
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allFilteredSelected = filteredChats.length > 0 && filteredChats.every((c) => selected.includes(c.id));

  const selectAll = () => {
    triggerHaptic('medium');
    const ids = filteredChats.map((c) => c.id);
    setSelected((prev) => (allFilteredSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  };

  const insert = (wrap: string) => {
    triggerHaptic('light');
    setMessage((prev) => `${prev}${wrap}Teks${wrap}`);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      triggerHaptic('warning');
      setToast({ ok: false, text: 'Pesan siaran tidak boleh kosong.' });
      return;
    }
    if (selected.length === 0) {
      triggerHaptic('warning');
      setToast({ ok: false, text: 'Pilih minimal satu target obrolan.' });
      return;
    }
    triggerHaptic('medium');
    setSending(true);
    try {
      const res = await api.sendBroadcast(selected, message);
      if (res.success) {
        triggerHaptic('success');
        setToast({ ok: true, text: res.message || 'Siaran dikirim di background.' });
        setMessage('');
        setSelected([]);
      }
    } catch (err) {
      triggerHaptic('error');
      setToast({ ok: false, text: err instanceof Error ? err.message : 'Gagal mengirim siaran.' });
    } finally {
      setSending(false);
    }
  };

  const canSend = Boolean(message.trim()) && selected.length > 0 && !sending;

  if (loading && chats.length === 0) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={190} count={1} />
        <Skeleton height={44} count={1} />
        <Skeleton height={62} count={4} />
      </div>
    );
  }

  return (
    <div className="page stack gap-14">
      {toast && (
        <Toast tone={toast.ok ? 'ok' : 'err'}>
          {toast.ok ? <CheckCircle2 size={17} /> : <ShieldAlert size={17} />}
          <span className="grow">{toast.text}</span>
        </Toast>
      )}

      {/* ---------------------------- COMPOSER ---------------------------- */}
      <section>
        <SectionLabel
          right={
            <span className="center gap-6">
              <button className="icon-btn" style={{ width: 28, height: 28, borderRadius: 9 }} onClick={() => insert('**')} aria-label="Tebal">
                <Bold size={13} />
              </button>
              <button className="icon-btn" style={{ width: 28, height: 28, borderRadius: 9 }} onClick={() => insert('*')} aria-label="Miring">
                <Italic size={13} />
              </button>
              <button className="icon-btn" style={{ width: 28, height: 28, borderRadius: 9 }} onClick={() => insert('`')} aria-label="Kode">
                <Code size={13} />
              </button>
            </span>
          }
        >
          <Megaphone size={13} /> Tulis pesan
        </SectionLabel>

        <Card pad>
          <textarea
            className="input"
            placeholder="Ketik isi pesan siaran…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
          />
          <div className="between mt-10 fs-12 hint">
            <span className="num">{message.length} karakter</span>
            {message.trim() && <span className="center gap-6" style={{ color: 'var(--info)' }}><Eye size={12} /> Pratinjau di bawah</span>}
          </div>

          {message.trim() && (
            <div className="mt-12" style={{ animation: 'pageIn 0.24s ease' }}>
              <div className="divider mb-12" />
              <div className="fs-11 fw-8 hint mb-12" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Tampilan di Telegram
              </div>
              <div className="center" style={{ justifyContent: 'flex-end' }}>
                <div className="bubble" style={{ maxWidth: '88%' }}>
                  {message}
                  <div className="between fs-11 op-6" style={{ justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
                    <span>12:00</span>
                    <Check size={12} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        <div className="banner info mt-10">
          <Radio size={16} className="shrink-0" />
          <span className="fs-12">Jeda otomatis 1,2 detik per obrolan untuk menghindari FloodWait Telegram.</span>
        </div>
      </section>

      {/* ----------------------------- TARGETS ---------------------------- */}
      <section>
        <SectionLabel
          right={
            filteredChats.length > 0 ? (
              <button className="btn ghost sm" onClick={selectAll}>
                {allFilteredSelected ? 'Batal pilih' : 'Pilih semua'}
              </button>
            ) : null
          }
        >
          Target obrolan {selected.length > 0 && <Badge tone="info">{selected.length} dipilih</Badge>}
        </SectionLabel>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search
            size={16}
            className="hint"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            className="input"
            type="search"
            placeholder="Cari obrolan…"
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

        <div className="chip-row no-scrollbar">
          {(
            [
              { id: 'all', label: 'Semua', n: counts.all },
              { id: 'groups', label: 'Grup', n: counts.groups },
              { id: 'channels', label: 'Channel', n: counts.channels },
            ] as { id: Filter; label: string; n: number }[]
          ).map((f) => (
            <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="chip-count num">{f.n}</span>
            </button>
          ))}
        </div>

        <Card>
          {chats.length === 0 ? (
            <Empty icon="📭" title="Tidak ada obrolan" desc="Pastikan userbot online dan sudah pernah membuka chat." />
          ) : filteredChats.length === 0 ? (
            <Empty icon="🔍" title="Tidak ditemukan" desc={`Tidak ada obrolan cocok dengan "${search}".`} />
          ) : (
            <div className="list-scroll no-scrollbar">
              {filteredChats.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button key={c.id} className="row row-btn" onClick={() => toggleChat(c.id)}>
                    <span className={`row-check ${on ? 'on' : ''}`}>
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <span className="row-body">
                      <span className="row-title truncate" style={{ display: 'block' }}>{c.title}</span>
                      <span className="row-desc" style={{ display: 'block' }}>
                        {c.isChannel ? '📢 Saluran' : c.isGroup ? '👥 Grup' : '💬 Pribadi'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      <button className={`btn wide ${canSend ? 'primary' : 'ghost'} press`} onClick={handleSend} disabled={!canSend}>
        {sending ? <Spinner size={18} /> : <Send size={17} />}
        <span>Kirim siaran {selected.length > 0 ? `(${selected.length})` : ''}</span>
      </button>
    </div>
  );
};
