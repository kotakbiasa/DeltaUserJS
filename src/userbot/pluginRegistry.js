/**
 * Plugin Registry - Shared state untuk loaded plugins dan help registry.
 * Digunakan oleh pluginLoader.js (untuk mendaftarkan plugin) dan help.js (untuk membaca metadata).
 * Tidak ada circular dependency karena ini hanya data holder.
 */
export const loadedPlugins = [];
export const helpRegistry = {};

/**
 * Daftarkan plugin ke registry
 * @param {object} plugin - Plugin object dengan name, execute, dan opsional help/onCallbackQuery
 */
export function registerPlugin(plugin) {
  loadedPlugins.push(plugin);
  if (plugin.help) {
    helpRegistry[plugin.name] = plugin.help;
  }
}
