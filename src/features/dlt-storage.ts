import { removePrefix } from "@/pure/utils"
import { getAllLinksFromIDB, saveLinksToIDB } from "./dlt-db"
import { showToast } from "@/pure/component"

export const DLT_HISTORY_KEY = "dlt-history"
export const DLT_DOCK_KEY = "dlt-dock"
export const DLT_MY_ID = "7779"
const DLT_SAVE_PATH = "<documents>/autocontrol-dlt-links.json"

export interface PostLink {
  id: string
  title: string
  at?: string // 36進法時刻印
  use?: number // 使用回数
  fg?: string[] // 前景=親ID
  bg?: string[] // 後景=子ID
  fgc?: number
  bgc?: number
}

export interface LinkUpdate {
  link: PostLink
  update: Inserted | Modify
}
type Inserted = { type: "inserted" }
type Modify = {
  type: "modify"
  title: boolean
  bgfg: boolean
}

export const getAt = () => Date.now().toString(36)

export const sortByAt = (a: PostLink, b: PostLink) => {
  const atA = a.at || ""
  const atB = b.at || ""
  if (atA < atB) return 1
  if (atA > atB) return -1
  return 0
}

export interface RecentRangeOption {
  startDaysAgo: number // 何日前から（例: 7 = 7日前から）
  endDaysAgo?: number // 何日前まで（例: 0 = 今日まで。指定しなければ現在時刻まで）
  dayStartHour?: number // 一日の始まりの時刻（例: 4 = 午前4時更新。デフォルト 4）
}

/**
 * ソシャゲ式の日付境界（例: 朝4時更新）に基づいて指定範囲内のリンクを取得する
 *
 * @example
 * getRecentLinks(links, 7)         // 直近7日間（7年前の朝4時〜現在）
 * getRecentLinks(links, 1, 0)      // 昨日一日分（昨日の朝4時〜今日の朝4時）
 * getRecentLinks(links, 0)         // 今日一日分（今日の朝4時〜現在）
 */
export function getRecentLinks(
  links: PostLink[],
  startDaysAgo: number,
  endDaysAgo?: number,
  dayStartHour = 4,
): PostLink[] {
  const now = new Date()

  // 1. 今日の「日付変更線（例: 朝4:00）」のミリ秒タイムスタンプを算出
  // （現在時刻から dayStartHour 分を引いて「論理的な今日」の日付を取得）
  const logicalToday = new Date(now.getTime() - dayStartHour * 60 * 60 * 1000)
  logicalToday.setHours(dayStartHour, 0, 0, 0)
  const todayBoundaryMs = logicalToday.getTime()

  // 2. 開始時刻（startDaysAgo 前の朝4:00）
  const startMs = todayBoundaryMs - startDaysAgo * 24 * 60 * 60 * 1000

  // 3. 終了時刻（指定がなければ「現在時刻 Date.now()」、指定があれば「endDaysAgo 前の朝4:00」）
  const endMs =
    endDaysAgo !== undefined
      ? todayBoundaryMs - endDaysAgo * 24 * 60 * 60 * 1000
      : Date.now()

  // 4. 範囲内のリンクをフィルタリング
  return links.filter(link => {
    if (!link.at) return false
    const timeMs = parseInt(link.at, 36)
    return timeMs >= startMs && timeMs < endMs
  })
}

export const useCount = (l: PostLink) =>
  l.use ? { ...l, use: l.use + 1 } : { ...l, use: 1 }

export const postLinkText = (postLink: PostLink) =>
  `{${postLink.title} ${linkIdText(postLink)}}`

export const linkIdText = (link: PostLink) =>
  `K#${removePrefix(DLT_MY_ID, link.id)}`

export const postLinkTextList = (links: PostLink[]) =>
  links.map(postLinkText).join("")

export type IdTitleMap = Map<string, string>

export const removeDuplicateOrEmpty = (links: PostLink[]) =>
  postLinksFromMap(
    new Map(links.flatMap(l => (l.title.length > 0 ? [[l.id, l.title]] : []))),
  )

export const postLinksFromMap = (map: IdTitleMap): PostLink[] =>
  Array.from(map.entries()).map(([id, title]) => ({ id, title }))

