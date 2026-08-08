import { dbCache, persistField, systemConfigCache, isMongo, readDbFromFile, writeDbToFile, SystemConfigModel, withKeyLock } from '../infrastructure/dbCore.js';

// All system-var mutations run under one shared key lock so the read-modify-
// write on the singleton systemConfigCache is serialized.
const SYS_LOCK_KEY = '__system_vars__';

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
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session) {return false;}

    if (!session.vars) {session.vars = {};}
    session.vars[key] = value;
    await persistField(idNum, 'vars', session.vars);
    return true;
  });
}

export async function deleteUserVar(telegramId, key) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session || !session.vars) {return false;}

    delete session.vars[key];
    await persistField(idNum, 'vars', session.vars);
    return true;
  });
}

export function getSystemVar(key) {
  return systemConfigCache.vars ? systemConfigCache.vars[key] : undefined;
}

export function getAllSystemVars() {
  return systemConfigCache.vars || {};
}

export async function setSystemVar(key, value) {
  return withKeyLock(SYS_LOCK_KEY, async () => {
    // Mutate cache inside the lock so concurrent writers don't clobber it.
    if (!systemConfigCache.vars) {systemConfigCache.vars = {};}
    systemConfigCache.vars[key] = value;

    if (isMongo) {
      await SystemConfigModel.updateOne(
        { _id: 'system' },
        { $set: { vars: systemConfigCache.vars } },
        { upsert: true }
      );
    } else {
      const data = await readDbFromFile();
      data.systemConfig = systemConfigCache;
      await writeDbToFile(data);
    }
    return true;
  });
}

export async function deleteSystemVar(key) {
  return withKeyLock(SYS_LOCK_KEY, async () => {
    if (!systemConfigCache.vars) {return false;}
    delete systemConfigCache.vars[key];

    if (isMongo) {
      await SystemConfigModel.updateOne(
        { _id: 'system' },
        { $unset: { [`vars.${key}`]: '' } },
        { upsert: true }
      );
    } else {
      const data = await readDbFromFile();
      data.systemConfig = systemConfigCache;
      await writeDbToFile(data);
    }
    return true;
  });
}

export function hasClaimedTrial(telegramId) {
  const claims = getSystemVar('trial_claims') || {};
  return !!claims[telegramId];
}

/**
 * Atomically claim a trial. Returns true if this call performed the claim,
 * false if the user had already claimed (check-and-set under the same lock
 * that guards setSystemVar, so two concurrent claims can't both succeed).
 */
export async function setTrialClaimed(telegramId) {
  return withKeyLock(SYS_LOCK_KEY, async () => {
    if (!systemConfigCache.vars) {systemConfigCache.vars = {};}
    const vars = systemConfigCache.vars as Record<string, any>;
    const claims = { ...(vars.trial_claims || {}) };
    if (claims[telegramId]) {return false;}
    claims[telegramId] = true;
    vars.trial_claims = claims;

    if (isMongo) {
      await SystemConfigModel.updateOne(
        { _id: 'system' },
        { $set: { 'vars.trial_claims': claims } },
        { upsert: true }
      );
    } else {
      const data = await readDbFromFile();
      data.systemConfig = systemConfigCache;
      await writeDbToFile(data);
    }
    return true;
  });
}
