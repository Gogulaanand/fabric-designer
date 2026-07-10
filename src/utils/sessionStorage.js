/**
 * Auto-save session storage using IndexedDB.
 *
 * IndexedDB is used instead of localStorage because embedded source images
 * as data URLs typically range from 10-30 MB, far exceeding localStorage's
 * ~5 MB limit. IndexedDB has no practical size limit (browsers allocate a
 * percentage of available disk space).
 *
 * The module stores a single session record keyed by a fixed ID. Each write
 * replaces the previous session. The stored format matches the serialization
 * from projectFile.js (serializeProject output + replaceAllNonBlack).
 */

const DB_NAME = 'textile-band-colorizer';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const SESSION_KEY = 'autosave';

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a session to IndexedDB.
 * @param {string} serializedProject - JSON string from serializeProject()
 * @returns {Promise<void>}
 */
export async function saveSession(serializedProject) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(serializedProject, SESSION_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Load the saved session from IndexedDB.
 * @returns {Promise<string|null>} The serialized project JSON string, or null if none exists.
 */
export async function loadSession() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(SESSION_KEY);
    request.onsuccess = () => {
      db.close();
      resolve(request.result ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Clear the saved session from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearSession() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(SESSION_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Check whether a saved session exists without loading its full content.
 * @returns {Promise<boolean>}
 */
export async function hasSession() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count(SESSION_KEY);
    request.onsuccess = () => {
      db.close();
      resolve(request.result > 0);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
