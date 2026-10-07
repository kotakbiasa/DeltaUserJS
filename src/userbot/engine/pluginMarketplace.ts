import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { Logger } from '../../utils/logger.js';
import { unregisterPlugin, loadedPlugins, registerPlugin } from './pluginRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Direktori data marketplace, di root repo.
 *
 * Sebelumnya `'../../plugins_marketplace'` — dari `dist/userbot/engine` itu
 * jatuh di `dist/plugins_marketplace`, sehingga registry dan seluruh plugin
 * terpasang **ikut terhapus setiap kali `dist/` dibangun ulang** (dan tidak
 * pernah cocok dengan entri `plugins_marketplace/` di .gitignore). Butuh tiga
 * tingkat untuk keluar dari `dist/`.
 */
export const marketplaceDir = process.env.PLUGINS_MARKETPLACE_DIR
  || path.resolve(__dirname, '../../../plugins_marketplace');
const registryFile = path.join(marketplaceDir, 'registry.json');

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string; // GitHub/GitLab URL
  entryPoint: string; // relative to repo root
  permissions: PluginPermission[];
  minBotVersion?: string;
  tags?: string[];
  homepage?: string;
  license?: string;
  category?: string; // tools, util, group, system
}

export type PluginPermission =
  | 'fs.read'
  | 'fs.write'
  | 'net.http'
  | 'db.read'
  | 'db.write'
  | 'bot.send'
  | 'bot.edit'
  | 'user.info'
  | 'exec'; // Owner-only, hidden from marketplace menu

interface InstalledPlugin {
  manifest: PluginManifest;
  installedAt: string;
  updatedAt: string;
  localPath: string;
  commitHash?: string;
}

let registry: Record<string, PluginManifest> = {};
const installedPlugins: Record<string, InstalledPlugin> = {};

/**
 * Initialize marketplace directory and load registry
 */
