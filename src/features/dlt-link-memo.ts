import { DLT_HISTORY_KEY, PostLink } from "./dlt-storage"

// アプリケーションの全体状態
export interface AppState {
  history: PostLink[]
  isWidgetActive: boolean
  leftDock: PostLink[]
  currentPage: number
  cursorIndex: number
  numbersOfPage: number
  searchQuery: string
  searchResults: PostLink[]
  isSearching: boolean
}
// グローバルに1つだけ状態を持つ（イベントリスナーから常に最新を参照するため）
let globalState: AppState = {
  history: JSON.parse(localStorage.getItem(DLT_HISTORY_KEY) || "[]"),
  isWidgetActive: false,
  leftDock: [],
  currentPage: 0,
  cursorIndex: 0,
  numbersOfPage: 10,
  searchQuery: "",
  searchResults: [],
  isSearching: false,
}

export function startLinkMemo() {
  console.log("🚀 startLinkMemo")

  // 初期状態をロードして一度描画
  globalState.history = JSON.parse(localStorage.getItem("dlt-history") || "[]")
  renderWidget(globalState)

  // すでにリスナーが登録されている場合はスキップ（二重登録防止）
  if ((window as any).__dlt_memo_listener_installed__) return
  ;(window as any).__dlt_memo_listener_installed__ = true

  window.addEventListener("storage", e => {
    console.log("localStorage changed")
    if (e.key === DLT_HISTORY_KEY) {
      console.log(`[${DLT_HISTORY_KEY}] changed!`, e.newValue)
      globalState.history = JSON.parse(e.newValue || "[]")
    }
  })

  // 画面全体のキーイベントをハックする大元（完全に一本化）
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const state = globalState // 常に最新のオブジェクトを参照

      // 1. 小窓が非アクティブな時（ページにフォーカス中）
      if (!state.isWidgetActive) {
        const activeEl = document.activeElement
        const isInput =
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            (activeEl as HTMLElement).isContentEditable)

        // 'S' 単発の時だけ反応（Shift+S などを巻き込まないように e.key === "s" / "S" のハンドリング）
        if ((e.key === "s" || e.key === "S") && !isInput) {
          e.preventDefault()
          e.stopPropagation()
          state.isWidgetActive = true
          state.isSearching = false
          renderWidget(state)
        }
        return
      }

      // 2. 小窓がアクティブ（擬似フォーカス）な時
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        state.isWidgetActive = false
        // 検索中だった場合は input からフォーカスを外す
        if (state.isSearching) {
          ;(
            document.getElementById("dlt-search-input") as HTMLInputElement
          )?.blur()
          state.isSearching = false
        }
        renderWidget(state)
        return
      }

      // -------------------------------------------------------------
      // パターンA：右の検索欄に入力中の場合
      // -------------------------------------------------------------
      if (state.isSearching) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          state.cursorIndex = Math.min(
            state.cursorIndex + 1,
            state.searchResults.length - 1,
          )
          renderWidget(state)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          state.cursorIndex = Math.max(state.cursorIndex - 1, 0)
          renderWidget(state)
          return
        }
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault()
          e.stopPropagation()
          const target = state.searchResults[state.cursorIndex]
          if (target) {
            state.leftDock.push(target)
            // 検索欄をクリアして通常モードに戻す
            state.searchQuery = ""
            state.searchResults = []
            state.isSearching = false
            ;(
              document.getElementById("dlt-search-input") as HTMLInputElement
            ).value = ""
            ;(
              document.getElementById("dlt-search-input") as HTMLInputElement
            ).blur()
          }
          renderWidget(state)
          return
        }
        // それ以外のキーは、検索窓（input）の標準入力に任せるため return
        return
      }

      // -------------------------------------------------------------
      // パターンB：右の自動履歴欄に疑似フォーカス中の場合
      // -------------------------------------------------------------

      // 最初の一文字が文字キーで、かつ検索を開始したい場合（例: タイピングを始めたら即検索窓へ）
      // if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.altKey) {
      if (e.key === "/") {
        e.preventDefault()
        e.stopPropagation()
        state.isSearching = true
        state.cursorIndex = 0
        renderWidget(state)

        // 検索窓に本物のフォーカスを当てる
        const input = document.getElementById(
          "dlt-search-input",
        ) as HTMLInputElement
        if (input) {
          input.focus()
          // input.value = e.key // 叩いた1文字目をインプットに流し込む
          handleSearch(e.key, state)
        }
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const currentItems = getPagedHistory(state)

      switch (e.key) {
        case "ArrowDown":
          state.cursorIndex = Math.min(
            state.cursorIndex + 1,
            currentItems.length - 1,
          )
          break
        case "ArrowUp":
          state.cursorIndex = Math.max(state.cursorIndex - 1, 0)
          break
        case "ArrowRight":
          state.currentPage++
          state.cursorIndex = 0
          break
        case "ArrowLeft":
          state.currentPage = Math.max(state.currentPage - 1, 0)
          state.cursorIndex = 0
          break
        case "Enter": {
          const target = currentItems[state.cursorIndex]
          if (target) state.leftDock.push(target)
          break
        }
        case "Backspace":
          state.leftDock = []
          break
        case " ":
          executeLinkOperation(state.leftDock)
          state.leftDock = []
          state.isWidgetActive = false
          break
      }

      renderWidget(state)
    },
    true,
  )
}

