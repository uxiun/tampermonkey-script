import { cleanTitleUrl } from "@/pure/url"
import { padSpacesAroundUrl } from "./pure/utils"

// 1. 今開いているページのURLとタイトルを取得
const tabsInfo = await ACtl.getTabInfo("#currentTab")

const [[title, url]] = cleanTitleUrl(...Object.values(tabsInfo))

console.log(title, url)

const selectionLines = await ACtl.expand(`> <selection.lines>`, "#currentTab")
console.log({ selectionLines })

const dltLink = `[${title} ${url}]`

if (selectionLines === "> ") {
  ACtl.setClipboard(dltLink)
} else {
  ACtl.setClipboard(`${padSpacesAroundUrl(selectionLines)}\n-- ${dltLink}`)
}
