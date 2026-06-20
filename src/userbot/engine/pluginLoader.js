import { readdir, stat } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { clearRegistry, loadedPlugins, registerPlugin, validatePlugin } from './pluginRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, '../plugins');

function helpIsComplete(help) {
  if (!help) return true;
  return ['title', 'description', 'usage', 'detail'].every(key => Boolean(help[key]));
}

async function importPlugin(filePath) {
  const url = pathToFileURL(filePath).href;
  // cache-bust in dev restarts so rewritten plugins are re-read in the same process if needed
  const module = await import(`${url}?v=${Date.now()}`);
  return module.default;
}

async function getJsFilesRecursively(dir) {
  let results = [];
  const list = await readdir(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const statResult = await stat(filePath);
    if (statResult.isDirectory()) {
      results = results.concat(await getJsFilesRecursively(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  }
  return results;
}

export async function loadAllPlugins({ reload = true } = {}) {
  if (reload) clearRegistry();

  let files = [];
  try {
    files = await getJsFilesRecursively(pluginsDir);
    files.sort();
  } catch (err) {
    console.error('Failed to read plugin directory:', err.message);
    return loadedPlugins;
  }

  console.log(`📦 Found ${files.length} plugin file(s) in plugins/ directory.`);

  for (const filePath of files) {
    const fileRelPath = path.relative(pluginsDir, filePath);
    try {
      const plugin = await importPlugin(filePath);
      const validationError = validatePlugin(plugin);
      if (validationError) {
        console.warn(`  ⚠️ Skipped ${fileRelPath}: ${validationError}`);
        continue;
      }

      if (plugin.help && !helpIsComplete(plugin.help)) {
        console.warn(`  ⚠️ ${plugin.name} help metadata incomplete; hiding from module library.`);
        delete plugin.help;
      }

      const registered = registerPlugin(plugin, { file: fileRelPath });
      console.log(`  ✓ ${registered.name}${registered.help ? ' · help' : ''}`);
    } catch (err) {
      console.error(`  ✗ Failed to load ${fileRelPath}:`, err.message);
    }
  }

  console.log(`📦 Total plugins loaded: ${loadedPlugins.length}`);
  return loadedPlugins;
}
