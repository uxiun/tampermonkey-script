export const mergeObjects = <T, K extends keyof T>(
  hasDuplicate: T[],
  keys: K[],
): T[] => {
  const seen = new Map<string, T>()

  for (const item of hasDuplicate) {
    // 指定された複数のキーの値を結合して、一意の識別子（複合キー）を作る
    const compositeKey = keys.map(key => String(item[key])).join("::")

    // まだ登録されていない複合キーの場合のみ、Mapに記録する（最初の要素が優先される）
    if (!seen.has(compositeKey)) {
      seen.set(compositeKey, item)
    }
  }

  // Mapの値を配列にして返す
  return Array.from(seen.values())
}

export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))

export const removePrefix = (prefix: string, text: string) =>
  text.startsWith(prefix) ? text.slice(prefix.length) : text

export function isPromise(value: any) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  )
}

export function dbg<T>(e: T) {
  console.log(e)
  return e
}

export const entriesMap = <V>(obj: { [key: string | number | symbol]: V }) =>
  new Map(Object.entries(obj))

export function padSpacesAroundUrl(text: string) {
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

// 2つの文字列配列(fg/bg)に差分があるかチェックするヘルパー
export function hasArrayChanged(
  arr1: string[] = [],
  arr2: string[] = [],
): boolean {
  if (arr1.length !== arr2.length) return true
  const set1 = new Set(arr1)
  return arr2.some(id => !set1.has(id))
}

export const transpose = <T>(a: T[][]) => a[0].map((_, c) => a.map(r => r[c]))

export const isInput = () => {
  const activeEl = document.activeElement
  return Boolean(
    activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement).isContentEditable),
  )
}
export const isTopPage = () =>
  window.location.origin + "/" === window.location.href ||
  window.location.origin === window.location.href
