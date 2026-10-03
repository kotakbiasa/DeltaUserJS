/**
 * Approved users state — encapsulates the previously global.approvedUsers Set.
 *
 * Stores registration approvals in a module-level Set backed by approvals.json
 * for persistence across restarts. Replaces the global mutation pattern with
 * a proper exported interface.
 */
import fs from 'fs';
import path from 'path';
import config from '../../config.js';

/**
 * Keempat file state ini dulu ditulis langsung ke `process.cwd()`. Di Docker
 * itu `/app`, yang tidak di-mount — jadi setiap `docker compose up --build`
 * menghapus seluruh data approval, pending, dan terms-accepted.
 *
 * Sekarang semuanya masuk ke direktori data yang sudah punya volume
 * (`deltauserjs_store_data:/app/data`), mengikuti pola DIGITAL_STORE_PATH.
 */
const stateDir = process.env.STATE_DIR || path.join(process.cwd(), 'data');
const legacyDir = process.cwd();

const STATE_FILES = [
  'approvals.json',
  'approvals_meta.json',
  'pending_approvals.json',
  'terms_accepted.json',
] as const;

try {
  fs.mkdirSync(stateDir, { recursive: true });
} catch (_) { /* ignore: direktori mungkin sudah ada atau read-only */ }

// Migrasi sekali jalan: pindahkan file lama dari cwd ke direktori data supaya
// deployment yang sudah berjalan tidak kehilangan approval saat upgrade.
for (const filename of STATE_FILES) {
  try {
    const legacyPath = path.join(legacyDir, filename);
    const newPath = path.join(stateDir, filename);
    if (legacyPath !== newPath && fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
      fs.renameSync(legacyPath, newPath);
    }
  } catch (_) { /* ignore: biarkan file lama di tempatnya kalau gagal dipindah */ }
}

const approvalsFile = path.join(stateDir, 'approvals.json');
const approvalsMetaFile = path.join(stateDir, 'approvals_meta.json');
const pendingFile = path.join(stateDir, 'pending_approvals.json');
const termsAcceptedFile = path.join(stateDir, 'terms_accepted.json');

const approvedUsers: Set<number> = new Set();
const acceptedTermsUsers: Set<number> = new Set();

export interface ApprovedUserMeta {
  userId: number;
  name: string;
  username?: string;
  approvedAt: number;
}

const approvedMetadata: Map<number, ApprovedUserMeta> = new Map();

export interface PendingRequest {
  userId: number;
  name: string;
  username?: string;
  requestedAt: number;
}

const pendingApprovals: Map<number, PendingRequest> = new Map();

// Load approved users on init
try {
  if (fs.existsSync(approvalsFile)) {
    const loaded = JSON.parse(fs.readFileSync(approvalsFile, 'utf8'));
    if (Array.isArray(loaded)) {
      for (const id of loaded) {
        approvedUsers.add(Number(id));
      }
    }
  }
} catch (_) { /* ignore: corrupt or missing approvals file */ }

// Load approved metadata on init
try {
  if (fs.existsSync(approvalsMetaFile)) {
    const loaded = JSON.parse(fs.readFileSync(approvalsMetaFile, 'utf8'));
    if (typeof loaded === 'object' && loaded !== null) {
      for (const [idStr, meta] of Object.entries(loaded)) {
        if (meta && typeof meta === 'object') {
          approvedMetadata.set(Number(idStr), meta as ApprovedUserMeta);
        }
      }
    }
  }
} catch (_) { /* ignore: corrupt or missing meta file */ }

// Load pending requests on init
try {
  if (fs.existsSync(pendingFile)) {
    const loaded = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
    if (Array.isArray(loaded)) {
      for (const item of loaded) {
        if (item && item.userId) {
          pendingApprovals.set(Number(item.userId), item);
        }
      }
    }
  }
} catch (_) { /* ignore */ }

// Load terms accepted users on init
try {
  if (fs.existsSync(termsAcceptedFile)) {
    const loaded = JSON.parse(fs.readFileSync(termsAcceptedFile, 'utf8'));
    if (Array.isArray(loaded)) {
      for (const id of loaded) {
        acceptedTermsUsers.add(Number(id));
      }
    }
  }
} catch (_) { /* ignore */ }

function saveAcceptedTerms() {
  try {
    fs.writeFileSync(termsAcceptedFile, JSON.stringify([...acceptedTermsUsers]));
  } catch (_) { /* ignore */ }
}

function saveApprovals() {
  try {
    fs.writeFileSync(approvalsFile, JSON.stringify([...approvedUsers]));
    const metaObj = Object.fromEntries(approvedMetadata);
    fs.writeFileSync(approvalsMetaFile, JSON.stringify(metaObj, null, 2));
  } catch (_) { /* ignore: best-effort persistence */ }
}

function savePending() {
  try {
    fs.writeFileSync(pendingFile, JSON.stringify([...pendingApprovals.values()]));
  } catch (_) { /* ignore */ }
}

export function isApproved(userId: number): boolean {
  return approvedUsers.has(userId);
}

export function approveUser(userId: number, metadata?: { name?: string; username?: string }): void {
  approvedUsers.add(userId);
  const pending = pendingApprovals.get(userId);
  pendingApprovals.delete(userId);

  const existingMeta = approvedMetadata.get(userId);
  const name = metadata?.name || pending?.name || existingMeta?.name || 'User';
  const username = metadata?.username || pending?.username || existingMeta?.username;
  const approvedAt = existingMeta?.approvedAt || Date.now();

  approvedMetadata.set(userId, {
    userId,
    name,
    username,
    approvedAt,
  });

  saveApprovals();
  savePending();
}

export function revokeUser(userId: number): void {
  approvedUsers.delete(userId);
  approvedMetadata.delete(userId);
  pendingApprovals.delete(userId);
  saveApprovals();
  savePending();
}

export function getApprovedUsers(): number[] {
  return [...approvedUsers];
}

export function getApprovedUserMeta(userId: number): ApprovedUserMeta | undefined {
  return approvedMetadata.get(userId);
}

export function isPendingApproval(userId: number): boolean {
  return pendingApprovals.has(userId);
}

export function addPendingApproval(userId: number, metadata: { name: string; username?: string }): void {
  pendingApprovals.set(userId, {
    userId,
    name: metadata.name,
    username: metadata.username,
    requestedAt: Date.now(),
  });
  savePending();
}

export function removePendingApproval(userId: number): void {
  pendingApprovals.delete(userId);
  savePending();
}

export function getPendingApprovals(): PendingRequest[] {
  return [...pendingApprovals.values()];
}

export function hasAcceptedTerms(userId: number): boolean {
  if (Number(userId) === Number(config.ownerId)) {return true;}
  return acceptedTermsUsers.has(Number(userId));
}

export function setAcceptedTerms(userId: number, accepted = true): void {
  const idNum = Number(userId);
  if (accepted) {
    acceptedTermsUsers.add(idNum);
  } else {
    acceptedTermsUsers.delete(idNum);
  }
  saveAcceptedTerms();
}

export function getAcceptedTermsUsers(): number[] {
  return [...acceptedTermsUsers];
}
