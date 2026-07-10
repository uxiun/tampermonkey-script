import { removePrefix } from "@/pure/utils"

export const DLT_HISTORY_KEY = "dlt-history"
export const DLT_DOCK_KEY = "dlt-dock"
export const DLT_MY_ID = "7779"
const DLT_SAVE_PATH = "<documents>/autocontrol-dlt-links.json"

// localStorageに保存するデータ型
export interface PostLink {
  id: string
  title: string
  at?: string // 36進法時刻印
}

export const getAt = () => Date.now().toString(36)

export const sortByAt = (a: PostLink, b: PostLink) => {
  const atA = a.at || ""
  const atB = b.at || ""
  if (atA < atB) return 1
  if (atA > atB) return -1
  return 0
}

export const postLinkText = (postLink: PostLink) =>
  `{${postLink.title} K#${removePrefix(DLT_MY_ID, postLink.id)}}`

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
      result: { inserted: [], updated: [], moved: [] },
    }
  }

  const result = {
    inserted: [] as PostLink[],
    updated: [] as PostLink[],
    moved: [] as PostLink[],
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

  if (res) console.log("saved at", res)
  else console.log("could not saved at", DLT_SAVE_PATH)
}

export const restoreLinks = async (current?: PostLink[]) => {
  const fileHistory: PostLink[] = await ACtl.getFile(DLT_SAVE_PATH, "json")
  const currentHistory = current ?? getHistoryFromLocalStorage()

  // 一旦IDの重複を排除して全件結合する（Mapのキー特性を利用）
  const unionMap = new Map<string, PostLink>()

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
    }
  })

  const mergedList = Array.from(unionMap.values())

  // 💡 ここがコア： at 属性の降順（新しい順）で並び替える。at が無いものは末尾（過去）へ。
  mergedList.sort(sortByAt)

  // mergedList.sort((a, b) => {
  //   const atA = a.at || ""
  //   const atB = b.at || ""
  //   if (atA < atB) return 1
  //   if (atA > atB) return -1
  //   return 0
  // })

  console.log(
    "⚓ タイムスタンプベースで復元・ソート完了:",
    mergedList.length,
    "件",
  )
  localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(mergedList))

  return mergedList
}

// キーワード群によるAND包含検索 ＆ スコアリングロジック
export function searchLinks(query: string, links: PostLink[]) {
  const keywords = query.split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return []

  const results: { link: PostLink; score: number }[] = []

  for (const link of links) {
    const titleLower = link.title.toLowerCase()

    let isMatch = true
    let totalScore = 0

    for (let j = 0; j < keywords.length; j++) {
      const kw = keywords[j].toLowerCase()
      const idx = titleLower.indexOf(kw)

      if (idx === -1) {
        isMatch = false
        break
      }

      // 【スコアリング・アルゴリズム】
      let kwScore = Math.max(0, 100 - idx)
      if (titleLower === kw) kwScore += 500
      if (idx === 0 || titleLower.charAt(idx - 1) === " ") kwScore += 50

      totalScore += kwScore
    }

    if (isMatch) {
      results.push({ link, score: totalScore })
    }
  }

  return results.sort((a, b) => b.score - a.score).map(r => r.link)
}
