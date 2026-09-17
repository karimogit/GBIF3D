/**
 * Offline snapshot of the last successful occurrence load (IndexedDB).
 */
import type { GBIFOccurrence, OccurrenceFilters } from '@/types/gbif';

const DB_NAME = 'gbif-globe-offline';
const DB_VERSION = 1;
const STORE = 'snapshots';
const SNAPSHOT_KEY = 'latest';
export const OFFLINE_MAX_RECORDS = 5000;

export interface OfflineSnapshot {
  occurrences: GBIFOccurrence[];
  filters: OccurrenceFilters;
  regionLabel?: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function saveOfflineSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  try {
    const db = await openDb();
    const trimmed: OfflineSnapshot = {
      ...snapshot,
      occurrences: snapshot.occurrences.slice(0, OFFLINE_MAX_RECORDS),
      savedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(trimmed, SNAPSHOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore — offline cache is best-effort
  }
}

export async function loadOfflineSnapshot(): Promise<OfflineSnapshot | null> {
  try {
    const db = await openDb();
    const data = await new Promise<OfflineSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve((req.result as OfflineSnapshot | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data;
  } catch {
    return null;
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
