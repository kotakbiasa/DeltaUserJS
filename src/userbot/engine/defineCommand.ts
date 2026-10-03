/**
 * defineCommand — menghapus boilerplate yang berulang di plugin command.
 *
 * 47 dari 59 handler membuka dengan baris yang persis sama:
 *
 *   if (!message.out || !message.message) {return;}
 *   const match = message.message.match(/^\.nama(?:\s+([\s\S]+))?$/i);
 *   if (!match) {return;}
 *   ... cek argumen kosong → edit pesan "Format salah"
 *   ... edit pesan "⏳ ..."
 *   try { ...isi asli... } catch { edit pesan "❌ Gagal ..." }
 *
 * Helper ini membungkus seluruh pola tersebut sehingga plugin hanya menulis
 * logika intinya. Objek yang dikembalikan tetap berbentuk Plugin biasa
 * (punya `name`, `help`, dan `execute`), jadi pluginLoader dan loop eksekusi
 * di client.ts tidak perlu diubah sama sekali.
 *
 * Properti `commands` ikut disertakan sebagai metadata agar dispatcher
 * berbasis Map<command, plugin> nanti bisa mengindeks plugin tanpa menebak
 * dari regex.
 *
 * PENTING — format pesan di sini harus sama persis dengan yang dulu ditulis
 * manual di tiap plugin, karena teks itu dilihat user. Lihat test/defineCommand.test.js.
 */

import { Logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/richMessage.js';
import type { Plugin, PluginHelp } from './pluginRegistry.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CommandContext {
  client: any;
  message: any;
  settings: any;
  telegramId: number;
  /** Argumen setelah nama command, sudah di-trim. String kosong bila tidak ada. */
  arg: string;
  /** Nama command yang cocok, tanpa titik. Berguna untuk plugin multi-command. */
  command: string;
  /** Edit pesan dengan parseMode html. */
  edit: (text: string, extra?: Record<string, unknown>) => Promise<void>;
}

export interface CommandSpec {
  name: string;
  version?: string;
  description?: string;
  help?: PluginHelp;
  /** Daftar command yang ditangani. Default: [name]. */
  commands?: string[];
  /**
   * 'required' → tampilkan pesan `usage` bila argumen kosong.
   * 'none'     → command tanpa argumen; bila ada argumen, pesan diabaikan
   *              diam-diam (meniru plugin lama yang mencocokkan teks persis).
   * Default 'optional'.
   */
  args?: 'required' | 'optional' | 'none';
  /** Nilai argumen bila user tidak memberi apa pun, mis. 'Jakarta'. */
  defaultArg?: string;
  /** Isi HTML setelah "❌ <b>Format salah:</b> ". Wajib bila args 'required'. */
  usage?: string;
  /** Validasi tambahan. Mengembalikan false → tampilkan pesan `usage`. */
  validate?: (arg: string) => boolean;
  /** Dipanggil saat argumen kosong, mis. untuk mengambil teks dari pesan reply. */
  resolveArg?: (ctx: CommandContext) => Promise<string> | string;
  /** Teks status "⏳". String, atau fungsi yang menerima argumen mentah. */
  loading?: string | ((arg: string) => string);
  /**
   * Bungkus teks loading. 'blockquote' → <blockquote>⏳ <b>..</b></blockquote>,
   * 'plain' → ⏳ <b>..</b>. Keduanya dipakai di basis kode lama, jadi tiap
   * plugin harus memilih yang sama dengan sebelumnya. Default 'blockquote'.
   */
  loadingStyle?: 'blockquote' | 'plain';
  /** Judul pesan gagal, mis. "Gagal cek cuaca". Default "Gagal menjalankan perintah". */
  errorTitle?: string;
  /** Catat kegagalan ke Logger seperti sebagian plugin lama. Default false. */
  logErrors?: boolean;
  /** Opsi tambahan untuk edit terakhir, mis. { linkPreview: false }. */
  finalExtra?: Record<string, unknown>;
  /**
   * Logika inti.
   * Kembalikan string → otomatis di-edit sebagai pesan akhir.
   * Kembalikan void → plugin sudah mengurus pesannya sendiri.
   * Melempar error → otomatis jadi pesan "❌ <errorTitle>: <pesan>".
   */
  run: (ctx: CommandContext) => Promise<string | void> | string | void;
}

