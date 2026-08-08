/**
 * DeltaUserJS Plugin Registry
 *
 * Single source of truth untuk plugin userbot yang sudah dimuat.
 * Tetap mengekspor `loadedPlugins` dan `helpRegistry` agar kompatibel dengan
 * dashboard bot dan plugin lama, tapi implementasinya dibuat ulang lebih rapi.
 */

export interface PluginHelp {
  title?: string;
  description?: string;
  usage?: string;
  detail?: string;
}

export interface Plugin {
  name: string;
  help?: PluginHelp;
  file?: string | null;
  execute(client: unknown, message: unknown, settings: unknown, telegramId: number): Promise<unknown> | unknown;
  onCallbackQuery?(
    client: unknown,
    event: unknown,
    settings: unknown,
    telegramId: number,
  ): Promise<unknown> | unknown;
}

export const loadedPlugins: Plugin[] = [];
export const helpRegistry: Record<string, PluginHelp> = {};

const pluginByName = new Map<string, Plugin>();

export function normalizePluginName(name: unknown): string {
  return String(name || '').trim().toLowerCase();
}

export function validatePlugin(plugin: unknown): string | null {
  if (!plugin || typeof plugin !== 'object') {return 'default export harus object';}
  const p = plugin as Partial<Plugin>;
  if (!p.name || typeof p.name !== 'string') {return 'property name wajib string';}
  if (typeof p.execute !== 'function') {return 'execute(client, message, settings, telegramId) wajib function';}
  return null;
}

export function registerPlugin(plugin: Plugin, meta: { file?: string | null } = {}): Plugin {
  const reason = validatePlugin(plugin);
  if (reason) {throw new Error(reason);}

  const name = normalizePluginName(plugin.name);
  if (pluginByName.has(name)) {
    throw new Error(`plugin duplikat: ${name}`);
  }

  const normalizedPlugin: Plugin = {
    ...plugin,
    name,
    file: meta.file || plugin.file || null,
  };

  loadedPlugins.push(normalizedPlugin);
  pluginByName.set(name, normalizedPlugin);

  if (normalizedPlugin.help) {
    helpRegistry[name] = normalizedPlugin.help;
  }

  return normalizedPlugin;
}

export function getPlugin(name: unknown): Plugin | null {
  return pluginByName.get(normalizePluginName(name)) || null;
}

export function hasPlugin(name: unknown): boolean {
  return pluginByName.has(normalizePluginName(name));
}

export function listPlugins(): Plugin[] {
  return [...loadedPlugins];
}

export function clearRegistry() {
  loadedPlugins.length = 0;
  for (const key of Object.keys(helpRegistry)) {delete helpRegistry[key];}
  pluginByName.clear();
}
