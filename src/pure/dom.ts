/**
 * セレクタで取得した要素の中から、今現在画面（視界）に見えている要素だけを抽出する
 * @param selector 検索したいCSSセレクタ（例: 'a', '.link-hint-target'）
 */
export function getVisibleElements(
  selector: string,
  base: Document | Element = document,
): HTMLElement[] {
  // 1. セレクタに一致する要素をすべて取得して配列に変換
  const elements = Array.from(base.querySelectorAll<HTMLElement>(selector))

  // 2. 現在の画面の幅と高さを取得
  const viewHeight = window.innerHeight || document.documentElement.clientHeight
  const viewWidth = window.innerWidth || document.documentElement.clientWidth

  // 3. 視界に入っているかどうかでフィルタリング
  return elements.filter(el => {
    const rect = el.getBoundingClientRect()

    // 💡 判定ポイント1: 要素のサイズが 0 ではない（display: none や visibility: hidden の除外）
    if (rect.width === 0 || rect.height === 0) return false

    // 💡 判定ポイント2: 要素が画面の上下左右の枠内に収まっているか
    const isInViewport =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewHeight &&
      rect.left < viewWidth

    return isInViewport
  })
}

export function getPopupPosition(
  inputEl: HTMLTextAreaElement | HTMLInputElement | HTMLElement,
  startPos: number,
  mirrorElementId: string,
) {
  const VIEWPORT_MARGIN = 10 // 画面端との最低余白(px)
  const popupEstimatedHeight = 200 // 候補窓の概算高さ（必要に応じて変更）
  const popupEstimatedWidth = 400 // 候補窓の概算高さ（必要に応じて変更）

  // ==========================================
  // A. contentEditable の場合 (Range API を直接使用)
  // ==========================================
  if (inputEl.isContentEditable) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0).cloneRange()
      range.collapse(true) // キャレット位置に固定

      // キャレット（カーソル）の画面上の絶対座標を取得
      const rects = range.getClientRects()
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect()

      if (rect.width !== 0 || rect.height !== 0 || rect.top !== 0) {
        const styles = window.getComputedStyle(inputEl)
        const lineHeight = parseFloat(styles.lineHeight) || 20

        let top = rect.bottom // キャレットの直下に配置
        let left = rect.left

        // 画面下からはみ出る場合はキャレットの上に表示
        if (top + popupEstimatedHeight > window.innerHeight - VIEWPORT_MARGIN) {
          top = Math.max(VIEWPORT_MARGIN, rect.top - popupEstimatedHeight)
        }

        // 画面右からはみ出る場合の画面内補正
        left = Math.min(
          left,
          window.innerWidth - popupEstimatedWidth - VIEWPORT_MARGIN,
        ) // 220はポップアップ幅＋余白
        left = Math.max(VIEWPORT_MARGIN, left)

        return { top, left, lineHeight }
      }
    }
  }

  // ==========================================
  // B. input / textarea の場合 (ミラーDOM法)
  // ==========================================
  let mirrorEl = document.getElementById(mirrorElementId)
  if (!mirrorEl) {
    mirrorEl = document.createElement("div")
    mirrorEl.id = mirrorElementId
    Object.assign(mirrorEl.style, {
      position: "absolute",
      top: "-9999px",
      left: "-9999px",
      visibility: "hidden",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflow: "hidden", // スクロールバーの影響を排除
    })
    document.body.appendChild(mirrorEl)
  }

  const fullText =
    "value" in inputEl && typeof (inputEl as any).value === "string"
      ? (inputEl as HTMLInputElement).value
      : (inputEl.textContent ?? "")

  const rect = inputEl.getBoundingClientRect()
  const styles = window.getComputedStyle(inputEl)

  // フォント・ボックスモデル属性を正確にコピー
  const properties = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderWidth",
    "boxSizing",
  ]
  properties.forEach(prop => {
    mirrorEl!.style[prop as any] = styles[prop as any]
  })

  // 幅を完全に固定
  mirrorEl.style.width = `${rect.width}px`

  // 指定カーソル位置までの文字列を適用
  const textBefore = fullText.slice(0, startPos)
  mirrorEl.textContent = textBefore

  const marker = document.createElement("span")
  marker.textContent = "{"
  mirrorEl.appendChild(marker)

  const lineHeight = parseFloat(styles.lineHeight) || 20

  // ⚠️【位置修正のコア】
  // rect.top は「画面（Viewport）の左上からの位置」。
  // ミラー内の marker.offsetTop は「textarea最上部からの相対位置」。
  // そこから inputEl.scrollTop（スクロールした分）を「引く」のが正解。
  let top = rect.top + marker.offsetTop - inputEl.scrollTop + lineHeight
  let left = rect.left + marker.offsetLeft - inputEl.scrollLeft

  // 画面下部からはみ出る場合の画面内折り返し（画面の上にポップアップを出す）
  if (top + popupEstimatedHeight > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(
      VIEWPORT_MARGIN,
      rect.top + marker.offsetTop - inputEl.scrollTop - popupEstimatedHeight,
    )
  }

  // 画面左右の画面外ガード
  left = Math.min(
    left,
    window.innerWidth - popupEstimatedWidth - VIEWPORT_MARGIN,
  )
  left = Math.max(VIEWPORT_MARGIN, left)

  return { top, left, lineHeight }
}

