import {
  DLT_DOCK_KEY,
  mergeLinksFast,
  mergeLinksStorage,
  PostLink,
  postLinkText,
  searchLinks,
  useCount,
} from "./dlt-storage"
import {
  getAllLinksFromIDB,
  mergeLinksToIDB,
  setupTabSyncListener,
} from "./dlt-db"
import { candidateLink } from "./dlt-component"

type IMEOption = {
  suggestionNumbers: number
}

const defaultIMEOption: IMEOption = {
  suggestionNumbers: 5,
}

type IMEState = {
  isActive: boolean
  candidates: PostLink[]
  history: PostLink[]
  selectedIndex: number
  startPos: number
  endPos: number
  originalText: string
  query: string
  target: null | HTMLInputElement | HTMLTextAreaElement
}

let imeState: IMEState = {
  isActive: false,
  candidates: [] as PostLink[],
  history: [] as PostLink[],
  selectedIndex: 0,
  query: "",
  startPos: 0,
  endPos: 0,
  originalText: "",
  target: null,
}

export const isImeActive = () => imeState.isActive

// function syncLocalStorage(state: IMEState) {
//   state.history = JSON.parse(localStorage.getItem(DLT_HISTORY_KEY) || "[]")
// }
async function syncIDB(state: IMEState) {
  state.history = await getAllLinksFromIDB()
}

// キーワード群によるAND包含検索 ＆ スコアリングロジック
function searchHistoryFast(option: IMEOption, state: IMEState) {
  return searchLinks(state.query, state.history).slice(
    0,
    option.suggestionNumbers,
  )
}

function runSearch(option: IMEOption, state: IMEState) {
  console.log("runSearch, state:", state)
  const matched = searchHistoryFast(option, state)

  if (matched.length === 0) {
    return { ...state, candidates: [], isActive: false }
  }

  return {
    ...state,
    isActive: true,
    candidates: matched,
    originalText: state.query,
  }
}

function renderWidget(state: IMEState, inlinePopup: InlineSuggestPopup) {
  if (!state.isActive || !state.target) {
    inlinePopup.hide()
    return
  }

  const coords = getPopupPosition(state.target, state.startPos)
  inlinePopup.show(
    coords,
    state.candidates,
    state.selectedIndex,
    state.candidates.length,
  )
}

export function dltIME(option = defaultIMEOption) {
  if ((window as any).__dlt_ime__) return
  ;(window as any).__dlt_ime__ = true

  const inlinePopup = new InlineSuggestPopup()

  // 初回起動時にローカルストレージから履歴キャッシュを読み込む
  syncIDB(imeState)

  setupTabSyncListener(async diff => {
    const m = mergeLinksFast(imeState.history, diff)
    imeState.history = m.links

    if (!imeState.isActive || !imeState.target) return
    const prevSelectedIndex = imeState.selectedIndex
    imeState = {
      ...runSearch(option, imeState),
      selectedIndex: prevSelectedIndex,
    }
    renderWidget(imeState, inlinePopup)
  })

  // 外部イベントで履歴が同期された際のハンドラー（現在の検索状態を維持したまま再検索）
  const handleExternalRefresh = () => {
    if (!imeState.isActive || !imeState.target) {
      syncIDB(imeState)
      return
    }
    const prevSelectedIndex = imeState.selectedIndex
    syncIDB(imeState)
    imeState = {
      ...runSearch(option, imeState),
      selectedIndex: prevSelectedIndex, // 外部更新時は選択インデックスを維持する
    }
    renderWidget(imeState, inlinePopup)
  }

  window.addEventListener("dlt-history-updated", handleExternalRefresh)

  // 共通の入力/状態更新ロジック（タイピング時専用）
  function handleImeLookup(isTyping: boolean) {
    const target = imeState.target
    if (!target) return
    const context = getInlineImeContext(target)
    if (!context) {
      imeState.isActive = false
      inlinePopup.hide()
      return
    }

    imeState.query = context.query
    imeState.startPos = context.startPos
    imeState.endPos = context.endPos

    const searchResult = runSearch(option, imeState)

    imeState = {
      ...searchResult,
      // タイピングによる新しい文字入力があった時だけ、選択をリセットする
      selectedIndex: isTyping ? 0 : imeState.selectedIndex,
    }

    renderWidget(imeState, inlinePopup)
  }

  // 2. キャレット位置移動の監視
  const checkCaretBoundary = (e: Event) => {
    if (!imeState.isActive) return

    const activeEl = e.target
    const isInput =
      activeEl &&
      ((activeEl as HTMLElement).tagName === "INPUT" ||
        (activeEl as HTMLElement).tagName === "TEXTAREA" ||
        (activeEl as HTMLElement).isContentEditable)
    if (!isInput) return

    const target = e.target as HTMLTextAreaElement | HTMLInputElement
    console.log(target)

    // Tabキーのキーアップ時は境界チェックや再評価をスキップ（選択状態を守る）
    if (e instanceof KeyboardEvent && e.key === "Tab") return

    const currentCaret = target.selectionStart ?? 0

    if (
      currentCaret <= imeState.startPos ||
      currentCaret > imeState.endPos ||
      target.selectionStart !== target.selectionEnd
    ) {
      imeState.isActive = false
      inlinePopup.hide()
      return
    }

    // カーソル移動やクリックによる評価時は、タイピングではないので選択状態をリセットしない
    handleImeLookup(false)
  }

  window.addEventListener("keyup", checkCaretBoundary, true)
  window.addEventListener("click", checkCaretBoundary, true)

  // 1. タイピング時の監視
  window.addEventListener(
    "input",
    e => {
      const target = e.target as Element
      if (!target) return
      if (target.matches("textarea.src"))
        imeState.target = target as HTMLTextAreaElement
      if (target.tagName === "INPUT")
        imeState.target = target as HTMLInputElement
      handleImeLookup(true) // タイピング中フラグをON
    },
    true,
  )

  // キーハイジャックリスナー（キャプチャフェーズ）
  window.addEventListener(
    "keydown",
    e => {
      if (!imeState.isActive) return

      const target = e.target as HTMLTextAreaElement | HTMLInputElement

      // --- Tab / Shift+Tab による候補選択のローテーション ---
      if (e.key === "Tab") {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        const len = imeState.candidates.length
        if (e.shiftKey) {
          imeState.selectedIndex = (imeState.selectedIndex - 1 + len) % len
        } else {
          imeState.selectedIndex = (imeState.selectedIndex + 1) % len
        }

        renderWidget(imeState, inlinePopup)
        return
      }

      // --- Enter による確定 ---
      if (e.key === "Enter") {
        if (imeState.selectedIndex !== -1) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()

          const selected = imeState.candidates[imeState.selectedIndex]
          const replacement = postLinkText(selected)
          const value = target.value

          target.value =
            value.slice(0, imeState.startPos) +
            replacement +
            value.slice(imeState.endPos)

          const newCaretPos = imeState.startPos + replacement.length
          target.setSelectionRange(newCaretPos, newCaretPos)

          imeState.isActive = false
          inlinePopup.hide()

          const updatedSelected = useCount(selected)
          const { links } = mergeLinksStorage(DLT_DOCK_KEY, [updatedSelected])
          window.dispatchEvent(
            new CustomEvent("dlt-dock-updated", { detail: links }),
          )

          mergeLinksToIDB([updatedSelected], imeState.history).then(m => {
            imeState.history = m.links
          })
        }
        return
      }

      // --- Escape によるキャンセル ---
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        imeState.isActive = false
        inlinePopup.hide()
        return
      }
    },
    true,
  )
}

