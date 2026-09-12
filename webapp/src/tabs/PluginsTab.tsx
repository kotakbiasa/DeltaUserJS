import React, { useState, useEffect } from 'react';
import { Cell, Switch, Spinner, Banner, Input, Chip } from '@telegram-apps/telegram-ui';
import { Search, Wrench, Shield, Users, Terminal, HelpCircle } from 'lucide-react';
import { api, PluginItem } from '../api';
import { triggerHaptic } from '../telegram';

export const PluginsTab: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
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

  const handleToggle = async (plugin: PluginItem) => {
    const nextState = !plugin.enabled;
    triggerHaptic('light');

    setTogglingMap((prev) => ({ ...prev, [plugin.name]: true }));
    // Optimistic UI update
    setPlugins((prev) =>
      prev.map((p) => (p.name === plugin.name ? { ...p, enabled: nextState } : p))
    );

    try {
      await api.togglePlugin(plugin.name, nextState);
      triggerHaptic(nextState ? 'success' : 'warning');
    } catch (err) {
      triggerHaptic('error');
      // Rollback on error
      setPlugins((prev) =>
        prev.map((p) => (p.name === plugin.name ? { ...p, enabled: !nextState } : p))
      );
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status plugin');
    } finally {
      setTogglingMap((prev) => ({ ...prev, [plugin.name]: false }));
    }
  };

  const categories = [
    { id: 'all', label: 'Semua' },
    { id: 'util', label: 'Utilitas' },
    { id: 'tools', label: 'Tools' },
    { id: 'admin', label: 'Admin' },
    { id: 'group', label: 'Grup' },
    { id: 'system', label: 'Sistem' },
  ];

  const filteredPlugins = plugins.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.title.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'admin':
        return <Shield size={18} color="#ef4444" />;
      case 'group':
        return <Users size={18} color="#3b82f6" />;
      case 'tools':
        return <Terminal size={18} color="#a855f7" />;
      case 'system':
        return <Wrench size={18} color="#f59e0b" />;
      default:
        return <HelpCircle size={18} color="#10b981" />;
    }
  };

  if (loading && plugins.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 80px 16px' }}>
      {errorMsg && (
        <Banner
          type="section"
          header="Peringatan"
          description={errorMsg}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Search Input */}
      <div style={{ marginBottom: 12 }}>
        <Input
          header="Cari Plugin"
          placeholder="Ketik nama perintah atau plugin (cth: ping, afk, purge)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          before={<Search size={18} opacity={0.6} style={{ marginLeft: 8 }} />}
        />
      </div>

      {/* Category Chips */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 12,
          scrollbarWidth: 'none',
        }}
      >
        {categories.map((c) => (
          <Chip
            key={c.id}
            mode={selectedCategory === c.id ? 'mono' : 'elevated'}
            onClick={() => {
              triggerHaptic('light');
              setSelectedCategory(c.id);
            }}
          >
            {c.label}
          </Chip>
        ))}
      </div>

      {/* Total Active Count Banner */}
      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Menampilkan {filteredPlugins.length} dari {plugins.length} plugin</span>
        <span>{plugins.filter((p) => p.enabled).length} Aktif</span>
      </div>

      {/* List of Plugin Items */}
      <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {filteredPlugins.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>
            Tidak ada plugin yang cocok dengan pencarian "{search}"
          </div>
        ) : (
          filteredPlugins.map((plugin) => (
            <Cell
              key={plugin.name}
              before={getCategoryIcon(plugin.category)}
              description={plugin.description}
              subtitle={`Perintah: ${plugin.usage}`}
              after={
                <Switch
                  checked={plugin.enabled}
                  disabled={togglingMap[plugin.name]}
                  onChange={() => handleToggle(plugin)}
                />
              }
            >
              <div style={{ fontWeight: 600, fontSize: 15 }}>{plugin.title}</div>
            </Cell>
          ))
        )}
      </div>
    </div>
  );
};
