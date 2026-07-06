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

const selectObserve =
  (selectors: string, observeOption: MutationObserverInit) =>
  (observer: MutationObserver) => {
    const target = document.querySelector(selectors)
    if (target) observer.observe(target, observeOption)
  }