class InlineSuggestPopup {
  private el: HTMLDivElement

  constructor() {
    this.el = document.createElement("div")
    this.el.id = "dlt-inline-ime-popup"
    Object.assign(this.el.style, {
      position: "fixed",
      zIndex: "2147483647",
      background: "transparent",
      border: "none",
      boxShadow: "none",
      padding: "4px",
      display: "none",
      // maxWidth: "520px", // 💡 横方向に敷き詰めるための適切な最大幅
      overflowY: "auto",
      fontFamily: "monospace",
      fontSize: "13px",
    })
    document.body.appendChild(this.el)
  }

  show(
    coords: { top: number; left: number },
    candidates: PostLink[],
    selectedIndex: number,
    _optionNumbers: number,
  ) {
    console.log(coords)

    if (candidates.length === 0) {
      this.hide()
      return
    }

    // 画面全体の有効な横幅を取得（スクロールバーを含まない幅）
    const client = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }
    const maxWidth = client.width - coords.left - 16
    const maxHeight = client.height - coords.top - 16

    Object.assign(
      this.el.style,
      maxWidth < 200
        ? {
            right: "16px",
            maxWidth: "200px",
          }
        : {
            left: `${coords.left}px`,
            maxWidth: `${maxWidth}px`,
          },
    )

    // 💡 Flex-wrap で横向きレンガ状に敷き詰める設定
    Object.assign(this.el.style, {
      top: `${coords.top}px`,
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      maxHeight: `${maxHeight}px`,
      alignItems: "flex-end",
    })

    const historyMap = new Map(imeState.history.map(l => [l.id, l]))

    this.el.innerHTML = candidates
      .map((cand, idx) => {
        const isSelected = idx === selectedIndex
        return candidateLink(historyMap, cand, isSelected)

        const bg = isSelected ? "#313244" : "rgba(24, 24, 37, 0.88)"
        const border = isSelected
          ? "1px solid #89b4fa"
          : "1px solid rgba(69, 71, 90, 0.6)"
        const boxShadow = isSelected
          ? "0 4px 14px rgba(137, 180, 250, 0.35)"
          : "0 2px 6px rgba(0,0,0,0.3)"

        // 親（fg）タイトルの取得（重複排除）
        const rawFgTitles = (cand.fg || [])
          .map(fgId => historyMap.get(fgId)?.title)
          .filter((title): title is string => Boolean(title))

        const fgTitles = Array.from(new Set(rawFgTitles)).slice(0, 2)

        const fgHtml =
          fgTitles.length > 0
            ? `<div style="font-size: 10px; color: #89b4fa; opacity: 0.9; margin-bottom: 2px; font-weight: bold; white-space: nowrap;">
                ${fgTitles.join("｜")}
               </div>`
            : ""

        return `
          <div style="flex: 0 1 auto; min-width: 0; overflow: hidden; padding: 5px 7px; background: ${bg}; border: ${border}; border-radius: 6px; box-shadow: ${boxShadow}; backdrop-filter: blur(4px); transition: all 0.08s ease; max-width: 100%;">
            ${fgHtml}
            <div style="color: ${isSelected ? "#89b4fa" : "#cdd6f4"}; font-weight: ${isSelected ? "bold" : "normal"}; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 13px;">
              ${cand.title}
            </div>
          </div>
        `
      })
      .join("")

