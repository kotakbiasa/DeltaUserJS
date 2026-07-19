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

const approvedUsers: Set<number> = new Set();

// Load from file on module init
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

function saveApprovals() {
  try {
    fs.writeFileSync(approvalsFile, JSON.stringify([...approvedUsers]));
  } catch (_) { /* ignore: best-effort persistence */ }
}

export function isApproved(userId: number): boolean {
  return approvedUsers.has(userId);
}

export function approveUser(userId: number): void {
  approvedUsers.add(userId);
  saveApprovals();
}

export function revokeUser(userId: number): void {
  approvedUsers.delete(userId);
  saveApprovals();
}

export function getApprovedUsers(): number[] {
  return [...approvedUsers];
}
