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

//
