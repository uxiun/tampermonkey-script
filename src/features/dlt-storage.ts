import { removePrefix } from "@/pure/utils"

export const DLT_HISTORY_KEY = "dlt-history"
export const DLT_DOCK_KEY = "dlt-dock"
export const DLT_MY_ID = "7779"
const DLT_SAVE_PATH = "<documents>/autocontrol-dlt-links.json"

// localStorageに保存するデータ型
export interface PostLink {
  id: string
  title: string
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

export function collectAndMergeLinks(newLinks: PostLink[]) {
  if (newLinks.length === 0) return

  // 1. 現在の履歴をロード
  const currentHistory: PostLink[] = JSON.parse(
    localStorage.getItem(DLT_HISTORY_KEY) || "[]",
  )
  let updatedHistory = [...currentHistory]

  // 2. 新しく取得したリンクを1つずつマージ
  newLinks.reverse().forEach(newLink => {
    // 💡 既存の同じIDを一旦削除（タイトル更新への対応 ＆ 最新順ソートのための位置リセット）
    updatedHistory = updatedHistory.filter(p => p.id !== newLink.id)
    // 💡 常に配列の先頭（最新）に突っ込む
    updatedHistory.unshift(newLink)
  })

  // // 必要に応じて最大件数（例: 500件）でキャップをかける
  // if (updatedHistory.length > 500) {
  //   updatedHistory = updatedHistory.slice(0, 500)
  // }

  // 3. 保存
  localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(updatedHistory))
}

export type MergeLinkResult = {
  inserted: PostLink[]
  updated: PostLink[]
  moved: PostLink[]
}

// export function mergeLinksStorage(
//   storageKey: string,
//   newLinks: PostLink[],
// ): MergeLinkResult {
//   if (newLinks.length === 0)
//     return {
//       inserted: [],
//       updated: [],
//       moved: [],
//     }

//   const currentHistory: PostLink[] = JSON.parse(
//     localStorage.getItem(storageKey) || "[]",
//   )
//   let updatedHistory = [...currentHistory]
//   const result: MergeLinkResult = {
//     inserted: [],
//     updated: [],
//     moved: [],
//   }

//   // 2. 新しく取得したリンクを1つずつマージ
//   newLinks.reverse().forEach(newLink => {
//     let upd = false
//     let moved = false
//     // 💡 既存の同じIDを一旦削除（タイトル更新への対応 ＆ 最新順ソートのための位置リセット）
//     updatedHistory = updatedHistory.filter(p => {
//       if (p.id === newLink.id) {
//         if (p.title !== newLink.title) upd = true
//         else moved = true
//         return false
//       } else return true
//     })
//     // 💡 常に配列の先頭（最新）に突っ込む
//     updatedHistory.unshift(newLink)
//     if (upd) result.updated.push(newLink)
//     else if (moved) result.moved.push(newLink)
//     else result.inserted.push(newLink)
//   })

//   // 3. 保存
//   localStorage.setItem(storageKey, JSON.stringify(updatedHistory))
//   return result
// }

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
  currentHistory: PostLink[], // 元のファイルの中身（パース済みの配列）
  newLinks: PostLink[], // 追加したい新しいリンク
): { links: PostLink[]; result: MergeLinkResult } {
  if (newLinks.length === 0) {
    return {
      links: currentHistory,
      result: { inserted: [], updated: [], moved: [] },
    }
  }

  const result = {
    inserted: [] as PostLink[],
    updated: new Map<string, PostLink>(),
    moved: new Map<string, PostLink>(),
  }

  // 1. 新しいリンクのIDを高速検索できるように Set化（重複排除と存在チェック用）
  const newLinksMap = new Map<string, PostLink>()
  newLinks.forEach(link => newLinksMap.set(link.id, link))

  // 2. 既存の履歴から、新しいリンクに含まれるIDを「一撃」で弾き出す（1回のループで完結）
  // 新しいリンクにあるIDは、あとで「先頭」に追加するため、古い位置にあるものはここで残さない
  const filteredHistory = currentHistory.filter(p => {
    const hasNew = newLinksMap.has(p.id)
    if (hasNew) {
      const newLink = newLinksMap.get(p.id)!
      if (p.title !== newLink.title) result.updated.set(newLink.id, newLink)
      else result.moved.set(newLink.id, newLink)
    }
    return !hasNew // 新しいリンクにIDが含まれていなければ残す
  })

  // 3. まだ inserted/updated/moved のどれにも分類されていない newLinks は「完全新規(inserted)」
  newLinks.forEach(newLink => {
    const isClassified =
      result.updated.has(newLink.id) || result.moved.has(newLink.id)

    if (!isClassified) {
      result.inserted.push(newLink)
    }
  })

  // 4. 【ここがキモ】スプレッド演算子で「新リンク（最新順）」と「残った古い履歴」をガッチャンコ
  // ループ内で unshift を連打するのをやめ、最後に1回だけ配列を結合する
  const updatedHistory = [...newLinks, ...filteredHistory]

  return {
    links: updatedHistory,
    result: {
      inserted: result.inserted,
      updated: Array.from(result.updated.values()),
      moved: Array.from(result.moved.values()),
    },
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

  const m = mergeLinksFast(fileHistory, currentHistory)
  console.log("merge result:", m.result)
  console.log("restored", m.links.length, "history")

  localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(m.links))
  return m
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
