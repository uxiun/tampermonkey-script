const tabsInfo = await ACtl.getTabInfo("#currentTab")
const [[title, rawUrl]] = Object.values(tabsInfo).map(({ title, url }) => [
  title.replace(/^\(\d+\)/, ""),
  url,
])

// Map<hostnameRegex, 例外=消す param の配列>
const paramWhitelist = new Map()

// Map<hostnameRegex, 例外=残す param の配列>
const paramBlacklist = new Map([[/^www\.amazon\./, []]])

const cleanUrl = urlString => {
  const url = URL.parse(urlString)
  let url2 = url.origin + url.pathname

  const params = new URLSearchParams()
  for (const [hostnameRegex, exceptionParams] of paramBlacklist) {
    if (hostnameRegex.test(url.hostname)) {
      for (const param of exceptionParams) {
        const value = url.searchParams.get(param)
        if (value) params.append(param, value)
      }
      break
    }
  }
  if (params.size > 0) url2 + "?"
  return url2 + params.toString()
}

function padSpacesAroundUrl(text) {
  // URLとして許可する半角文字のパターン
  const urlPattern = /https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g

  // URLと、その「直前の1文字」および「直後の1文字」をまとめてマッチさせる
  // (.)? : 直前の任意の1文字（グループ1）
  // (https?://...) : URL本体（グループ2）
  // (.)? : 直後の任意の1文字（グループ3）
  const combinedRegex = new RegExp(`(.)?(${urlPattern.source})(.)?`, "g")

  return text.replace(combinedRegex, (match, p1, p2, p3) => {
    let result = p2 // ベースとなるURL本体

    // --- 直前の判定 ---
    if (p1 !== undefined) {
      // 直前に文字があり、それが空白・改行以外ならスペースを付与
      if (!/[\s\n]/.test(p1)) {
        result = p1 + " " + result
      } else {
        result = p1 + result
      }
    }

    // --- 直後の判定 ---
    if (p3 !== undefined) {
      // 直後に文字があり、それが空白・改行以外ならスペースを付与
      if (!/[\s\n]/.test(p3)) {
        result = result + " " + p3
      } else {
        result = result + p3
      }
    }

    return result
  })
}

const url = cleanUrl(rawUrl)
const selection = await ACtl.expand(`<selection>`).then(s => s.trim())
const quote = !!selection
  ? padSpacesAroundUrl(selection)
      .trim()
      .split("\n")
      .map(line => `> ${line}`)
      .reduce((acc, line) => `${acc}\n${line}`)
  : ""
const link = url.length > 80 ? `[${title} ${url}]` : `<!-- ${title} -->\n${url}`

const dln = [link, quote].join("\n").trim()

if (quote) await ACtl.setClipboard(dln)
const [tabId] = await ACtl.openURL(
  `https://dlt.kitetu.com/?knm=${title}&dln=${encodeURIComponent(dln)}`,
  {
    rightOf: "#currentTab",
  },
)
await ACtl.on("tabLoadEnd", tabId)

await ACtl.runInTab(tabId, () => {
  document.querySelector("#drw button.sv").click()
  // document.querySelector("#drw button.pvw").click()
})
await ACtl.sleep(150)
await ACtl.closeTab(tabId)
