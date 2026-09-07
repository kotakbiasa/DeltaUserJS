import { readdir, stat } from 'fs/promises';
import { watch } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { clearRegistry, loadedPlugins, registerPlugin, validatePlugin } from './pluginRegistry.js';
import { Logger } from '../../utils/logger.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, '../handlers');
let watcher = null;
let isWatching = false;
function helpIsComplete(help) {
    if (!help) {
        return true;
    }
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
        }
        else if ((file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts')) {
            results.push(filePath);
        }
    }
    return results;
}
async function loadSinglePlugin(filePath) {
    const fileRelPath = path.relative(pluginsDir, filePath);
    try {
        const plugin = await importPlugin(filePath);
        const validationError = validatePlugin(plugin);
        if (validationError) {
            Logger.logSystem(`  ⚠️ Skipped ${fileRelPath}: ${validationError}`, 'WARN');
            return false;
        }
        if (plugin.help && !helpIsComplete(plugin.help)) {
            Logger.logSystem(`  ⚠️ ${plugin.name} help metadata incomplete; hiding from module library.`, 'WARN');
            delete plugin.help;
        }
        const registered = registerPlugin(plugin, { file: fileRelPath });
        Logger.logSystem(`  🔄 Reloaded: ${registered.name}`, 'INFO');
        return true;
    }
    catch (err) {
        Logger.logSystem(`  ✗ Failed to reload ${fileRelPath}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        return false;
    }
}
export async function loadAllPlugins({ reload = true } = {}) {
    if (reload) {
        clearRegistry();
    }
    let files;
    try {
        files = await getJsFilesRecursively(pluginsDir);
        files.sort();
    }
    catch (err) {
        Logger.logSystem(`Failed to read plugin directory: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        return loadedPlugins;
    }
    Logger.logSystem(`📦 Found ${files.length} plugin file(s) in handlers/ directory.`, 'INFO');
    for (const filePath of files) {
        await loadSinglePlugin(filePath);
    }
    Logger.logSystem(`📦 Total plugins loaded: ${loadedPlugins.length}`, 'INFO');
    return loadedPlugins;
}
/**
 * Start file watcher for hot-reloading plugins in development.
 * Only watches .ts/.js files in the handlers directory.
 */
export function startPluginWatcher() {
    if (isWatching) {
        return;
    }
    try {
        watcher = watch(pluginsDir, { recursive: true, persistent: false });
        watcher.on('change', async (eventType, filename) => {
            if (!filename) {
                return;
            }
            const filenameStr = filename.toString();
            const ext = path.extname(filenameStr);
            if (!['.ts', '.js'].includes(ext) || filenameStr.endsWith('.d.ts')) {
                return;
            }
            const filePath = path.join(pluginsDir, filenameStr);
            Logger.logSystem(`🔁 File changed: ${filenameStr} — hot-reloading...`, 'INFO');
            // ESM: tidak ada require.cache — cache-bust terjadi via ?v=Date.now() di importPlugin.
            await loadSinglePlugin(filePath);
        });
        watcher.on('error', (err) => {
            Logger.logSystem(`Plugin watcher error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        });
        isWatching = true;
        Logger.logSystem('👀 Plugin hot-reload watcher started', 'INFO');
    }
    catch (err) {
        Logger.logSystem(`Failed to start plugin watcher: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    }
}
/**
 * Stop the plugin watcher.
 */
export function stopPluginWatcher() {
    if (watcher) {
        watcher.close();
        watcher = null;
        isWatching = false;
        Logger.logSystem('👀 Plugin hot-reload watcher stopped', 'INFO');
    }
}