export async function initPluginMarketplace() {
  try {
    await mkdir(marketplaceDir, { recursive: true });
    await mkdir(path.join(marketplaceDir, 'installed'), { recursive: true });

    // Load registry
    try {
      const data = await readFile(registryFile, 'utf-8');
      registry = JSON.parse(data);
      Logger.logSystem(`📦 Plugin marketplace registry loaded: ${Object.keys(registry).length} plugins`, 'INFO');
    } catch {
      // Registry doesn't exist, create empty
      await writeFile(registryFile, JSON.stringify({}, null, 2));
      Logger.logSystem('📦 Plugin marketplace registry created', 'INFO');
    }

    // Load installed plugins
    await loadInstalledPlugins();
  } catch (err) {
    Logger.logSystem(`Failed to init plugin marketplace: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
  }
}

/**
 * Load installed plugins from disk
 */
async function loadInstalledPlugins() {
  const installedDir = path.join(marketplaceDir, 'installed');
  try {
    const dirs = await readdir(installedDir);
    for (const dir of dirs) {
      const manifestPath = path.join(installedDir, dir, 'manifest.json');
      try {
        const data = await readFile(manifestPath, 'utf-8');
        const installed: InstalledPlugin = JSON.parse(data);
        installedPlugins[dir] = installed;
      } catch {
        // Skip invalid
      }
    }
    Logger.logSystem(`📦 Loaded ${Object.keys(installedPlugins).length} installed plugins`, 'INFO');
  } catch {
    // Directory doesn't exist yet
  }
}

/**
 * Save registry to file
 */
async function saveRegistry() {
  await writeFile(registryFile, JSON.stringify(registry, null, 2));
}

/**
 * Add plugin to registry (from GitHub/GitLab)
 */
export async function addPluginToRegistry(manifest: PluginManifest): Promise<void> {
  // Names become directory names and callback-data fragments, so keep them bounded and path-safe.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(manifest.name)) {
    throw new Error('Invalid plugin name. Use 1-48 letters, numbers, dots, dashes, or underscores.');
  }

  // Validate required fields and repository before persisting untrusted registry data.
  if (!manifest.name || !manifest.version || !manifest.repository || !manifest.entryPoint) {
    throw new Error('Manifest missing required fields: name, version, repository, entryPoint');
  }
  let repositoryUrl: URL;
  try {
    repositoryUrl = new URL(manifest.repository);
  } catch {
    throw new Error('Repository must be a valid HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(repositoryUrl.protocol) || repositoryUrl.username || repositoryUrl.password) {
    throw new Error('Repository must be an HTTP(S) URL without embedded credentials.');
  }
  const normalizedEntryPoint = path.normalize(manifest.entryPoint);
  if (path.isAbsolute(manifest.entryPoint) || normalizedEntryPoint === '..' || normalizedEntryPoint.startsWith(`..${path.sep}`)) {
    throw new Error('Entry point must remain inside the plugin directory.');
  }

  // Validate permissions
  const validPermissions: PluginPermission[] = [
    'fs.read', 'fs.write', 'net.http',
    'db.read', 'db.write', 'bot.send', 'bot.edit', 'user.info', 'exec'
  ];
  for (const perm of manifest.permissions) {
    if (!validPermissions.includes(perm)) {
      throw new Error(`Invalid permission: ${perm}`);
    }
  }

  registry[manifest.name] = manifest;
  await saveRegistry();
  Logger.logSystem(`📦 Added plugin to registry: ${manifest.name}@${manifest.version}`, 'INFO');
}

/**
 * Remove plugin from registry
 */
export async function removePluginFromRegistry(name: string): Promise<void> {
  delete registry[name];
  await saveRegistry();
}

/**
 * Get all plugins in registry
 */
export function getRegistryPlugins(): PluginManifest[] {
  return Object.values(registry).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get plugin manifest by name
 */
export function getPluginManifest(name: string): PluginManifest | undefined {
  return registry[name];
}

/**
 * Install plugin from registry
 */
export async function installPlugin(name: string, version?: string): Promise<InstalledPlugin> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) {
    throw new Error('Invalid plugin name.');
  }
  const manifest = registry[name];
  if (!manifest) {
    throw new Error(`Plugin ${name} not found in registry`);
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(manifest.name)) {
    throw new Error('Invalid plugin name in registry.');
  }
  let repositoryUrl: URL;
  try {
    repositoryUrl = new URL(manifest.repository);
  } catch {
    throw new Error('Invalid repository URL in registry.');
  }
  if (!['http:', 'https:'].includes(repositoryUrl.protocol) || repositoryUrl.username || repositoryUrl.password) {
    throw new Error('Invalid repository URL in registry.');
  }
  const normalizedEntryPoint = path.normalize(manifest.entryPoint);
  if (path.isAbsolute(manifest.entryPoint) || normalizedEntryPoint === '..' || normalizedEntryPoint.startsWith(`..${path.sep}`)) {
    throw new Error('Invalid entry point in registry.');
  }

  if (version && manifest.version !== version) {
    throw new Error(`Version ${version} not available for ${name}`);
  }

  // Check if already installed
  if (installedPlugins[name]) {
    throw new Error(`Plugin ${name} already installed. Use update instead.`);
  }

  const installDir = path.join(marketplaceDir, 'installed', name);
  await mkdir(installDir, { recursive: true });

  try {
    // Clone or download plugin (simplified - in production use git clone)
    // For now, we'll create a placeholder structure
    await writeFile(path.join(installDir, 'manifest.json'), JSON.stringify({
      manifest,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      localPath: installDir,
    }, null, 2));

    // Create placeholder plugin file
    const installRoot = path.resolve(installDir);
    const entryPointPath = path.resolve(installDir, manifest.entryPoint);
    if (entryPointPath !== installRoot && !entryPointPath.startsWith(`${installRoot}${path.sep}`)) {
      throw new Error('Entry point must remain inside the plugin directory.');
    }
    await mkdir(path.dirname(entryPointPath), { recursive: true });
    await writeFile(entryPointPath, `// Plugin: ${manifest.name} v${manifest.version}\n// Auto-generated placeholder\n\nexport default {\n  name: ${JSON.stringify(manifest.name)},\n  help: {\n    title: ${JSON.stringify(manifest.name)},\n    description: ${JSON.stringify(manifest.description)},\n    usage: '',\n    detail: 'Installed from marketplace'\n  },\n  async execute() {}\n};\n`);

    const installed: InstalledPlugin = {
      manifest,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      localPath: installDir,
    };

    installedPlugins[name] = installed;
    Logger.logSystem(`📦 Installed plugin: ${name}@${manifest.version}`, 'SUCCESS');
    return installed;
  } catch (err) {
    // Cleanup on failure
    await rm(installDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Update installed plugin
 */
export async function updatePlugin(name: string): Promise<InstalledPlugin> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) {
    throw new Error('Invalid plugin name.');
  }
  const installed = installedPlugins[name];
  if (!installed) {
    throw new Error(`Plugin ${name} not installed`);
  }

  const manifest = registry[name];
  if (!manifest) {
    throw new Error(`Plugin ${name} not found in registry`);
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(manifest.name)) {
    throw new Error('Invalid plugin name in registry.');
  }
  let repositoryUrl: URL;
  try {
    repositoryUrl = new URL(manifest.repository);
  } catch {
    throw new Error('Invalid repository URL in registry.');
  }
  if (!['http:', 'https:'].includes(repositoryUrl.protocol) || repositoryUrl.username || repositoryUrl.password) {
    throw new Error('Invalid repository URL in registry.');
  }
  const normalizedEntryPoint = path.normalize(manifest.entryPoint);
  if (path.isAbsolute(manifest.entryPoint) || normalizedEntryPoint === '..' || normalizedEntryPoint.startsWith(`..${path.sep}`)) {
    throw new Error('Invalid entry point in registry.');
  }
  const installedRoot = path.resolve(marketplaceDir, 'installed');
  const localPath = path.resolve(installed.localPath);
  if (!localPath.startsWith(`${installedRoot}${path.sep}`)) {
    throw new Error('Invalid installed plugin path.');
  }

  if (manifest.version === installed.manifest.version) {
    throw new Error(`Plugin ${name} already at latest version (${manifest.version})`);
  }

  // Backup old version
  const backupDir = path.join(marketplaceDir, 'installed', `${name}.backup.${Date.now()}`);
  await mkdir(backupDir, { recursive: true });
  // Copy current files to backup (simplified)

    // Update manifest
    installed.manifest = manifest;
    installed.updatedAt = new Date().toISOString();

    await writeFile(path.join(installed.localPath, 'manifest.json'), JSON.stringify(installed, null, 2));

    // Update entry point file without allowing a manifest to escape the install directory.
    const entryPointPath = path.resolve(installed.localPath, manifest.entryPoint);
    if (entryPointPath !== localPath && !entryPointPath.startsWith(`${localPath}${path.sep}`)) {
      throw new Error('Entry point must remain inside the plugin directory.');
    }
    await writeFile(entryPointPath, `// Plugin: ${manifest.name} v${manifest.version}\n// Updated: ${new Date().toISOString()}\n\nexport default {\n  name: ${JSON.stringify(manifest.name)},\n  help: {\n    title: ${JSON.stringify(manifest.name)},\n    description: ${JSON.stringify(manifest.description)},\n    usage: '',\n    detail: 'Updated from marketplace'\n  },\n  async execute() {}\n};\n`);

    Logger.logSystem(`📦 Updated plugin: ${name} to v${manifest.version}`, 'SUCCESS');
    return installed;

}

/**
 * Remove installed plugin
 */
export async function removePlugin(name: string): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) {
    throw new Error('Invalid plugin name.');
  }
  const installed = installedPlugins[name];
  if (!installed) {
    throw new Error(`Plugin ${name} not installed`);
  }

  const installedRoot = path.resolve(marketplaceDir, 'installed');
  const localPath = path.resolve(installed.localPath);
  if (!localPath.startsWith(`${installedRoot}${path.sep}`)) {
    throw new Error('Invalid installed plugin path.');
  }
  await rm(localPath, { recursive: true, force: true });
  delete installedPlugins[name];
  Logger.logSystem(`📦 Removed plugin: ${name}`, 'INFO');
}

