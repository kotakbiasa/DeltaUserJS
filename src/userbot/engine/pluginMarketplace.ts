import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { Logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketplaceDir = path.join(__dirname, '../../plugins_marketplace');
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
}

export type PluginPermission =
  | 'fs.read'
  | 'fs.write'
  | 'net.http'
  | 'eval'
  | 'shell'
  | 'db.read'
  | 'db.write'
  | 'bot.send'
  | 'bot.edit'
  | 'user.info';

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
  // Validate required fields
  if (!manifest.name || !manifest.version || !manifest.repository || !manifest.entryPoint) {
    throw new Error('Manifest missing required fields: name, version, repository, entryPoint');
  }

  // Validate permissions
  const validPermissions: PluginPermission[] = [
    'fs.read', 'fs.write', 'net.http', 'eval', 'shell',
    'db.read', 'db.write', 'bot.send', 'bot.edit', 'user.info'
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
  const manifest = registry[name];
  if (!manifest) {
    throw new Error(`Plugin ${name} not found in registry`);
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
    const entryPointPath = path.join(installDir, manifest.entryPoint);
    await mkdir(path.dirname(entryPointPath), { recursive: true });
    await writeFile(entryPointPath, `// Plugin: ${manifest.name} v${manifest.version}\n// Auto-generated placeholder\n\nexport default {\n  name: '${manifest.name}',\n  help: {\n    title: '${manifest.name}',\n    description: '${manifest.description}',\n    usage: '',\n    detail: 'Installed from marketplace'\n  },\n  async execute() {}\n};\n`);

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
  const installed = installedPlugins[name];
  if (!installed) {
    throw new Error(`Plugin ${name} not installed`);
  }

  const manifest = registry[name];
  if (!manifest) {
    throw new Error(`Plugin ${name} not found in registry`);
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

    // Update entry point file
    const entryPointPath = path.join(installed.localPath, manifest.entryPoint);
    await writeFile(entryPointPath, `// Plugin: ${manifest.name} v${manifest.version}\n// Updated: ${new Date().toISOString()}\n\nexport default {\n  name: '${manifest.name}',\n  help: {\n    title: '${manifest.name}',\n    description: '${manifest.description}',\n    usage: '',\n    detail: 'Updated from marketplace'\n  },\n  async execute() {}\n};\n`);

    Logger.logSystem(`📦 Updated plugin: ${name} to v${manifest.version}`, 'SUCCESS');
    return installed;

}

/**
 * Remove installed plugin
 */
export async function removePlugin(name: string): Promise<void> {
  const installed = installedPlugins[name];
  if (!installed) {
    throw new Error(`Plugin ${name} not installed`);
  }

  await rm(installed.localPath, { recursive: true, force: true });
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