// Map<hostnameRegex, 例外=消す param の配列>
const paramBlacklist = new Map()

// Map<hostnameRegex, 例外=残す param の配列>
const paramWhitelist = new Map([[/^www\.amazon\./, []]])

const cleanParam = (urlString: string) => {
  const url = URL.parse(urlString)
  if (!url) return urlString
  let url2 = url.origin + url.pathname

  const params = new URLSearchParams()
  for (const [hostnameRegex, exceptionParams] of paramWhitelist) {
    if (hostnameRegex.test(url.hostname)) {
      for (const param of exceptionParams) {
        const value = url.searchParams.get(param)
        if (value) params.append(param, value)
      }
      break
    }
  }
  if (params.size > 0) {
    url2 + "?"
    return decodeURIComponent(url2 + params.toString())
  } else {
    return decodeURIComponent(urlString)
  }
}

const hashBlacklist = [/:\/\/dlt\.kitetu\.com/]

const cleanHash = (urlString: string) => {
  const url = decodeURIComponent(urlString)
  if (hashBlacklist.find(rg => rg.test(url))) {
    return url.replace(/#.*$/, "")
  } else {
    return url
  }
}

type TitleUrl = [title: string, url: string]
type Modifier = (title: string, url: string) => TitleUrl

export const modifiers: { [key: string]: Modifier } = {
  cleanParamUrl: (title, url) => [title, cleanParam(url)],
  cleanHashUrl: (title, url) => [title, cleanHash(url)],

  // title 先頭の (1) のような通知の数を表す部分を消す
  removeNotificationNumber: (title, _) => [title.replace(/^\(\d+\)/, ""), _],
}

export const modify =
  (...modifiers: Modifier[]) =>
  (...titleUrls: { title: string; url: string }[]) =>
    titleUrls.map(({ title, url }) =>
      modifiers.reduce(
        ([title, url], modifier) => {
          console.log({ title, url })
          return modifier(title, url)
        },
        [title, url],
      ),
    )

export const cleanTitleUrl = modify(
  modifiers.cleanHashUrl,
  modifiers.cleanParamUrl,
  modifiers.removeNotificationNumber,
)
