import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Wrench, Shield, Users, Terminal, X, ChevronDown, ChevronRight, Sparkles, Info,
} from 'lucide-react';
import { api, PluginItem } from '../api';
import { triggerHaptic } from '../telegram';
import { Card, SectionLabel, Switch, Banner, Skeleton, Empty, Badge } from '../ui';

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'var(--danger)' },
  group: { label: 'Grup', color: 'var(--info)' },
  tools: { label: 'Tools', color: 'var(--violet)' },
  system: { label: 'Sistem', color: 'var(--gold)' },
  util: { label: 'Utilitas', color: 'var(--ok)' },
};

const catMeta = (c: string) =>
  CATEGORY_META[c.toLowerCase()] ?? { label: c, color: 'var(--info)' };

export const PluginsTab: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    try {
      setErrorMsg(null);
      const res = await api.getPlugins();
      if (res.success) setPlugins(res.plugins);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat plugin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchPlugins();
  }, [active, fetchPlugins]);

  const handleToggle = async (plugin: PluginItem) => {
    const next = !plugin.enabled;
    triggerHaptic('light');
    setPending((p) => ({ ...p, [plugin.name]: true }));
    setPlugins((prev) => prev.map((p) => (p.name === plugin.name ? { ...p, enabled: next } : p)));
    try {
      await api.togglePlugin(plugin.name, next);
      triggerHaptic(next ? 'success' : 'warning');
    } catch (err) {
      triggerHaptic('error');
      setPlugins((prev) => prev.map((p) => (p.name === plugin.name ? { ...p, enabled: !next } : p)));
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status plugin');
    } finally {
      setPending((p) => ({ ...p, [plugin.name]: false }));
    }
  };

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    plugins.forEach((p) => counts.set(p.category.toLowerCase(), (counts.get(p.category.toLowerCase()) || 0) + 1));
    return [
      { id: 'all', label: 'Semua', count: plugins.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, label: catMeta(id).label, count })),
    ];
  }, [plugins]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return plugins.filter((p) => {
      if (category !== 'all' && p.category.toLowerCase() !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.usage.toLowerCase().includes(q)
      );
    });
  }, [plugins, category, search]);

  const activeCount = plugins.filter((p) => p.enabled).length;

  if (loading && plugins.length === 0) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={48} count={1} />
        <Skeleton height={36} count={1} />
        <Skeleton height={82} count={5} />
      </div>
    );
  }

  return (
    <div className="page stack gap-12">
      {errorMsg && <Banner tone="danger" icon={<Shield size={17} />}>{errorMsg}</Banner>}

      {/* ------------------------------ SEARCH ----------------------------- */}
      <div style={{ position: 'relative' }}>
        <Search
          size={17}
          className="hint"
          style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          className="input"
          type="search"
          inputMode="search"
          placeholder={`Cari ${plugins.length} plugin…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 39, paddingRight: search ? 40 : 13 }}
        />
        {search && (
          <button
            className="icon-btn"
            onClick={() => setSearch('')}
            aria-label="Bersihkan pencarian"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, border: 0, background: 'transparent' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ---------------------------- CATEGORIES --------------------------- */}
      <div className="chip-row no-scrollbar">
        {categories.map((c) => (
          <button
            key={c.id}
            className={`chip ${category === c.id ? 'on' : ''}`}
            onClick={() => {
              triggerHaptic('light');
              setCategory(c.id);
            }}
          >
            {c.label}
            <span className="chip-count num">{c.count}</span>
          </button>
        ))}
      </div>

      {/* ------------------------------ SUMMARY ---------------------------- */}
      <div className="between" style={{ padding: '0 4px' }}>
        <span className="fs-12 hint">
          Menampilkan <b className="num" style={{ color: 'var(--tg-text)' }}>{filtered.length}</b> modul
        </span>
        <Badge tone="ok">● {activeCount} aktif</Badge>
      </div>

      {/* ------------------------------- LIST ------------------------------ */}
      {filtered.length === 0 ? (
        <Card>
          <Empty icon="🔍" title="Plugin tidak ditemukan" desc={`Tidak ada modul yang cocok dengan "${search || category}".`} />
        </Card>
      ) : (
        <Card>
          {filtered.map((plugin) => {
            const meta = catMeta(plugin.category);
            const open = expanded === plugin.name;
            return (
              <div key={plugin.name}>
                <div className="row" style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: open ? 12 : 14 }}>
                  <span
                    className="shrink-0"
                    style={{
                      width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', marginTop: 1,
                      background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color,
                    }}
                  >
                    {plugin.category.toLowerCase() === 'admin' ? <Shield size={18} />
                      : plugin.category.toLowerCase() === 'group' ? <Users size={18} />
                      : plugin.category.toLowerCase() === 'system' ? <Wrench size={18} />
                      : plugin.category.toLowerCase() === 'tools' ? <Terminal size={18} />
                      : <Sparkles size={18} />}
                  </span>

                  <button
                    className="row-body"
                    onClick={() => {
                      triggerHaptic('light');
                      setExpanded(open ? null : plugin.name);
                    }}
                    style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span className="center gap-8" style={{ flexWrap: 'wrap' }}>
                      <span className="row-title">{plugin.title}</span>
                      <span className="badge" style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}>
                        {meta.label}
                      </span>
                      {!plugin.enabled && <Badge tone="muted">Off</Badge>}
                    </span>
                    <span
                      className="row-desc"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: open ? 99 : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {plugin.description}
                    </span>
                    <span className="center gap-6 mt-6 fs-11 hint">
                      <span className="pill" style={{ fontSize: 11 }}>{plugin.usage.split('\n')[0] || `.${plugin.name}`}</span>
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                  </button>

                  <Switch
                    checked={plugin.enabled}
                    disabled={Boolean(pending[plugin.name])}
                    onChange={() => handleToggle(plugin)}
                    label={`Aktifkan ${plugin.title}`}
                  />
                </div>

                {open && (
                  <div style={{ padding: '0 15px 14px', animation: 'pageIn 0.24s ease' }}>
                    <div className="fs-11 fw-8 hint center gap-6 mb-12" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      <Info size={12} /> Panduan perintah
                    </div>
                    <pre className="code-block">{plugin.usage}</pre>
                    {plugin.detail && (
                      <div className="fs-12 op-75 mt-10" style={{ lineHeight: 1.55 }}>{plugin.detail}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <SectionLabel>Total {plugins.length} plugin terpasang</SectionLabel>
    </div>
  );
};
