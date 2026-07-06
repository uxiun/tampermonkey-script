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

const getHistoryFromLocalStorage = () => {
  return JSON.parse(localStorage.getItem("dlt-history") || "[]") as PostLink[]
}

// import "dotenv/config"
// export const backupToFile = () => {
//   const path = process.env.DLT_HISTORY_PATH || "C:\\ac-dlt\\history.json"

//   ACtl.save
// }
