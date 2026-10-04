import { dbCache, persistField, systemConfigCache, isMongo, readDbFromFile, writeDbToFile, SystemConfigModel, withKeyLock } from '../infrastructure/dbCore.js';

// All system-var mutations run under one shared key lock so the read-modify-
// write on the singleton systemConfigCache is serialized.
const SYS_LOCK_KEY = '__system_vars__';

export function getUserVar(telegramId: number, key: string) {
  const session = dbCache.get(Number(telegramId));
  return session?.vars ? session.vars[key] : undefined;
}

export function getAllUserVars(telegramId: number) {
  const session = dbCache.get(Number(telegramId));
  return session?.vars || {};
}

export async function setUserVar(telegramId: number, key: string, value: unknown) {
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

export async function deleteUserVar(telegramId: number, key: string) {
  const idNum = Number(telegramId);
  return withKeyLock(idNum, async () => {
    const session = dbCache.get(idNum);
    if (!session || !session.vars) {return false;}

    delete session.vars[key];
    await persistField(idNum, 'vars', session.vars);
    return true;
  });
}

export function getSystemVar(key: string) {
  return systemConfigCache.vars ? systemConfigCache.vars[key] : undefined;
}

export function getAllSystemVars() {
  return systemConfigCache.vars || {};
}

export async function setSystemVar(key: string, value: unknown) {
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

export async function deleteSystemVar(key: string) {
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


