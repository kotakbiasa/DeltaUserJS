import { dbCache, persistField } from '../../infrastructure/dbCore.js';

export function getReputation(telegramId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return 0;
  const score = (session.reputation_data || {})[String(targetUserId)];
  return score !== undefined ? score : 0;
}

export async function updateReputation(telegramId, targetUserId, points) {
  const idNum = Number(telegramId);
  const session = dbCache.get(idNum);
  if (!session) return null;

  if (!session.reputation_data) session.reputation_data = {};
  session.reputation_data[String(targetUserId)] = Number(points);
  await persistField(idNum, 'reputation_data', session.reputation_data);
  return Number(points);
}
