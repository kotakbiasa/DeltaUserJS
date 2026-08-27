import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, readdir, stat, rm, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../utils/logger.js';

const execAsync = promisify(exec);
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

/**
 * Create full MongoDB backup using mongodump
 */
export async function createFullBackup(): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `full_${timestamp}`;
  const backupPath = path.join(backupDir, backupId);

  const backupInfo: BackupInfo = {
    id: backupId,
    type: 'full',
    timestamp: new Date().toISOString(),
    size: 0,
    path: backupPath,
    status: 'in_progress',
  };

  backupHistory.push(backupInfo);
  await saveHistory();

  try {
    await mkdir(backupPath, { recursive: true });

    // Use mongodump for MongoDB backup
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not configured');
    }

    const { stdout, stderr } = await execAsync(
      `mongodump --uri="${mongoUri}" --out="${backupPath}" --gzip`,
      { timeout: 300000 } // 5 min timeout
    );

    if (stderr && !stderr.includes('done dumping')) {
      Logger.logSystem(`mongodump stderr: ${stderr}`, 'WARN');
    }

    // Calculate size
    const { stdout: sizeOut } = await execAsync(`du -sb "${backupPath}"`);
    const size = parseInt(sizeOut.split('\t')[0]);

    // Get collections list
    const { stdout: collectionsOut } = await execAsync(`ls -1 "${backupPath}"/*/ | wc -l`);
    const collections = parseInt(collectionsOut.trim());

    backupInfo.size = size;
    backupInfo.collections = [String(collections)];
    backupInfo.status = 'completed';
    await saveHistory();

    Logger.logSystem(`💾 Full backup completed: ${backupId} (${formatBytes(size)})`, 'SUCCESS');
    return backupInfo;
  } catch (err) {
    backupInfo.status = 'failed';
    backupInfo.error = err instanceof Error ? err.message : String(err);
    await saveHistory();
    Logger.logSystem(`💾 Full backup failed: ${err}`, 'ERROR');
    throw err;
  }
}

/**
 * Create incremental backup (only changed collections since last backup)
 */
export async function createIncrementalBackup(): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `inc_${timestamp}`;
  const backupPath = path.join(backupDir, backupId);

  const backupInfo: BackupInfo = {
    id: backupId,
    type: 'incremental',
    timestamp: new Date().toISOString(),
    size: 0,
    path: backupPath,
    status: 'in_progress',
  };

  backupHistory.push(backupInfo);
  await saveHistory();

  try {
    await mkdir(backupPath, { recursive: true });

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not configured');
    }

    // For incremental, we could use oplog or just dump all (simplified)
    // In production, use mongodump with --oplog or change streams
    const { stdout, stderr } = await execAsync(
      `mongodump --uri="${mongoUri}" --out="${backupPath}" --gzip`,
      { timeout: 300000 }
    );

    if (stderr && !stderr.includes('done dumping')) {
      Logger.logSystem(`mongodump stderr: ${stderr}`, 'WARN');
    }

    const { stdout: sizeOut } = await execAsync(`du -sb "${backupPath}"`);
    const size = parseInt(sizeOut.split('\t')[0]);

    backupInfo.size = size;
    backupInfo.status = 'completed';
    await saveHistory();

    Logger.logSystem(`💾 Incremental backup completed: ${backupId} (${formatBytes(size)})`, 'SUCCESS');
    return backupInfo;
  } catch (err) {
    backupInfo.status = 'failed';
    backupInfo.error = err instanceof Error ? err.message : String(err);
    await saveHistory();
    Logger.logSystem(`💾 Incremental backup failed: ${err}`, 'ERROR');
    throw err;
  }
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
    await execAsync(
      `mongorestore --uri="${mongoUri}" --gzip --drop "${backup.path}"`,
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
  if (sorted.length <= keepCount) return 0;

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
  if (!backup) throw new Error(`Backup ${backupId} not found`);

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

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}