    // 選択中のチップへの自動スクロール追従
    const selectedEl = this.el.children[selectedIndex] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }

  hide() {
    this.el.style.display = "none"
  }
}

function getPopupPosition(
  inputEl: HTMLTextAreaElement | HTMLInputElement,
  startPos: number,
) {
  console.log({ inputEl, startPos })

  let mirrorEl = document.getElementById("dlt-ime-mirrorEl")
  if (!mirrorEl) {
    mirrorEl = document.createElement("div")
    Object.assign(mirrorEl.style, {
      position: "absolute",
      visibility: "hidden",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
    })
    document.body.appendChild(mirrorEl)
  }

  function _getPopupPosition(
    inputEl: HTMLTextAreaElement | HTMLInputElement,
    startPos: number,
  ) {
    if (!mirrorEl)
      return {
        top: 0,
        left: 0,
      }

    const rect = inputEl.getBoundingClientRect()
    const styles = window.getComputedStyle(inputEl)

    const properties = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "lineHeight",
      "borderWidth",
    ]
    properties.forEach(prop => {
      mirrorEl!.style[prop as any] = styles[prop as any]
    })
    mirrorEl.style.width = `${rect.width}px`

    const textBeforeBrace = inputEl.value.slice(0, startPos)
    mirrorEl.textContent = textBeforeBrace

    const marker = document.createElement("span")
    marker.textContent = "{"
    mirrorEl.appendChild(marker)

    return inputEl.getAttribute("id") === "kw"
      ? {
          top:
            rect.top +
            marker.offsetTop +
            (parseFloat(styles.lineHeight) || 20) +
            inputEl.scrollTop,
          left: rect.left + marker.offsetLeft - inputEl.scrollLeft,
        }
      : {
          top:
            rect.top +
            marker.offsetTop +
            (parseFloat(styles.lineHeight) || 20) +
            inputEl.scrollTop,
          left: rect.left + marker.offsetLeft - inputEl.scrollLeft,
        }
  }

  return _getPopupPosition(inputEl, startPos)
}

function getInlineImeContext(inputEl: HTMLTextAreaElement | HTMLInputElement) {
  const text = inputEl.value
  const caretPos = inputEl.selectionStart ?? 0

  const beforeCaret = text.slice(0, caretPos)
  const afterCaret = text.slice(caretPos)

  // 1. キャレットより手前に最も近い "{" を取得
  const lastOpenBraceIndex = beforeCaret.lastIndexOf("{")
  if (lastOpenBraceIndex === -1) return null

  // 2. その "{" とキャレットの間に "}" があったら、既に閉じられているので無効
  const hasClosedBeforeCaret = beforeCaret
    .slice(lastOpenBraceIndex)
    .includes("}")
  if (hasClosedBeforeCaret) return null

  // 💡【コアの修正】キャレットより後ろで「最初に現れる { 」と「最初に現れる } 」の位置を取得
  const nextOpenBraceIndex = afterCaret.indexOf("{")
  const nextCloseBraceIndex = afterCaret.indexOf("}")

  let queryText = ""
  let endPosInText = caretPos

  // 有効な閉じ括弧 "}" があるかどうかの判定：
  // 「"}" が存在し、かつ (次に "{" が現れない、または "{" よりも手前に "}" がある)」場合のみ対応する閉じ括弧とみなす！
  const hasValidCloseBrace =
    nextCloseBraceIndex !== -1 &&
    (nextOpenBraceIndex === -1 || nextCloseBraceIndex < nextOpenBraceIndex)

  if (hasValidCloseBrace) {
    // 例: "{apple| banana}" や "{he|ll}" のように正しいペアの閉じ括弧がある場合
    queryText =
      beforeCaret.slice(lastOpenBraceIndex + 1) +
      afterCaret.slice(0, nextCloseBraceIndex)
    endPosInText = caretPos + nextCloseBraceIndex + 1
  } else {
    // 例: "{he|(caret) ... {some link K#XXXX}" のように、後ろの { よりも手前に対応する } がない場合
    queryText = beforeCaret.slice(lastOpenBraceIndex + 1)
    endPosInText = caretPos
  }

  queryText = queryText.trim()
  // if (!queryText) return null

  return {
    query: queryText,
    startPos: lastOpenBraceIndex,
    endPos: endPosInText,
  }
}
