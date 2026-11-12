// Client-presentation file storage. IndexedDB stores actual bytes in this browser.
// Never put sensitive or real client records in this demo.
const DB_NAME = 'topmind-demo-files'
const STORE = 'files'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Unable to access demo file storage'))
  })
}
export async function putDemoFile(bucket: string, path: string, file: Blob): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(file, `${bucket}/${path}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save file in browser'))
      tx.onabort = () => reject(tx.error ?? new Error('File storage quota reached'))
    })
  } finally { db.close() }
}
export async function getDemoFile(bucket: string, path: string): Promise<Blob | null> {
  const db = await open()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(`${bucket}/${path}`)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error ?? new Error('Unable to read demo file'))
    })
  } finally { db.close() }
}