export const getHistoryFromLocalStorage = () => {
  return JSON.parse(localStorage.getItem(DLT_HISTORY_KEY) || "[]") as PostLink[]
}

export const getLinksFromLocalStorage = (storageKey: string) => {
  return JSON.parse(localStorage.getItem(storageKey) || "[]") as PostLink[]
}

export type MergeLinkResult = {
  inserted: PostLink[]
  updated: PostLink[]
  moved: PostLink[]
  unchanged: PostLink[]
}

export function mergeLinksStorage(
  storageKey: string,
  newLinks: PostLink[],
  currentLinks?: PostLink[],
): { links: PostLink[]; result: MergeLinkResult } {
  const currentHistory: PostLink[] =
    currentLinks ?? JSON.parse(localStorage.getItem(storageKey) || "[]")

  if (newLinks.length === 0)
    return {
      links: currentHistory,
      result: {
        inserted: [],
        updated: [],
        moved: [],
        unchanged: [],
      },
    }

  const m = mergeLinksFast(currentHistory, newLinks)

  // 3. 保存
  localStorage.setItem(storageKey, JSON.stringify(m.links))
  return m
}

export function mergeLinksFast(
  currentHistory: PostLink[], // 元の履歴（またはバックアップファイルの中身）
  newLinks: PostLink[], // ページから自動取得、またはDOCK等から流れてきた最新リンク
): { links: PostLink[]; result: MergeLinkResult } {
  if (newLinks.length === 0) {
    return {
      links: currentHistory,
      result: { inserted: [], updated: [], moved: [], unchanged: [] },
    }
  }

  const result: MergeLinkResult = {
    inserted: [],
    updated: [],
    moved: [],
    unchanged: [],
  }

  const currentTime = getAt()

  // 高速検索用に新しいリンクのマップを作成
  const newLinksMap = new Map<string, PostLink>(newLinks.map(l => [l.id, l]))

  // 既存リンクの中で「新リンクと重複していないもの」だけを綺麗に残す
  // 新リンク側でタイトルが変わっている場合、または新規の場合は後で先頭に差し込むため
  const dup = new Set<string>()
  const filteredHistory = currentHistory.filter(oldLink => {
    const hasNew = newLinksMap.has(oldLink.id)
    if (hasNew) {
      const newLink = newLinksMap.get(oldLink.id)!
      if (oldLink.title !== newLink.title) {
        // タイトルが更新された：新しいatを付与して先頭送りのため、ここでは弾く
        const updatedLink = { ...newLink, at: currentTime }
        result.updated.push(updatedLink)
        return false
      } else if ((oldLink.at ?? "") < (newLink.at ?? "")) {
        result.moved.push(newLink)
        return false
      } else {
        // タイトルもIDも完全に一致：既存の順番と古い `at` を完全に維持するため、そのまま残す
        if (dup.has(newLink.id))
          return false // 既存履歴の中で被ってる不具合
        else {
          result.unchanged.push(newLink)
          dup.add(newLink.id)
          return true
        }
      }
    }
    return true // 新リンクに全くなければそのまま位置を維持
  })

  // 新リンクの中で、まだ処理（updated/moved）されていないものは「完全新規」
  newLinks.forEach(newLink => {
    if (
      !dup.has(newLink.id) &&
      !result.moved.some(l => l.id === newLink.id) &&
      !result.updated.some(l => l.id === newLink.id)
    ) {
      const insertedLink = { ...newLink, at: currentTime }
      result.inserted.push(insertedLink)
    }
  })

  const sorted = [...result.moved, ...filteredHistory].sort(sortByAt)

  // 💡 結合の並び順: [ 完全新規(inserted) + タイトル更新(updated) ] を最先頭に、その後に既存の順序を維持した配列
  const updatedHistory = [...result.inserted, ...result.updated, ...sorted]

  return {
    links: updatedHistory,
    result,
  }
}

export const overwriteBackupLinks = async (current?: PostLink[]) => {
  const currentHistory = current ?? getHistoryFromLocalStorage()

  const ok = confirm(`${DLT_SAVE_PATH}を現在の履歴で上書きしますか？`)

  if (ok) {
    const res = await ACtl.saveFile(
      DLT_SAVE_PATH,
      JSON.stringify(currentHistory),
    )

    if (res) console.log("saved at", res)
    else console.log("could not saved at", DLT_SAVE_PATH)
  } else {
    console.log("canceled")
  }
}

