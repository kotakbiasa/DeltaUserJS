// @ts-nocheck
/**
 * DeltaUserJS Plugin Registry
 *
 * Single source of truth untuk plugin userbot yang sudah dimuat.
 * Tetap mengekspor `loadedPlugins` dan `helpRegistry` agar kompatibel dengan
 * dashboard bot dan plugin lama, tapi implementasinya dibuat ulang lebih rapi.
 */
export const loadedPlugins = [];
export const helpRegistry = {};

const pluginByName = new Map();

export function normalizePluginName(name) {
  return String(name || '').trim().toLowerCase();
}

export function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') return 'default export harus object';
  if (!plugin.name || typeof plugin.name !== 'string') return 'property name wajib string';
  if (typeof plugin.execute !== 'function') return 'execute(client, message, settings, telegramId) wajib function';
  return null;
}

export function registerPlugin(plugin, meta = {}) {
  const reason = validatePlugin(plugin);
  if (reason) throw new Error(reason);

  const name = normalizePluginName(plugin.name);
  if (pluginByName.has(name)) {
    throw new Error(`plugin duplikat: ${name}`);
  }

  const normalizedPlugin = {
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

export function getPlugin(name) {
  return pluginByName.get(normalizePluginName(name)) || null;
}

export function hasPlugin(name) {
  return pluginByName.has(normalizePluginName(name));
}

export function listPlugins() {
  return [...loadedPlugins];
}

export function clearRegistry() {
  loadedPlugins.length = 0;
  for (const key of Object.keys(helpRegistry)) delete helpRegistry[key];
  pluginByName.clear();
}
