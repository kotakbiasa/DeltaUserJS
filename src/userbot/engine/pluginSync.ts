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
 * Scan file .ts di setiap kategori, generate manifest on-the-fly.
 */
export async function syncPluginRegistry(): Promise<PluginManifest[]> {
  const registry: PluginManifest[] = [];

  for (const cat of CATEGORIES) {
    try {
      // Fetch daftar file di kategori ini via GitHub API
      const apiUrl = `https://api.github.com/repos/kotakbiasa/DeltaUserJS-Plugins/contents/${cat}`;
      const apiRes = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      
      if (!apiRes.ok) {
        Logger.logSystem(`Failed to fetch ${cat} from GitHub API: ${apiRes.status}`, 'WARN');
        continue;
      }

      const files = await apiRes.json() as Array<{ name: string; type: string }>;
      
      for (const file of files) {
        if (file.type !== 'file' || !file.name.endsWith('.ts')) continue;
        
        const name = file.name.replace('.ts', '');
        registry.push({
          name,
          version: '1.0.0',
          description: `${name} plugin`,
          author: 'kotakbiasa',
          repository: 'https://github.com/kotakbiasa/DeltaUserJS-Plugins',
          entryPoint: file.name,
          permissions: ['fs.read'],
          category: cat,
        });
      }
    } catch (err) {
      Logger.logSystem(`Error syncing ${cat}: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    }
  }

  Logger.logSystem(`📦 Synced ${registry.length} plugins from GitHub`, 'INFO');
  return registry;
}

/**
 * Get plugin download URL
 */
export function getPluginDownloadUrl(category: string, name: string, entryPoint: string): string {
  return `${PLUGINS_REPO}/${category}/${entryPoint}`;
}
