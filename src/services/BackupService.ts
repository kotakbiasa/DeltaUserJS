import config from '../config.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, rm, readFile, writeFile, readdir, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../utils/logger.js';
import { formatBytesFixed as formatBytes } from '../utils/format.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.join(__dirname, '../../backups');

interface BackupInfo {
  id: string;
  type: 'full' | 'incremental';
  timestamp: string;
  size: number;
  path: string;
  collections?: string[];
  status: 'completed' | 'failed' | 'in_progress';
  error?: string;
}

let backupHistory: BackupInfo[] = [];
const MAX_HISTORY = 50;
const HISTORY_FILE = path.join(__dirname, '../../backups/history.json');

/**
 * Ganti nama database di path URI dengan config.dbName (DB yang benar-benar dipakai mongoose).
 * - `mongodb://host:port/lama?opts` → `mongodb://host:port/DeltaUbotJS?opts`
 * - `mongodb://host:port`           → `mongodb://host:port/DeltaUbotJS`
 * - `mongodb+srv://user:pass@host`  → `mongodb+srv://user:pass@host/DeltaUbotJS`
 */
function resolveMongoDatabaseUri(uri: string): string {
  const db = config.dbName;
  // Pisahkan query string (opsi koneksi) supaya tidak ikut terpotong.
  const [main, query] = uri.split('?');
  const suffix = query ? `?${query}` : '';
  // Otentikasi: mongodb://user:pass@host — ambil bagian setelah '@' terakhir.
  const authMatch = main.match(/^(mongodb(?:\+srv)?:\/\/)(?:[^@/]*@)?(.*)$/);
  if (!authMatch) {
    return `${main.replace(/\/+$/, '')}${suffix}`;
  }
  const [, scheme, hostAndPath] = authMatch;
  const authPart = main.slice(scheme.length, main.length - hostAndPath.length);
  const host = hostAndPath.split('/')[0];
  return `${scheme}${authPart}${host}/${db}${suffix}`;
}

/**
 * Initialize backup system
 */
