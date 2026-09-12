import React, { useState, useEffect } from 'react';
import { Spinner, Switch } from '@telegram-apps/telegram-ui';
import { Search, Wrench, Shield, Users, Terminal, HelpCircle, X, ChevronDown, ChevronUp, Check, Info } from 'lucide-react';
import { api, PluginItem } from '../api';
import { triggerHaptic } from '../telegram';

export const PluginsTab: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPlugins = async () => {
    try {
      setErrorMsg(null);
      const res = await api.getPlugins();
      if (res.success) {
        setPlugins(res.plugins);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat plugin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggle = async (plugin: PluginItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextState = !plugin.enabled;
    triggerHaptic('light');

    setTogglingMap((prev) => ({ ...prev, [plugin.name]: true }));
    setPlugins((prev) =>
      prev.map((p) => (p.name === plugin.name ? { ...p, enabled: nextState } : p))
    );

    try {
      await api.togglePlugin(plugin.name, nextState);
      triggerHaptic(nextState ? 'success' : 'warning');
    } catch (err) {
      triggerHaptic('error');
      setPlugins((prev) =>
        prev.map((p) => (p.name === plugin.name ? { ...p, enabled: !nextState } : p))
      );
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status plugin');
    } finally {
      setTogglingMap((prev) => ({ ...prev, [plugin.name]: false }));
    }
  };

  const categories = [
    { id: 'all', label: 'Semua', icon: HelpCircle },
    { id: 'util', label: 'Utilitas', icon: HelpCircle },
    { id: 'tools', label: 'Tools', icon: Terminal },
    { id: 'admin', label: 'Admin', icon: Shield },
    { id: 'group', label: 'Grup', icon: Users },
    { id: 'system', label: 'Sistem', icon: Wrench },
  ];

  const filteredPlugins = plugins.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const query = search.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.title.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.usage.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'admin':
        return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' };
      case 'group':
        return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' };
      case 'tools':
        return { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)' };
      case 'system':
        return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };
      default:
        return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' };
    }
  };

  const getCategoryIcon = (category: string, size = 16) => {
    const { color } = getCategoryColor(category);
    switch (category.toLowerCase()) {
      case 'admin':
        return <Shield size={size} color={color} />;
      case 'group':
        return <Users size={size} color={color} />;
      case 'tools':
        return <Terminal size={size} color={color} />;
      case 'system':
        return <Wrench size={size} color={color} />;
      default:
        return <HelpCircle size={size} color={color} />;
    }
  };

  if (loading && plugins.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  const activeCount = plugins.filter((p) => p.enabled).length;

  return (
    <div style={{ padding: '16px 16px 40px 16px', maxWidth: 600, margin: '0 auto' }}>
      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Cari 58 plugin (ping, afk, purge, gcast)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 38px 12px 38px',
            borderRadius: 14,
            border: '1px solid var(--tg-card-border)',
            background: 'var(--tg-card-bg)',
            color: 'var(--tg-text)',
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s ease',
          }}
        />
        <Search
          size={18}
          color="var(--tg-hint)"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--tg-hint)',
              cursor: 'pointer',
              padding: 2,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Category Pills Slider */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 10,
          marginBottom: 12,
        }}
      >
        {categories.map((c) => {
          const isSelected = selectedCategory === c.id;
          const count = c.id === 'all'
            ? plugins.length
            : plugins.filter((p) => p.category.toLowerCase() === c.id.toLowerCase()).length;

          return (
            <button
              key={c.id}
              onClick={() => {
                triggerHaptic('light');
                setSelectedCategory(c.id);
              }}
              className="tap-effect"
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 20,
                border: isSelected ? '1px solid var(--tg-link, #38bdf8)' : '1px solid var(--tg-card-border)',
                background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'var(--tg-card-bg)',
                color: isSelected ? 'var(--tg-link, #38bdf8)' : 'var(--tg-hint)',
                fontSize: 13,
                fontWeight: isSelected ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <span>{c.label}</span>
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: isSelected ? '#38bdf8' : 'inherit',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats Counter Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: 'var(--tg-hint)',
          marginBottom: 12,
          padding: '0 4px',
        }}
      >
        <span>
          Menampilkan <b>{filteredPlugins.length}</b> dari {plugins.length} modul
        </span>
        <span style={{ color: '#22c55e', fontWeight: 600 }}>
          ● {activeCount} Aktif
        </span>
      </div>

      {/* Plugin Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredPlugins.length === 0 ? (
          <div
            className="glass-card"
            style={{ padding: 32, textAlign: 'center', color: 'var(--tg-hint)' }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tg-text)', marginBottom: 4 }}>
              Plugin tidak ditemukan
            </div>
            <div style={{ fontSize: 13 }}>
              Tidak ada hasil yang cocok dengan pencarian "{search}"
            </div>
          </div>
        ) : (
          filteredPlugins.map((plugin) => {
            const isExpanded = expandedPlugin === plugin.name;
            const catStyle = getCategoryColor(plugin.category);

            return (
              <div
                key={plugin.name}
                className="glass-card tap-effect"
                onClick={() => setExpandedPlugin(isExpanded ? null : plugin.name)}
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${plugin.enabled ? '#22c55e' : 'rgba(255, 255, 255, 0.15)'}`,
                }}
              >
                {/* Card Top Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  {/* Left info */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: catStyle.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {getCategoryIcon(plugin.category, 20)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tg-text)' }}>
                          {plugin.title}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: catStyle.bg,
                            color: catStyle.color,
                            fontWeight: 700,
                          }}
                        >
                          {plugin.category}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--tg-hint)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: isExpanded ? 99 : 2, WebkitBoxOrient: 'vertical' }}>
                        {plugin.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Switch Toggle */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={plugin.enabled}
                      disabled={togglingMap[plugin.name]}
                      onChange={() => handleToggle(plugin)}
                    />
                  </div>
                </div>

                {/* Command Usage Pill */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>Command:</span>
                    <span className="code-pill">
                      {plugin.usage.split('\n')[0] || `.${plugin.name}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--tg-hint)' }}>
                    <span>{isExpanded ? 'Tutup' : 'Detail'}</span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 10,
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tg-link)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Info size={14} />
                      <span>Panduan Perintah Lengkap:</span>
                    </div>
                    <pre style={{ margin: 0, fontSize: 12, color: 'var(--tg-text)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.5 }}>
                      {plugin.usage}
                    </pre>
                    {plugin.detail && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(255, 255, 255, 0.1)', fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
                        {plugin.detail}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
