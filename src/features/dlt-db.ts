import { mergeLinksFast, type PostLink } from "./dlt-storage"

const DB_NAME = "dlt_workspace_db"
const DB_VERSION = 1
const STORE_NAME = "links"

// 差分メッセージの型定義
type SyncMessage =
  | { type: "DLT_HISTORY_UPDATED"; links: PostLink[] }
  | { type: "DLT_HISTORY_FULL_REFRESH" }

// タブ間通信専用チャンネルの開設
const syncChannel = new BroadcastChannel("dlt_sync_channel")

// IDBの初期化・オープン
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = _e => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // id を主キー(keyPath)に設定。at（タイムスタンプ）にもインデックスを貼る
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("by_at", "at", { unique: false })
        store.createIndex("by_fg", "fg", { unique: false, multiEntry: true })
        store.createIndex("by_bg", "bg", { unique: false, multiEntry: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 全件取得（復元時や初期ロード用）
export async function getAllLinksFromIDB(): Promise<PostLink[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export async function saveLinksIfUpdatedToIDB(links: PostLink[]) {
  const m = mergeLinksFast
}

// 複数リンクの保存（バルクインサート / アップデート）
export async function saveLinksToIDB(
  links: PostLink[],
  notifyOtherTabs = true,
): Promise<void> {
  if (links.length === 0) return
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)

    links.forEach(link => store.put(link)) // putは「無ければ挿入、あれば更新」

    tx.oncomplete = () => {
      // 保存が成功したら、他タブへ「データが更新されたぞ！」と軽量に通知
      if (notifyOtherTabs) {
        syncChannel.postMessage({ type: "DLT_HISTORY_UPDATED", links })
      }
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

// 他タブからの同期メッセージをリスンする設定
export function setupTabSyncListener(onUpdate: (diff: PostLink[]) => void) {
  syncChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
    if (event.data.type === "DLT_HISTORY_UPDATED") {
      console.log("⚡ 他タブでのIDB更新を検知！UIを即時更新します")
      onUpdate(event.data.links)
    } else if (event.data.type === "DLT_HISTORY_FULL_REFRESH") {
      console.log(event.data)
    }
  }
}

export async function mergeLinksToIDB(links: PostLink[], allLink?: PostLink[]) {
  const all = allLink || (await getAllLinksFromIDB())
  const m = mergeLinksFast(all, links)
  await saveLinksToIDB(Object.values(m.result).flat())
  return m
}
