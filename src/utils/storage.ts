import { get, set, del } from 'idb-keyval';
import type { StorageEstimateInfo } from '../types/video';

const PROJECT_STATE_KEY = 'clipforge_project_state';

export async function checkStorageQuota(): Promise<StorageEstimateInfo> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota || 0;
      const usage = estimate.usage || 0;
      const available = Math.max(0, quota - usage);
      // Low if available < 1GB or > 90% full
      const isLow = available < 1024 * 1024 * 1024 || (quota > 0 && usage / quota > 0.9);
      return { quota, usage, available, isLow };
    } catch {
      // Fallback
    }
  }

  return {
    quota: 10 * 1024 * 1024 * 1024, // Assumed 10GB
    usage: 0,
    available: 10 * 1024 * 1024 * 1024,
    isLow: false
  };
}

export async function saveProjectState(data: unknown): Promise<void> {
  try {
    await set(PROJECT_STATE_KEY, data);
  } catch (err) {
    console.warn('Failed to save project state to IndexedDB:', err);
  }
}

export async function loadProjectState<T>(): Promise<T | null> {
  try {
    const data = await get<T>(PROJECT_STATE_KEY);
    return data ?? null;
  } catch (err) {
    console.warn('Failed to load project state from IndexedDB:', err);
    return null;
  }
}

export async function clearProjectStorage(): Promise<void> {
  try {
    await del(PROJECT_STATE_KEY);
  } catch (err) {
    console.warn('Failed to clear project storage:', err);
  }
}