export const backupLinks = async (current?: PostLink[]) => {
  const fileHistory: PostLink[] = await ACtl.getFile(DLT_SAVE_PATH, "json")
  const currentHistory = current ?? getHistoryFromLocalStorage()

  const m = mergeLinksFast(fileHistory, currentHistory)
  console.log("merge result:", m.result)

  const res = await ACtl.saveFile(DLT_SAVE_PATH, JSON.stringify(m.links))

  return res
    ? `saved ${m.links.length} links at ${res}`
    : `could not saved at ${DLT_SAVE_PATH}`
}

export const restoreLinks = async (current?: PostLink[]) => {
  const fileHistory: PostLink[] = await ACtl.getFile(DLT_SAVE_PATH, "json")
  const currentHistory = current ?? (await getAllLinksFromIDB())

  // 一旦IDの重複を排除して全件結合する（Mapのキー特性を利用）
  const unionMap = new Map<string, PostLink>()
  const newlyAdded: PostLink[] = []

  // 古いものから順にMapに突っ込むことで、新しい `at` を持つ方が最終的に上書き残るようにする
  // 1. まず現在のローカル履歴を突っ込む
  currentHistory.forEach(l => unionMap.set(l.id, l))
  // 2. 次にファイル側の履歴を突っ込む（ファイル側の方が at が新しい、あるいは未定義の古いデータがある）
  fileHistory.forEach(l => {
    const existing = unionMap.get(l.id)
    // 両方に存在する場合、at を比較して新しい方を採用（未定義は最古とみなす）
    if (existing) {
      const existingAt = existing.at || ""
      const fileAt = l.at || ""
      if (fileAt >= existingAt) {
        unionMap.set(l.id, l)
      }
    } else {
      unionMap.set(l.id, l)
      newlyAdded.push(l)
    }
  })

  const mergedList = Array.from(unionMap.values())

  // 💡 ここがコア： at 属性の降順（新しい順）で並び替える。at が無いものは末尾（過去）へ。
  mergedList.sort(sortByAt)

  // localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(mergedList))
  await saveLinksToIDB(mergedList)
  const msg = `${mergedList.length}件(+${newlyAdded.length})復元`
  console.log(msg)
  showToast(msg)

  return mergedList
}

// キーワード群によるAND包含検索 ＆ スコアリングロジック
export function searchLinks(query: string, links: PostLink[]) {
  const keywords = query.split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return links

  const results: { link: PostLink; score: number }[] = []

  for (const link of links) {
    const titleLower = link.title.toLowerCase()

    let isMatch = true
    let totalScore = 0

    for (const keyword of keywords) {
      const kw = keyword.toLowerCase()
      const idx = titleLower.indexOf(kw)

      if (idx === -1) {
        isMatch = false
        break
      }

      // 【スコアリング・アルゴリズム】
      // let kwScore = Math.max(0, 100 - idx)
      let kwScore = idx >= 0 ? 100 : 0
      if (titleLower === kw) kwScore += 5000
      if (idx === 0) kwScore += 1000
      if (titleLower.charAt(idx - 1) === " ") kwScore += 100

      totalScore += kwScore
    }

    if (isMatch) {
      // totalScore += link.use ?? 0 // 使用回数ボーナス
      results.push({ link, score: totalScore })
    }
  }

  return results.sort((a, b) => b.score - a.score).map(r => r.link)
}

// 初回だけ localStorage から IDB へ引越しさせる関数
export async function migrateLocalStorageToIDB() {
  const rawLocalData = localStorage.getItem(DLT_HISTORY_KEY)
  if (rawLocalData) {
    try {
      const localLinks: PostLink[] = JSON.parse(rawLocalData)
      if (localLinks.length > 0) {
        console.log(
          `📦 LocalStorageから ${localLinks.length} 件のデータをIndexedDBへ移行中...`,
        )
        await saveLinksToIDB(localLinks, false)
        console.log("✅ 移行完了！ LocalStorageをクリーンアップします")
      }
    } catch (e) {
      console.error("Migration failed", e)
    }
    // 二度と移行が走らないように localStorage 側は消去する
    localStorage.removeItem(DLT_HISTORY_KEY)
  }
}
