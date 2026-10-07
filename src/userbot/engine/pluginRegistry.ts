/**
 * DeltaUserJS Plugin Registry
 *
 * Single source of truth untuk plugin userbot yang sudah dimuat.
 * Tetap mengekspor `loadedPlugins` dan `helpRegistry` agar kompatibel dengan
 * dashboard bot dan plugin lama, tapi implementasinya dibuat ulang lebih rapi.
 */

import { Logger } from '../../utils/logger.js';

export interface PluginHelp {
  title?: string;
  description?: string;
  usage?: string;
  detail?: string;
}

export interface Plugin {
  name: string;
  /**
   * Daftar command yang ditangani plugin ini (tanpa titik), diisi otomatis
   * oleh defineCommand(). Plugin yang punya metadata ini bisa di-dispatch
   * lewat indeks; plugin tanpa metadata (plugin pasif seperti afk/antiflood,
   * dan plugin lama yang belum dimigrasi) tetap dijalankan untuk setiap pesan.
   */
  commands?: string[];
  help?: PluginHelp;
  file?: string | null;
  /** Plugin hanya untuk owner, disembunyikan dari menu .plugins untuk non-owner */
  ownerOnly?: boolean;
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
/** Indeks command → plugin, untuk dispatch O(1) tanpa menjalankan semua plugin. */
const pluginByCommand = new Map<string, Plugin>();

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

export function registerPlugin(
  plugin: Plugin,
  meta: { file?: string | null; at?: number | null } = {},
): Plugin {
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

  // `at` dipakai hot-reload: kembalikan plugin ke posisi semula supaya urutan
  // eksekusi plugin pasif tidak berubah hanya karena sebuah file disimpan.
  const at = meta.at;
  if (typeof at === 'number' && at >= 0 && at <= loadedPlugins.length) {
    loadedPlugins.splice(at, 0, normalizedPlugin);
  } else {
    loadedPlugins.push(normalizedPlugin);
  }
  pluginByName.set(name, normalizedPlugin);

  for (const cmd of normalizedPlugin.commands || []) {
    const key = normalizePluginName(cmd);
    if (!key) {continue;}
    const existing = pluginByCommand.get(key);
    if (existing && existing.name !== name) {
      // Bentrok command antar plugin: pertahankan yang pertama terdaftar dan
      // jangan sampai registrasi gagal — plugin tetap jalan lewat loop biasa.
      Logger.logSystem(`  ⚠️ Command .${key} sudah dipakai plugin "${existing.name}"; "${name}" diabaikan untuk dispatch.`, 'WARN');
      continue;
    }
    pluginByCommand.set(key, normalizedPlugin);
  }

  if (normalizedPlugin.help) {
    helpRegistry[name] = normalizedPlugin.help;
  }

  return normalizedPlugin;
}

/**
 * Lepas plugin dari registry. Dipakai hot-reload sebelum mendaftar ulang —
 * tanpa ini `registerPlugin` selalu melempar "plugin duplikat".
 *
 * Mengembalikan posisi plugin di `loadedPlugins` sebelum dihapus (agar
 * pemanggil bisa mengembalikannya ke urutan yang sama lewat `meta.at`), atau
 * null bila plugin memang belum terdaftar.
 */
export function unregisterPlugin(name: unknown): number | null {
  const key = normalizePluginName(name);
  const plugin = pluginByName.get(key);
  if (!plugin) {return null;}

  const index = loadedPlugins.indexOf(plugin);
  if (index !== -1) {loadedPlugins.splice(index, 1);}

  pluginByName.delete(key);
  delete helpRegistry[key];

  // Hanya lepas command yang benar-benar milik plugin ini. Command yang
  // dipegang plugin lain (karena bentrok nama) harus tetap utuh.
  for (const [command, owner] of pluginByCommand) {
    if (owner === plugin) {pluginByCommand.delete(command);}
  }

  return index === -1 ? null : index;
}

/**
 * Ambil nama command dari teks pesan: ".qr halo" → "qr".
 * Mengembalikan null bila teks tidak diawali titik.
 */
export function parseCommandName(text: unknown): string | null {
  const match = String(text || '').match(/^\.([a-z0-9_]+)(?:\s|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Plugin yang terdaftar untuk sebuah command, atau null. */
export function getPluginForCommand(command: unknown): Plugin | null {
  const key = normalizePluginName(command);
  return key ? pluginByCommand.get(key) || null : null;
}

/** Jumlah command yang terindeks — dipakai untuk logging saat startup. */
export function indexedCommandCount(): number {
  return pluginByCommand.size;
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
  pluginByCommand.clear();
}