/** `<blockquote>⏳ <b>...</b></blockquote>` */
export function loadingText(inner: string): string {
  return `<blockquote>⏳ <b>${inner}</b></blockquote>`;
}

/** `⏳ <b>...</b>` — varian tanpa blockquote. */
export function loadingTextPlain(inner: string): string {
  return `⏳ <b>${inner}</b>`;
}

/** `<blockquote>❌ <b>Format salah:</b> ...</blockquote>` */
export function usageText(inner: string): string {
  return `<blockquote>❌ <b>Format salah:</b> ${inner}</blockquote>`;
}

/** `<blockquote>❌ <b>Judul:</b> pesan</blockquote>` — pesan selalu di-escape. */
export function errorText(title: string, detail: string): string {
  return `<blockquote>❌ <b>${title}:</b> ${escapeHtml(detail)}</blockquote>`;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Susun regex `^\.(cmd1|cmd2)(?:\s+(arg))?$` dengan nama command di-escape. */
function buildPattern(commands: string[]): RegExp {
  const alternatives = commands
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`^\\.(${alternatives})(?:\\s+([\\s\\S]+))?$`, 'i');
}

/** Plugin biasa + metadata command untuk dispatcher. */
export type CommandPlugin = Plugin & {
  commands: string[];
  version?: string;
  description?: string;
};

export function defineCommand(spec: CommandSpec): CommandPlugin {
  const commands = spec.commands && spec.commands.length > 0 ? spec.commands : [spec.name];
  const pattern = buildPattern(commands);

  return {
    name: spec.name,
    version: spec.version,
    description: spec.description,
    help: spec.help,
    commands,

    async execute(client: any, message: any, settings: any, telegramId: number) {
      // Guard identik dengan yang dulu ditulis manual di 47 file.
      if (!message.out || !message.message) {return;}

      const match = message.message.match(pattern);
      if (!match) {return;}

      const edit = async (text: string, extra: Record<string, unknown> = {}) => {
        await message.edit({ text, parseMode: 'html', ...extra });
      };

      const ctx: CommandContext = {
        client,
        message,
        settings,
        telegramId,
        arg: (match[2] || '').trim(),
        command: String(match[1] || '').toLowerCase(),
        edit,
      };

      // Command tanpa argumen: abaikan diam-diam bila user menambahkan sesuatu,
      // sama seperti plugin lama yang membandingkan teks secara persis.
      if (spec.args === 'none' && ctx.arg) {return;}

      // Fallback argumen (mis. ambil dari pesan yang di-reply).
      if (!ctx.arg && spec.resolveArg) {
        ctx.arg = (await spec.resolveArg(ctx)) || '';
      }
      if (!ctx.arg && spec.defaultArg !== undefined) {
        ctx.arg = spec.defaultArg;
      }

      const needsArg = spec.args === 'required';
      const invalid = spec.validate ? !spec.validate(ctx.arg) : false;
      if ((needsArg && !ctx.arg) || invalid) {
        if (spec.usage) {
          await edit(usageText(spec.usage));
        }
        return;
      }

      if (spec.loading) {
        const inner = typeof spec.loading === 'function' ? spec.loading(ctx.arg) : spec.loading;
        await edit(spec.loadingStyle === 'plain' ? loadingTextPlain(inner) : loadingText(inner));
      }

      try {
        const result = await spec.run(ctx);
        if (typeof result === 'string') {
          await edit(result, spec.finalExtra);
        }
      } catch (err) {
        if (spec.logErrors) {
          Logger.logUser(telegramId, `Error in ${spec.name} plugin: ${errMessage(err)}`, 'ERROR');
        }
        await edit(errorText(spec.errorTitle || 'Gagal menjalankan perintah', errMessage(err)));
      }
    },
  };
}