export async function initBackupSystem() {
  try {
    await mkdir(backupDir, { recursive: true });

    // Load history
    try {
      const data = await readFile(HISTORY_FILE, 'utf-8');
      backupHistory = JSON.parse(data);
      Logger.logSystem(`💾 Backup system initialized: ${backupHistory.length} history entries`, 'INFO');
    } catch {
      // No history file yet
      await writeFile(HISTORY_FILE, JSON.stringify([], null, 2));
      Logger.logSystem('💾 Backup system initialized (new)', 'INFO');
    }
  } catch (err) {
    Logger.logSystem(`Failed to init backup system: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
  }
}

/**
 * Save backup history
 */
async function saveHistory() {
  await writeFile(HISTORY_FILE, JSON.stringify(backupHistory.slice(-MAX_HISTORY), null, 2));
}

async function getDirectorySize(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }

  return total;
}

async function countDirectories(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).length;
}

/**
 * Create a MongoDB backup using mongodump.
 *
 * Full and incremental backups currently use the same dump strategy; keeping
 * the shared lifecycle here prevents the two paths from drifting apart.
 */
async function createMongoBackup(type: BackupInfo['type']): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `${type === 'full' ? 'full' : 'inc'}_${timestamp}`;
  const backupPath = path.join(backupDir, backupId);
  const backupInfo: BackupInfo = {
    id: backupId,
    type,
    timestamp: new Date().toISOString(),
    size: 0,
    path: backupPath,
    status: 'in_progress',
  };

  backupHistory.push(backupInfo);
  await saveHistory();

  try {
    await mkdir(backupPath, { recursive: true });

    const baseUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!baseUri) {
      throw new Error('MONGO_URI not configured');
    }
    // mongodump harus menunjuk DB yang sama dengan mongoose (config.dbName).
    const mongoUri = resolveMongoDatabaseUri(baseUri);
    const { stderr } = await execFileAsync(
      'mongodump',
      ['--uri', mongoUri, '--out', backupPath, '--gzip'],
      { timeout: 300000 }
    );

    if (stderr && !stderr.includes('done dumping')) {
      Logger.logSystem(`mongodump stderr: ${stderr}`, 'WARN');
    }

    backupInfo.size = await getDirectorySize(backupPath);

    if (type === 'full') {
      backupInfo.collections = [String(await countDirectories(backupPath))];
    }

    backupInfo.status = 'completed';
    await saveHistory();
    Logger.logSystem(`💾 ${type === 'full' ? 'Full' : 'Incremental'} backup completed: ${backupId} (${formatBytes(backupInfo.size)})`, 'SUCCESS');
    return backupInfo;
  } catch (err) {
    backupInfo.status = 'failed';
    backupInfo.error = err instanceof Error ? err.message : String(err);
    await saveHistory();
    Logger.logSystem(`💾 ${type === 'full' ? 'Full' : 'Incremental'} backup failed: ${err}`, 'ERROR');
    throw err;
  }
}

export function createFullBackup(): Promise<BackupInfo> {
  return createMongoBackup('full');
}

export function createIncrementalBackup(): Promise<BackupInfo> {
  return createMongoBackup('incremental');
}

/**
 * Restore from backup
 */
export async function restoreFromBackup(backupId: string, targetUri?: string): Promise<void> {
  const backup = backupHistory.find(b => b.id === backupId);
  if (!backup) {
    throw new Error(`Backup ${backupId} not found`);
  }

  if (backup.status !== 'completed') {
    throw new Error(`Backup ${backupId} is not completed (status: ${backup.status})`);
  }

  const mongoUri = targetUri || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI not configured');
  }

  Logger.logSystem(`💾 Restoring from backup: ${backupId}`, 'INFO');

  try {
    // Use mongorestore
    await execFileAsync(
      'mongorestore',
      ['--uri', mongoUri, '--gzip', '--drop', backup.path],
      { timeout: 300000 }
    );

    Logger.logSystem(`💾 Restore completed from: ${backupId}`, 'SUCCESS');
  } catch (err) {
    Logger.logSystem(`💾 Restore failed: ${err}`, 'ERROR');
    throw err;
  }
}

/**
 * List all backups
 */
export function listBackups(): BackupInfo[] {
  return [...backupHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Get backup by ID
 */
export function getBackup(backupId: string): BackupInfo | undefined {
  return backupHistory.find(b => b.id === backupId);
}

/**
 * Delete old backups (keep last N)
 */
export async function pruneBackups(keepCount = 10): Promise<number> {
  const sorted = listBackups();
  if (sorted.length <= keepCount) {return 0;}

  const toDelete = sorted.slice(keepCount);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      await rm(backup.path, { recursive: true, force: true });
      backupHistory = backupHistory.filter(b => b.id !== backup.id);
      deleted++;
    } catch (err) {
      Logger.logSystem(`Failed to delete backup ${backup.id}: ${err}`, 'WARN');
    }
  }

  await saveHistory();
  Logger.logSystem(`💾 Pruned ${deleted} old backups`, 'INFO');
  return deleted;
}

/**
 * Delete backup by ID
 */
export async function deleteBackup(backupId: string): Promise<void> {
  const backup = backupHistory.find(b => b.id === backupId);
  if (!backup) {
    throw new Error(`Backup ${backupId} not found`);
  }

  await rm(backup.path, { recursive: true, force: true });
  backupHistory = backupHistory.filter(b => b.id !== backupId);
  await saveHistory();
}

/**
 * Export backup to remote (S3, GCS, etc.) - placeholder
 */
export async function exportBackupToRemote(backupId: string, destination: string): Promise<void> {
  const backup = backupHistory.find(b => b.id === backupId);
  if (!backup) {throw new Error(`Backup ${backupId} not found`);}

  // Placeholder for S3/GCS/rsync upload
  Logger.logSystem(`💾 Export backup ${backupId} to ${destination} - not implemented`, 'WARN');
  throw new Error('Remote export not implemented');
}

/**
 * Auto backup scheduler
 */
export function startAutoBackup() {
  // Full backup daily at 3 AM
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      createFullBackup().catch(err => Logger.logSystem(`Auto full backup failed: ${err}`, 'ERROR'));
    }
  }, 60000);

  // Incremental backup every 6 hours
  setInterval(() => {
    const now = new Date();
    if ([0, 6, 12, 18].includes(now.getHours()) && now.getMinutes() === 0) {
      createIncrementalBackup().catch(err => Logger.logSystem(`Auto incremental backup failed: ${err}`, 'ERROR'));
    }
  }, 60000);

  // Prune old backups daily
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 4 && now.getMinutes() === 0) {
      pruneBackups(10).catch(err => Logger.logSystem(`Prune failed: ${err}`, 'ERROR'));
    }
  }, 60000);

  Logger.logSystem('💾 Auto backup scheduler started (daily full, 6h incremental, prune daily)', 'INFO');
}

/**
 * Get backup stats
 */
export function getBackupStats() {
  const completed = backupHistory.filter(b => b.status === 'completed');
  const failed = backupHistory.filter(b => b.status === 'failed');
  const totalSize = completed.reduce((sum, b) => sum + b.size, 0);

  return {
    total: backupHistory.length,
    completed: completed.length,
    failed: failed.length,
    totalSize,
    lastBackup: completed[0]?.timestamp || null,
    nextScheduledFull: 'Daily 3:00 AM',
    nextScheduledIncremental: 'Every 6 hours',
  };
}

