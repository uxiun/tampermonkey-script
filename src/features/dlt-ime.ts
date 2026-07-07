import {
  DLT_HISTORY_KEY,
  getHistoryFromLocalStorage,
  PostLink,
  postLinkText,
} from "./dlt-storage"

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
  selectedIndex: -1,
  query: "",
  startPos: 0,
  endPos: 0,
  originalText: "",
  target: null,
}

function syncLocalStorage(state: IMEState) {
  state.history = JSON.parse(localStorage.getItem(DLT_HISTORY_KEY) || "[]")
}

// キーワード群によるAND包含検索 ＆ スコアリングロジック
function searchHistoryFast(option: IMEOption, state: IMEState) {
  const keywords = state.query.split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return []

  const results: { link: PostLink; score: number }[] = []

  for (const link of state.history) {
    const titleLower = link.title.toLowerCase()

    let isMatch = true
    let totalScore = 0

    for (let j = 0; j < keywords.length; j++) {
      const kw = keywords[j].toLowerCase()
      const idx = titleLower.indexOf(kw)

      if (idx === -1) {
        isMatch = false
        break
      }

      // 【スコアリング・アルゴリズム】
      let kwScore = Math.max(0, 100 - idx)
      if (titleLower === kw) kwScore += 500
      if (idx === 0 || titleLower.charAt(idx - 1) === " ") kwScore += 50

      totalScore += kwScore
    }

    if (isMatch) {
      results.push({ link, score: totalScore })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .map(r => r.link)
    .slice(0, option.suggestionNumbers)
}

function runSearch(option: IMEOption, state: IMEState) {
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
  inlinePopup.show(coords, state.candidates, state.selectedIndex)
}

export function dltIME(option = defaultIMEOption) {
  if ((window as any).__dlt_ime__) return
  ;(window as any).__dlt_ime__ = true

  console.log("IME ready!")

  const inlinePopup = new InlineSuggestPopup()

  // 初回起動時にローカルストレージから履歴キャッシュを読み込む
  syncLocalStorage(imeState)

  // 外部イベントで履歴が同期された際のハンドラー（現在の検索状態を維持したまま再検索）
  const handleExternalRefresh = () => {
    if (!imeState.isActive || !imeState.target) {
      syncLocalStorage(imeState)
      return
    }
    const prevSelectedIndex = imeState.selectedIndex
    syncLocalStorage(imeState)
    imeState = {
      ...runSearch(option, imeState),
      selectedIndex: prevSelectedIndex, // 外部更新時は選択インデックスを維持する
    }
    renderWidget(imeState, inlinePopup)
  }

  window.addEventListener("dlt-history-updated", handleExternalRefresh)
  window.addEventListener("storage", e => {
    if (e.key === DLT_HISTORY_KEY) handleExternalRefresh()
  })

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
      // タイピングによる新しい文字入力があった時だけ、選択を -1 にリセットする
      selectedIndex: isTyping ? -1 : imeState.selectedIndex,
    }

    renderWidget(imeState, inlinePopup)
  }

  // 2. キャレット位置移動の監視
  const checkCaretBoundary = (e: Event) => {
    if (!imeState.isActive) return
    const target = e.target as HTMLTextAreaElement | HTMLInputElement
    if (!target || !target.matches("textarea.src")) return

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
      if (!target || !target.matches("textarea.src")) return
      imeState.target = target as HTMLTextAreaElement
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

        const len = imeState.candidates.length
        if (e.shiftKey) {
          imeState.selectedIndex =
            ((imeState.selectedIndex - 1 + (len + 1)) % (len + 1)) - 1
        } else {
          imeState.selectedIndex =
            ((imeState.selectedIndex + 1 + 1) % (len + 1)) - 1
        }

        renderWidget(imeState, inlinePopup)
        return
      }

      // --- Enter による確定 ---
      if (e.key === "Enter") {
        if (imeState.selectedIndex !== -1) {
          e.preventDefault()
          e.stopPropagation()

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
        }
        return
      }

      // --- Escape によるキャンセル ---
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
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
      background: "#1e1e2e",
      color: "#cdd6f4",
      border: "1px solid #45475a",
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      padding: "4px",
      display: "none",
      maxHeight: "200px",
      overflowY: "auto",
      fontFamily: "monospace",
      fontSize: "12px",
    })
    document.body.appendChild(this.el)
  }

  show(
    coords: { top: number; left: number },
    candidates: any[],
    selectedIndex: number,
  ) {
    if (candidates.length === 0) {
      this.hide()
      return
    }
    this.el.style.top = `${coords.top}px`
    this.el.style.left = `${coords.left}px`
    this.el.style.display = "block"

    this.el.innerHTML = candidates
      .map((cand, idx) => {
        const isSelected = idx === selectedIndex
        const bg = isSelected ? "#89b4fa" : "transparent"
        const fg = isSelected ? "#11111b" : "#cdd6f4"
        return `<div style="padding: 4px 8px; background: ${bg}; color: ${fg}; border-radius: 4px; white-space: nowrap;">
        ${cand.title} <span style="opacity: 0.6; font-size: 10px;">${cand.id || ""}</span>
      </div>`
      })
      .join("")

    const selectedEl = this.el.children[selectedIndex] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" })
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

    return {
      top:
        rect.top +
        marker.offsetTop +
        parseFloat(styles.lineHeight || "20") +
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

  const lastOpenBraceIndex = beforeCaret.lastIndexOf("{")
  if (lastOpenBraceIndex === -1) return null

  const hasClosedBeforeCaret = beforeCaret
    .slice(lastOpenBraceIndex)
    .includes("}")
  if (hasClosedBeforeCaret) return null

  const firstCloseBraceIndex = afterCaret.indexOf("}")

  let queryText = ""
  let endPosInText = caretPos

  if (firstCloseBraceIndex !== -1) {
    queryText =
      beforeCaret.slice(lastOpenBraceIndex + 1) +
      afterCaret.slice(0, firstCloseBraceIndex)
    endPosInText = caretPos + firstCloseBraceIndex + 1
  } else {
    queryText = beforeCaret.slice(lastOpenBraceIndex + 1)
    endPosInText = caretPos
  }

  queryText = queryText.trim()
  if (!queryText) return null

  return {
    query: queryText,
    startPos: lastOpenBraceIndex,
    endPos: endPosInText,
  }
}
