const DB_NAME = "ac_ime_db"
const DB_VERSION = 1
const STORE_HANZI = "hanzi"
const STORE_CODE = "zhcode"

interface AsciiWord {
  word: string
  spell: string
  lang: string
}

const ASCII_WORD: AsciiWord = {
  word: "",
  spell: "",
  lang: "",
}

type CjkLang = "zh-cn" | "zh-tw" | "zh-hk" | "ja" | "ko"

export interface Hanzi {
  zh: string
  pinyins: string[]
  cj5: string[]
  cqkmForm: string | null
  cqkmInitials: string[]
}

export interface ZhCode {
  zh: string
  code: string
  schema: Schema
  nth: number
}

type Schema = "cqkm" | "cj5"

const HANZI_DEFAULT: Hanzi = {
  zh: "",
  pinyins: [],
  cj5: [],
  cqkmForm: null,
  cqkmInitials: [],
}

type SyncMessage =
  | { type: "code updated"; codes: ZhCode[] }
  | { type: "hanzi updated"; hans: Hanzi[] }

const syncChannel = new BroadcastChannel("ac_ime_channel")

export async function deleteObjectStore(storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = _e => {
      const db = req.result
      if (db.objectStoreNames.contains(storeName)) {
        db.deleteObjectStore(storeName)
      }
    }
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = _e => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_HANZI)) {
        const store = db.createObjectStore(STORE_HANZI, {
          keyPath: "zh",
        })
        store.createIndex("pinyins", "pinyins", {
          unique: false,
          multiEntry: true,
        })
        store.createIndex("cj5", "cj5", { unique: false, multiEntry: true })
        store.createIndex("cqkmInitials", "cqkmInitials", {
          unique: false,
          multiEntry: true,
        })
        store.createIndex("cqkmForm", "cqkmForm", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORE_CODE)) {
        const store = db.createObjectStore(STORE_CODE, {
          keyPath: ["zh", "code", "schema"],
        })
        store.createIndex("code-schema", ["code", "schema"], { unique: false })
        store.createIndex("zh", "zh", { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const getAllHansFromIDB = () => getAllFromIDB<Hanzi>(STORE_HANZI)
export const getAllCodesFromIDB = () => getAllFromIDB<ZhCode>(STORE_CODE)

async function getAllFromIDB<T>(storeName: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => {
      const items: T[] = request.result || []
      resolve(items)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function putCodesIDB(codes: ZhCode[]): Promise<void> {
  if (codes.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CODE, "readwrite")
    const store = tx.objectStore(STORE_CODE)

    codes.forEach(code => {
      store.put(code)
    })

    tx.oncomplete = () => {
      const msg: SyncMessage = {
        type: "code updated",
        codes,
      }
      syncChannel.postMessage(msg)
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function putHansIDB(hans: Hanzi[]): Promise<void> {
  if (hans.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANZI, "readwrite")
    const store = tx.objectStore(STORE_HANZI)

    hans.forEach(han => {
      store.put(han)
    })

    tx.oncomplete = () => {
      const msg: SyncMessage = {
        type: "hanzi updated",
        hans,
      }
      syncChannel.postMessage(msg)
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export const launchIME = () => {
  console.log("AutoControl.launchIME")
}
