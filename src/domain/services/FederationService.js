import { fedCache } from '../../infrastructure/dbCore.js';
import { FederationModel } from '../models/index.js';

export function getFederation(fedId) {
  return fedCache.get(String(fedId)) || null;
}

export function getAllFederations() {
  return Array.from(fedCache.values());
}

export async function saveFederation(fedData) {
  const fedId = String(fedData.fed_id);
  fedCache.set(fedId, fedData);
  
  try {
    await FederationModel.updateOne({ fed_id: fedId }, fedData, { upsert: true });
  } catch(e) {}
  return true;
}

export async function deleteFederation(fedId) {
  fedCache.delete(String(fedId));
  try {
    await FederationModel.deleteOne({ fed_id: String(fedId) });
  } catch(e) {}
  return true;
}
