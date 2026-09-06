import { cleanTitleUrl } from "./pure/url"

const allTabsInfo = await ACtl.getTabInfo("#allTabs")
const tabsInfo = Object.values(allTabsInfo).filter(({ url }) => {
  const u = URL.parse(url)
  return u.hostname === "chromewebstore.google.com"
})

const titleUrls = cleanTitleUrl(...tabsInfo)
console.log(titleUrls)

for (const [title, url] of titleUrls) {
  const dltLink = `[${title} ${url}]`
  await ACtl.setClipboard(dltLink)
}
