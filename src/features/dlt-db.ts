import { hasArrayChanged } from "@/pure/utils"
import { ScrapeResult, scrapeWithFgBg } from "./dlt-dom"
import {
  getAt,
  LinkUpdate,
  MergeLinkResult,
  mergeLinksFast,
  sortByAt,
  type PostLink,
} from "./dlt-storage"

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

    request.onsuccess = () => {
      const links: PostLink[] = request.result || []
      resolve(links.sort(sortByAt)) // ID順から at(時刻)降順へ整列！
    }
    request.onerror = () => reject(request.error)
  })
}

type LinkMap = Map<string, PostLink>

const updateFgBgLinks = (src: LinkMap) => (linksOfFgBg: PostLink[]) => {
  const result: LinkUpdate[] = []

  linksOfFgBg.forEach(l => {
    const s = src.get(l.id)
    if (s) {
      const combinedFg = Array.from(new Set([...(l.fg || []), ...(s.fg || [])]))
      const combinedBg = Array.from(new Set([...(l.bg || []), ...(s.bg || [])]))

      const item: LinkUpdate = {
        link: {
          ...s,
          bg: combinedBg,
          fg: combinedFg,
          fgc: l.fgc || s.fgc,
          bgc: l.bgc || s.bgc,
        },
        update: {
          type: "modify",
          title: s.title !== l.title,
          bgfg:
            hasArrayChanged(s.bg, combinedBg) ||
            hasArrayChanged(s.fg, combinedFg),
        },
      }
      result.push(item)
    } else {
      result.push({ link: l, update: { type: "inserted" } })
    }
  })

  return result
}

const updateListLinks = (src: LinkMap) => (listLinks: PostLink[]) => {
  const result: LinkUpdate[] = []

  listLinks.forEach(l => {
    const s = src.get(l.id)
    if (s) {
      let mergedFg: string[]
      let mergedBg: string[]

      if ((l.fgc || 0) > 9 && (l.bgc || 0) > 9) {
        const fs = new Set(s.fg)
        l.fg?.reverse().forEach(id => fs.add(id))
        mergedFg = Array.from(fs).reverse()

        const bs = new Set(s.bg)
        l.bg?.reverse().forEach(id => bs.add(id))
        mergedBg = Array.from(bs).reverse()
      } else {
        mergedFg = Array.from(new Set([...(l.fg || []), ...(s.fg || [])]))
        mergedBg = Array.from(new Set([...(l.bg || []), ...(s.bg || [])]))
      }

      result.push({
        link: {
          ...s,
          ...l,
          fg: mergedFg,
          bg: mergedBg,
        },
        update: {
          type: "modify",
          title: s.title !== l.title,
          bgfg:
            hasArrayChanged(s.fg, mergedFg) || hasArrayChanged(s.bg, mergedBg),
        },
      })
    } else {
      result.push({ link: l, update: { type: "inserted" } })
    }
  })
  return result
}

function updateScrapedFgBg(r: ScrapeResult, cache: PostLink[]) {
  const linkMap = new Map(cache.map(l => [l.id, l]))
  let result: LinkUpdate[] = []
  if (r.main) result = updateListLinks(linkMap)([r.main])

  const updater = updateFgBgLinks(linkMap)

  const notIn = ({ id }: { id: string }) =>
    r.main?.id !== id && r.list.every(bln => bln.id !== id)

  result = [
    ...result,
    ...updateListLinks(linkMap)(r.list),
    // 吊るし輪郭(main) ではなくリストに含まれてもいないfg/bgの輪郭のみ更新する
    ...updater(r.fg.filter(notIn)),
    ...updater(r.bg.filter(notIn)),
  ]

  return result
}

export async function mergeFgBgFast(
  rawResult: ScrapeResult,
  cache?: PostLink[],
) {
  const all = cache || (await getAllLinksFromIDB())
  const linkUpdates = updateScrapedFgBg(rawResult, all)
  const linkUpdateMap = new Map(linkUpdates.map(u => [u.link.id, u]))
  const currentTime = getAt()

  const result: MergeLinkResult = {
    inserted: [],
    moved: [],
    updated: [],
    unchanged: [],
  }

  const fgbgUpdated: PostLink[] = []

  const tailPart = all.flatMap(oldLink => {
    const u = linkUpdateMap.get(oldLink.id)
    if (!u) return [oldLink]
    let l = u.link
    if (u.update.type === "modify" && u.update.title) {
      l.at = currentTime
      result.updated.push(l)
      return []
    } else if ((oldLink.at ?? "") < (l.at ?? "")) {
      result.moved.push(l)
      return []
    }
    fgbgUpdated.push(l)
    return [l]
  })

  result.inserted = linkUpdates.flatMap(u =>
    u.update.type === "inserted" ? [{ ...u.link, at: currentTime }] : [],
  )

  return {
    links: [
      ...result.inserted,
      ...result.updated,
      ...result.moved,
      ...tailPart,
    ],
    toSave: [
      ...result.inserted,
      ...result.updated,
      ...result.moved,
      ...fgbgUpdated,
    ],
    result,
  }
}

export async function scrapeAndMergeFgBg(limitOwn = true, cache?: PostLink[]) {
  const res = scrapeWithFgBg(limitOwn)
  const { toSave, ...m } = await mergeFgBgFast(res, cache)
  await saveLinksToIDB(toSave)
  return m
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
// setupTabSyncListener を addEventListener に変更！
export function setupTabSyncListener(onUpdate: (diff: PostLink[]) => void) {
  syncChannel.addEventListener(
    "message",
    (event: MessageEvent<SyncMessage>) => {
      if (event.data.type === "DLT_HISTORY_UPDATED") {
        console.log(
          "⚡ [BroadcastChannel] 他タブでのIDB更新を検知！",
          event.data.links.length,
          "件",
        )
        onUpdate(event.data.links)
      }
    },
  )
}

export async function mergeLinksToIDB(links: PostLink[], allLink?: PostLink[]) {
  const all = allLink || (await getAllLinksFromIDB())
  const m = mergeLinksFast(all, links)
  await saveLinksToIDB(Object.values(m.result).flat())
  return m
}

export async function deleteAllFgBg() {
  const ok = confirm("全ての項目の前後景を削除します。本当にいいですか？")
  if (!ok) return

  const all = await getAllLinksFromIDB()
  const fgbgRemoved: PostLink[] = all.map(({ id, title, at, use }) => ({
    id,
    title,
    at,
    use,
  }))

  await saveLinksToIDB(fgbgRemoved)
}
