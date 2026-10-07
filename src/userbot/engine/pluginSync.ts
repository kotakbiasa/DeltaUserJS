import { Logger } from '../../utils/logger.js';
import type { PluginManifest } from './pluginMarketplace.js';

const PLUGINS_REPO = 'https://raw.githubusercontent.com/kotakbiasa/DeltaUserJS-Plugins/main';
const CATEGORIES = ['tools', 'util', 'group', 'system'] as const;

export type PluginCategory = typeof CATEGORIES[number];

export const CATEGORY_META: Record<PluginCategory, { label: string; emoji: string }> = {
  tools: { label: 'Tools', emoji: '🔧' },
  util: { label: 'Utilitas', emoji: '🛠️' },
  group: { label: 'Grup', emoji: '👥' },
  system: { label: 'Sistem', emoji: '⚙️' },
};

/**
 * Sync daftar plugin dari GitHub repo DeltaUserJS-Plugins.
 * Fetch manifest.json per kategori.
 */
export async function syncPluginRegistry(): Promise<PluginManifest[]> {
  const registry: PluginManifest[] = [];

  for (const cat of CATEGORIES) {
    try {
      // Fetch daftar plugin di kategori ini
      const listUrl = `${PLUGINS_REPO}/${cat}/plugins.json`;
      const listRes = await fetch(listUrl);
      if (!listRes.ok) {
        Logger.logSystem(`Failed to fetch plugin list for ${cat}: ${listRes.status}`, 'WARN');
        continue;
      }

      const plugins = await listRes.json() as Array<{ name: string }>;
      for (const plugin of plugins) {
        try {
          // Fetch manifest individual
          const manifestUrl = `${PLUGINS_REPO}/${cat}/${plugin.name}/manifest.json`;
          const manifestRes = await fetch(manifestUrl);
          if (!manifestRes.ok) {
            Logger.logSystem(`Failed to fetch manifest for ${cat}/${plugin.name}: ${manifestRes.status}`, 'WARN');
            continue;
          }

          const manifest = await manifestRes.json() as PluginManifest;
          registry.push({
            ...manifest,
            category: cat,
            repository: 'https://github.com/kotakbiasa/DeltaUserJS-Plugins',
          });
        } catch (err) {
          Logger.logSystem(`Error fetching manifest for ${cat}/${plugin.name}: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
        }
      }
    } catch (err) {
      Logger.logSystem(`Error fetching plugin list for ${cat}: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    }
  }

  Logger.logSystem(`📦 Synced ${registry.length} plugins from GitHub`, 'INFO');
  return registry;
}

/**
 * Get plugin download URL
 */
export function getPluginDownloadUrl(category: string, name: string, entryPoint: string): string {
  return `${PLUGINS_REPO}/${category}/${name}/${entryPoint}`;
}
