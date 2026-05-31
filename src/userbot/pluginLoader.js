import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { registerPlugin, loadedPlugins } from './pluginRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, 'plugins');

/**
 * Auto-load semua plugin dari folder plugins/
 * 
 * Setiap file .js di folder plugins/ harus export default object dengan:
 * - name (string, required) - nama unik plugin
 * - execute (function, required) - handler pesan masuk
 * - help (object, optional) - metadata untuk menu .help:
 *     { title, description, usage, detail }
 * - onCallbackQuery (function, optional) - handler inline button
 * 
 * Plugin yang tidak valid (missing name/execute) akan di-skip dengan warning.
 * Plugin yang gagal load (syntax error, dll) akan di-skip dengan error.
 */
export async function loadAllPlugins() {
  let files;
  try {
    files = await readdir(pluginsDir);
  } catch (err) {
    console.error('❌ Failed to read plugins directory:', err.message);
    return loadedPlugins;
  }

  // Sort alphabetically agar load order konsisten
  const pluginFiles = files.filter(f => f.endsWith('.js')).sort();

  console.log(`📦 Found ${pluginFiles.length} plugin file(s) in plugins/ directory.`);

  for (const file of pluginFiles) {
    try {
      const filePath = pathToFileURL(path.join(pluginsDir, file)).href;
      const module = await import(filePath);
      const plugin = module.default;

      // Validasi struktur plugin
      if (!plugin || typeof plugin !== 'object') {
        console.warn(`⚠️ Plugin [${file}] skipped: no default export found.`);
        continue;
      }

      if (!plugin.name || typeof plugin.name !== 'string') {
        console.warn(`⚠️ Plugin [${file}] skipped: missing 'name' property.`);
        continue;
      }

      if (typeof plugin.execute !== 'function') {
        console.warn(`⚠️ Plugin [${file}] skipped: missing 'execute()' function.`);
        continue;
      }

      // Validasi help metadata (opsional)
      if (plugin.help) {
        const required = ['title', 'description', 'usage', 'detail'];
        const missing = required.filter(k => !plugin.help[k]);
        if (missing.length > 0) {
          console.warn(`⚠️ Plugin [${file}] help metadata incomplete, missing: ${missing.join(', ')}. Help menu will skip this plugin.`);
          delete plugin.help; // Hapus help agar tidak muncul di menu
        }
      }

      // Register plugin
      registerPlugin(plugin);

      const helpStatus = plugin.help ? '📋 with help metadata' : '⚙️ no help metadata';
      console.log(`  ✅ Loaded: ${plugin.name} (${file}) ${helpStatus}`);

    } catch (err) {
      console.error(`  ❌ Failed to load plugin [${file}]:`, err.message);
    }
  }

  console.log(`📦 Total plugins loaded: ${loadedPlugins.length}`);
  return loadedPlugins;
}