// export function getPopupPosition(
//   inputEl: HTMLTextAreaElement | HTMLInputElement | HTMLElement,
//   startPos: number,
//   mirrorElementId: string,
// ) {
//   let mirrorEl = document.getElementById(mirrorElementId)
//   if (!mirrorEl) {
//     mirrorEl = document.createElement("div")
//     mirrorEl.id = mirrorElementId
//     Object.assign(mirrorEl.style, {
//       position: "absolute",
//       visibility: "hidden",
//       whiteSpace: "pre-wrap",
//       wordWrap: "break-word",
//     })
//     document.body.appendChild(mirrorEl)
//   }

//   function _getPopupPosition(
//     inputEl: HTMLTextAreaElement | HTMLInputElement | HTMLElement,
//     startPos: number,
//   ) {
//     if (!mirrorEl)
//       return {
//         top: 0,
//         left: 0,
//         lineHeight: 20,
//       }

//     // ★ 修正箇所：input / textarea なら .value、contenteditable 等なら .textContent を取得
//     const fullText =
//       "value" in inputEl && typeof (inputEl as any).value === "string"
//         ? (inputEl as HTMLInputElement).value
//         : (inputEl.textContent ?? "")
//     const rect = inputEl.getBoundingClientRect()
//     const styles = window.getComputedStyle(inputEl)

//     const properties = [
//       "fontFamily",
//       "fontSize",
//       "fontWeight",
//       "paddingTop",
//       "paddingRight",
//       "paddingBottom",
//       "paddingLeft",
//       "lineHeight",
//       "borderWidth",
//     ]
//     properties.forEach(prop => {
//       mirrorEl!.style[prop as any] = styles[prop as any]
//     })
//     mirrorEl.style.width = `${rect.width}px`

//     const textBeforeBrace = fullText.slice(0, startPos)
//     mirrorEl.textContent = textBeforeBrace

//     const marker = document.createElement("span")
//     marker.textContent = "{"
//     mirrorEl.appendChild(marker)

//     const lineHeight = parseFloat(styles.lineHeight) || 20

//     // return inputEl.getAttribute("id") === "kw"
//     //   ? {
//     //       top:
//     //         rect.top +
//     //         marker.offsetTop +
//     //         (parseFloat(styles.lineHeight) || 20) +
//     //         inputEl.scrollTop,
//     //       left: rect.left + marker.offsetLeft - inputEl.scrollLeft,
//     //       lineHeight,
//     //     }
//     return {
//       top:
//         rect.top +
//         marker.offsetTop +
//         (parseFloat(styles.lineHeight) || 20) +
//         inputEl.scrollTop,
//       left: rect.left + marker.offsetLeft - inputEl.scrollLeft,
//       lineHeight,
//     }
//   }

//   return _getPopupPosition(inputEl, startPos)
// }

export interface CursorTextInfo {
  before: string // カーソル手前のテキスト
  selected: string // 選択中のテキスト（未選択時は ""）
  after: string // カーソル直後のテキスト
}

export function getCursorSurroundingText(
  el: HTMLElement | HTMLInputElement | HTMLTextAreaElement,
): CursorTextInfo {
  // 1. standard input / textarea の場合
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const value = el.value
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0

    return {
      before: value.slice(0, start),
      selected: value.slice(start, end),
      after: value.slice(end),
    }
  }

  // 2. contentEditable 要素の場合
  if (el.isContentEditable) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      return { before: "", selected: "", after: el.textContent ?? "" }
    }

    const range = sel.getRangeAt(0)

    // A. 要素全体のテキストを取得
    const fullText = el.textContent ?? ""

    // B. 手前テキストの取得用の Range を作成 (要素の先頭〜選択範囲の開始点)
    const beforeRange = document.createRange()
    beforeRange.selectNodeContents(el)
    beforeRange.setEnd(range.startContainer, range.startOffset)
    const before = beforeRange.toString()

    // C. 選択中テキスト
    const selected = range.toString()

    // D. 直後テキストの計算 (全体の長さ - (手前 + 選択中) の長さ からスライス)
    const afterIndex = before.length + selected.length
    const after = fullText.slice(afterIndex)

    return { before, selected, after }
  }

  // 対象外要素のフォールバック
  return { before: "", selected: "", after: "" }
}

export const checkCursorSurroundingText = (
  text: string,
  checkBeforeCursor: boolean,
  el: HTMLElement,
) => {
  const surroundingText = getCursorSurroundingText(el)
  console.log("cursorSurroundingText", surroundingText)
  return checkBeforeCursor
    ? surroundingText.before.endsWith(text)
    : surroundingText.after.startsWith(text)
}
