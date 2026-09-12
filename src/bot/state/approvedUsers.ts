/**
 * Approved users state — encapsulates the previously global.approvedUsers Set.
 *
 * Stores registration approvals in a module-level Set backed by approvals.json
 * for persistence across restarts. Replaces the global mutation pattern with
 * a proper exported interface.
 */
import fs from 'fs';
import path from 'path';

const approvalsFile = path.join(process.cwd(), 'approvals.json');
const approvalsMetaFile = path.join(process.cwd(), 'approvals_meta.json');
const pendingFile = path.join(process.cwd(), 'pending_approvals.json');

const approvedUsers: Set<number> = new Set();

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
