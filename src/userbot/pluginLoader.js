import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { clearRegistry, loadedPlugins, registerPlugin, validatePlugin } from './pluginRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, 'plugins');

function helpIsComplete(help) {
  if (!help) return true;
  return ['title', 'description', 'usage', 'detail'].every(key => Boolean(help[key]));
}

async function importPlugin(file) {
  const url = pathToFileURL(path.join(pluginsDir, file)).href;
  // cache-bust in dev restarts so rewritten plugins are re-read in the same process if needed
  const module = await import(`${url}?v=${Date.now()}`);
  return module.default;
}

export async function loadAllPlugins({ reload = true } = {}) {
  if (reload) clearRegistry();

  let files = [];
  try {
    files = (await readdir(pluginsDir)).filter(file => file.endsWith('.js')).sort();
  } catch (err) {
    console.error('Failed to read plugin directory:', err.message);
    return loadedPlugins;
  }

  console.log(`📦 Found ${files.length} plugin file(s) in plugins/ directory.`);

  for (const file of files) {
    try {
      const plugin = await importPlugin(file);
      const validationError = validatePlugin(plugin);
      if (validationError) {
        console.warn(`  ⚠️ Skipped ${file}: ${validationError}`);
        continue;
      }

      if (plugin.help && !helpIsComplete(plugin.help)) {
        console.warn(`  ⚠️ ${plugin.name} help metadata incomplete; hiding from module library.`);
        delete plugin.help;
      }

      const registered = registerPlugin(plugin, { file });
      console.log(`  ✓ ${registered.name}${registered.help ? ' · help' : ''}`);
    } catch (err) {
      console.error(`  ✗ Failed to load ${file}:`, err.message);
    }
  }

  console.log(`📦 Total plugins loaded: ${loadedPlugins.length}`);
  return loadedPlugins;
}