/**
 * Toggle plugin from bot menu (disable/enable)
 */
export function togglePluginFromBot(name: string, enabled: boolean): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) {
    throw new Error('Invalid plugin name.');
  }
  const installed = installedPlugins[name];
  if (!installed) {
    throw new Error(`Plugin ${name} not installed`);
  }

  if (enabled) {
    // Re-register plugin
    const plugin = loadedPlugins.find(p => p.name === name);
    if (plugin) {
      unregisterPlugin(name);
      registerPlugin(plugin, { file: plugin.file });
    }
  } else {
    // Unregister plugin
    unregisterPlugin(name);
  }
  Logger.logSystem(`📦 Plugin ${name} ${enabled ? 'enabled' : 'disabled'}`, 'INFO');
}

/**
 * Remove installed plugin (from bot menu)
 */
export async function uninstallPluginFromBot(name: string): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) {
    throw new Error('Invalid plugin name.');
  }
  const installed = installedPlugins[name];
  if (!installed) {
    throw new Error(`Plugin ${name} not installed`);
  }

  const installedRoot = path.resolve(marketplaceDir, 'installed');
  const localPath = path.resolve(installed.localPath);
  if (!localPath.startsWith(`${installedRoot}${path.sep}`)) {
    throw new Error('Invalid installed plugin path.');
  }
  await rm(localPath, { recursive: true, force: true });
  delete installedPlugins[name];
  Logger.logSystem(`📦 Removed plugin: ${name}`, 'INFO');
}

/**
 * Get all installed plugins
 */
export function getInstalledPlugins(): InstalledPlugin[] {
  return Object.values(installedPlugins).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/**
 * Check if plugin is installed
 */
export function isPluginInstalled(name: string): boolean {
  return name in installedPlugins;
}

/**
 * Search registry
 */
export function searchRegistry(query: string): PluginManifest[] {
  const q = query.toLowerCase();
  return Object.values(registry).filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.tags?.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Validate plugin permissions against allowed list
 */
export function validatePermissions(permissions: PluginPermission[], allowed: PluginPermission[]): { valid: boolean; invalid: PluginPermission[] } {
  const invalid = permissions.filter(p => !allowed.includes(p));
  return { valid: invalid.length === 0, invalid };
}

/**
 * Get plugin info for marketplace display
 */
export function getMarketplaceInfo(name: string) {
  const manifest = registry[name];
  const installed = installedPlugins[name];
  if (!manifest) {return null;}

  return {
    manifest,
    installed: !!installed,
    installedVersion: installed?.manifest.version,
    updateAvailable: installed && manifest.version !== installed.manifest.version,
  };
}