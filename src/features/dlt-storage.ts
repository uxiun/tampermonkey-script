export const DLT_HISTORY_KEY = "dlt-history"

// localStorageに保存するデータ型
export interface PostLink {
  id: string
  title: string
}

export const postLinkText = (postLink: PostLink) =>
  `{${postLink.title} K#${postLink.id}}`

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

export function collectAndMergeLinks(newLinks: PostLink[]) {
  if (newLinks.length === 0) return

  // 1. 現在の履歴をロード
  const currentHistory: PostLink[] = JSON.parse(
    localStorage.getItem(DLT_HISTORY_KEY) || "[]",
  )
  let updatedHistory = [...currentHistory]

  // 2. 新しく取得したリンクを1つずつマージ
  newLinks.forEach(newLink => {
    // 💡 既存の同じIDを一旦削除（タイトル更新への対応 ＆ 最新順ソートのための位置リセット）
    updatedHistory = updatedHistory.filter(p => p.id !== newLink.id)
    // 💡 常に配列の先頭（最新）に突っ込む
    updatedHistory.unshift(newLink)
  })

  // 必要に応じて最大件数（例: 500件）でキャップをかける
  if (updatedHistory.length > 500) {
    updatedHistory = updatedHistory.slice(0, 500)
  }

  // 3. 保存
  localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(updatedHistory))
}

// import "dotenv/config"
// export const backupToFile = () => {
//   const path = process.env.DLT_HISTORY_PATH || "C:\\ac-dlt\\history.json"

//   ACtl.save
// }