const getPagedHistory = (state: AppState) => {
  const i = state.numbersOfPage * state.currentPage
  // ※インデックスの切り出しバグを修正（sliceの第二引数は未満なので -1 は不要です）
  return state.history.slice(i, i + state.numbersOfPage)
}

function handleSearch(query: string, state: AppState) {
  state.searchQuery = query
  if (!query) {
    state.searchResults = []
    return
  }
  state.searchResults = state.history.filter(p =>
    p.title.toLowerCase().includes(query),
  )
  state.cursorIndex = 0
}

export function renderWidget(state: AppState) {
  // 1. すでにウィジェットがあれば取得、なければ作成
  let widget = document.getElementById("dlt-link-memo-widget")
  if (!widget) {
    widget = document.createElement("div")
    widget.id = "dlt-link-memo-widget"
    document.body.appendChild(widget)
  }

  // 小窓全体の非表示・表示スタイルコントロール
  widget.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 20000000;
    width: 450px; height: 300px; background: #2c3e50; color: #ecf0f1;
    font-family: monospace; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    display: ${state.isWidgetActive ? "flex" : "none"}; flex-direction: column;
    overflow: hidden; border: 2px solid ${state.isSearching ? "#3498db" : "#f1c40f"};
    opacity: 0.95;
  `

  // 2. 右ペインに表示するデータ（検索中か通常モードかで切り替える）
  const rightItems = state.isSearching
    ? state.searchResults
    : getPagedHistory(state)

  // 3. 内部HTMLを動的に組み立てる（テンプレートリテラルで一気に生成）
  widget.innerHTML = `
    <div style="background: #34495e; padding: 8px; display: flex; align-items: center; gap: 8px;">
      <input id="dlt-search-input" type="text" placeholder="Type to search..." value="${state.searchQuery}"
        style="background: #1a252f; border: 1px solid #3498db; color: white; padding: 4px 8px; border-radius: 4px; flex: 1; outline: none;" />
      <span style="font-size: 11px; color: #bdc3c7;">Page: ${state.currentPage + 1}</span>
    </div>

    <div style="display: flex; flex: 1; overflow: hidden;">
      <div style="width: 40%; background: #1e272e; border-right: 1px solid #3d4e5d; padding: 8px; overflow-y: auto;">
        <div style="font-size: 11px; color: #e74c3c; font-weight: bold; margin-bottom: 4px;">[ DOCK (台) ]</div>
        ${state.leftDock.map(p => `<div style="font-size: 12px; margin-bottom: 2px; color: #2ecc71;">⚓ {${p.title} ${p.id}}</div>`).join("")}
      </div>

      <div style="width: 60%; padding: 8px; overflow-y: auto; background: #2c3e50;">
        <div style="font-size: 11px; color: #f1c40f; font-weight: bold; margin-bottom: 4px;">
          ${state.isSearching ? "[ SEARCH RESULTS ]" : "[ HISTORY ]"}
        </div>
        ${rightItems
          .map((p, idx) => {
            const isSelected = idx === state.cursorIndex
            return `
            <div style="font-size: 12px; padding: 4px; border-radius: 3px;
                        background: ${isSelected ? "#34495e" : "transparent"};
                        color: ${isSelected ? "#f1c40f" : "#ecf0f1"};
                        font-weight: ${isSelected ? "bold" : "normal"};">
              ${isSelected ? "➔" : "  "} {${p.title} ${p.id}}
            </div>
          `
          })
          .join("")}
      </div>
    </div>
  `

  // 4. インプットの入力イベントを監視する（検索キーワードのリアルタイム反映）
  const input = document.getElementById("dlt-search-input") as HTMLInputElement
  if (input) {
    input.addEventListener("input", e => {
      const val = (e.target as HTMLInputElement).value
      state.isSearching = val.length > 0
      handleSearch(val, state)
      renderWidget(state) // 入力されるたびに再描画
    })

    // 検索入力欄がクリックされたら検索モードに移行
    input.addEventListener("focus", () => {
      state.isSearching = true
      renderWidget(state)
    })
  }
}

function executeLinkOperation(links: PostLink[]) {
  console.log("🚚 出荷実行!! リンク数:", links.length, links)
  // ここで次のステップの myLinkHint などをキックする
}
