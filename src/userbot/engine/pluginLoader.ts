import { readdir, stat } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { clearRegistry, loadedPlugins, registerPlugin, validatePlugin } from './pluginRegistry.js';
import { Logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, '../handlers');

function helpIsComplete(help) {
  if (!help) {return true;}
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
    } else if ((file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

export async function loadAllPlugins({ reload = true } = {}) {
  if (reload) {clearRegistry();}

  let files;
  try {
    files = await getJsFilesRecursively(pluginsDir);
    files.sort();
  } catch (err) {
    Logger.logSystem(`Failed to read plugin directory: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    return loadedPlugins;
  }

  Logger.logSystem(`📦 Found ${files.length} plugin file(s) in handlers/ directory.`, 'INFO');

  for (const filePath of files) {
    const fileRelPath = path.relative(pluginsDir, filePath);
    try {
      const plugin = await importPlugin(filePath);
      const validationError = validatePlugin(plugin);
      if (validationError) {
        Logger.logSystem(`  ⚠️ Skipped ${fileRelPath}: ${validationError}`, 'WARN');
        continue;
      }

      if (plugin.help && !helpIsComplete(plugin.help)) {
        Logger.logSystem(`  ⚠️ ${plugin.name} help metadata incomplete; hiding from module library.`, 'WARN');
        delete plugin.help;
      }

      const registered = registerPlugin(plugin, { file: fileRelPath });
      Logger.logSystem(`  ✓ ${registered.name}${registered.help ? ' · help' : ''}`, 'INFO');
    } catch (err) {
      Logger.logSystem(`  ✗ Failed to load ${fileRelPath}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    }
  }

  Logger.logSystem(`📦 Total plugins loaded: ${loadedPlugins.length}`, 'INFO');
  return loadedPlugins;
}
