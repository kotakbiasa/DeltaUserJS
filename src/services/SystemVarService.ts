import { dbCache, persistField, systemConfigCache, isMongo, readDbFromFile, writeDbToFile, SystemConfigModel } from '../infrastructure/dbCore.js';

// System vars write lock
let sysVarWriteLock: Promise<unknown> = Promise.resolve();

function withSysVarWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  let next: () => void;
  const chain = sysVarWriteLock.then(fn).then((result) => {
    next();
    return result;
  });
  chain.catch(() => { next(); });
  sysVarWriteLock = chain as Promise<unknown>;
  return new Promise<T>((resolve) => {
    // Cast resolve to no-arg function to avoid type mismatch
    // since we call next() without args in .then/.catch
    const noopResolve = resolve.bind(null, {} as T) as () => void;
    next = noopResolve;
  });
}

export function getUserVar(telegramId, key) {
  const session = dbCache.get(Number(telegramId));
  return session?.vars ? session.vars[key] : undefined;
}

export function getAllUserVars(telegramId) {
  const session = dbCache.get(Number(telegramId));
  return session?.vars || {};
}

export async function setUserVar(telegramId, key, value) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return false;
  
  if (!session.vars) session.vars = {};
  session.vars[key] = value;
  await persistField(idNum, 'vars', session.vars);
  return true;
}

export async function deleteUserVar(telegramId, key) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session || !session.vars) return false;
  
  delete session.vars[key];
  await persistField(idNum, 'vars', session.vars);
  return true;
}

export function getSystemVar(key) {
  return systemConfigCache.vars ? systemConfigCache.vars[key] : undefined;
}

export function getAllSystemVars() {
  return systemConfigCache.vars || {};
}

export async function setSystemVar(key, value) {
  if (!systemConfigCache.vars) systemConfigCache.vars = {};
  systemConfigCache.vars[key] = value;

  return withSysVarWriteLock(async () => {
    if (isMongo) {
      await SystemConfigModel.updateOne(
        { _id: 'system' },
        { $set: { vars: systemConfigCache.vars } },
        { upsert: true }
      );
    } else {
      const data = readDbFromFile();
      data.systemConfig = systemConfigCache;
      writeDbToFile(data);
    }
    return true;
  });
}

export async function deleteSystemVar(key) {
  if (!systemConfigCache.vars) return false;
  delete systemConfigCache.vars[key];

  return withSysVarWriteLock(async () => {
    if (isMongo) {
      await SystemConfigModel.updateOne(
        { _id: 'system' },
        { $unset: { [`vars.${key}`]: '' } },
        { upsert: true }
      );
    } else {
      const data = readDbFromFile();
      data.systemConfig = systemConfigCache;
      writeDbToFile(data);
    }
    return true;
  });
}

export function hasClaimedTrial(telegramId) {
  const claims = getSystemVar('trial_claims') || {};
  return !!claims[telegramId];
}

export async function setTrialClaimed(telegramId) {
  const claims = getSystemVar('trial_claims') || {};
  claims[telegramId] = true;
  return setSystemVar('trial_claims', claims);
}
