import { DLT_HISTORY_KEY, PostLink, postLinkTextList } from "./dlt-storage"
import { dltkeys } from "./keys"
import { HintMap, linkHint } from "./link-hint"

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

let globalState: AppState = {
  history: [],
  isWidgetActive: false,
  leftDock: [],
  currentPage: 0,
  cursorIndex: 0,
  numbersOfPage: 10,
  searchQuery: "",
  searchResults: [],
  isSearching: false,
}

function syncLocalStorage(state: AppState) {
  state.history = JSON.parse(localStorage.getItem(DLT_HISTORY_KEY) || "[]")
}

export function startLinkMemo() {
  console.log("🚀 startLinkMemo")

  syncLocalStorage(globalState)
  renderWidget(globalState)

  if ((window as any).__dlt_memo_listener_installed__) return
  ;(window as any).__dlt_memo_listener_installed__ = true

  window.addEventListener("storage", e => {
    if (e.key === DLT_HISTORY_KEY) {
      globalState.history = JSON.parse(e.newValue || "[]")
      if (globalState.isWidgetActive) renderWidget(globalState)
    }
  })

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const state = globalState

      // 1. 小窓が非アクティブな時
      if (!state.isWidgetActive) {
        const activeEl = document.activeElement
        const isInput =
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            (activeEl as HTMLElement).isContentEditable)

        if ((e.key === "s" || e.key === "S") && !isInput) {
          e.preventDefault()
          e.stopPropagation()
          syncLocalStorage(state)
          state.isWidgetActive = true
          state.isSearching = false
          state.searchQuery = ""
          state.currentPage = 0
          state.cursorIndex = 0
          renderWidget(state)
        }
        return
      }

      // -------------------------------------------------------------
      // 【絶対最優先】Escape キーの完全乗っ取り
      // -------------------------------------------------------------
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()

        if (state.isSearching) {
          // 1段階目のEsc: 検索を終了して通常履歴モードへ
          const input = document.getElementById(
            "dlt-search-input",
          ) as HTMLInputElement
          if (input) input.blur()
          state.isSearching = false
          state.searchQuery = ""
          state.searchResults = []
          state.currentPage = 0
          state.cursorIndex = 0
        } else {
          // 2段階目のEsc: 小窓を閉じる
          state.isWidgetActive = false
        }
        renderWidget(state)
        return
      }

      // -------------------------------------------------------------
      // パターンA：右の検索欄に入力中の場合
      // -------------------------------------------------------------
      if (state.isSearching) {
        // 現在のページに表示されている検索結果のサブセットを取得
        const currentItems = getPagedItems(state)
        const maxPage = Math.max(
          1,
          Math.ceil(state.searchResults.length / state.numbersOfPage),
        )

        if (e.key === "ArrowDown") {
          e.preventDefault()
          state.cursorIndex = Math.min(
            state.cursorIndex + 1,
            currentItems.length - 1,
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
        if (e.key === "ArrowRight") {
          e.preventDefault() // input内でのカーソル移動を殺してページめくりに充てる
          if (state.currentPage < maxPage - 1) {
            state.currentPage++
            state.cursorIndex = 0
            renderWidget(state)
          }
          return
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          if (state.currentPage > 0) {
            state.currentPage--
            state.cursorIndex = 0
            renderWidget(state)
          }
          return
        }
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault()
          e.stopPropagation()
          const target = currentItems[state.cursorIndex]
          if (target) {
            state.leftDock.push(target)
            state.searchQuery = ""
            state.currentPage = 0
            state.cursorIndex = 0
            handleSearch("", state)
            renderWidget(state)

            const input = document.getElementById(
              "dlt-search-input",
            ) as HTMLInputElement
            if (input) {
              input.value = ""
              input.focus()
            }
          }
          return
        }

        // 通常の文字入力はブラウザ標準にパスする
        return
      }

      // -------------------------------------------------------------
      // パターンB：右の自動履歴欄に疑似フォーカス中の場合
      // -------------------------------------------------------------
      if (e.key === "/") {
        e.preventDefault()
        e.stopPropagation()
        state.isSearching = true
        state.currentPage = 0
        state.cursorIndex = 0
        handleSearch("", state) // 全件ヒット状態にする
        renderWidget(state)

        const input = document.getElementById(
          "dlt-search-input",
        ) as HTMLInputElement
        if (input) {
          input.focus()
        }
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const currentItems = getPagedItems(state)
      const maxPage = Math.max(
        1,
        Math.ceil(state.history.length / state.numbersOfPage),
      )

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
          if (state.currentPage < maxPage - 1) {
            state.currentPage++
            state.cursorIndex = 0
          }
          break
        case "ArrowLeft":
          if (state.currentPage > 0) {
            state.currentPage--
            state.cursorIndex = 0
          }
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
    true, // キャプチャフェーズ
  )
}

// 履歴と検索結果、どちらの状態でも一貫してページング処理する関数
const getPagedItems = (state: AppState) => {
  const i = state.numbersOfPage * state.currentPage
  const sourceList = state.isSearching ? state.searchResults : state.history
  return sourceList.slice(i, i + state.numbersOfPage)
}

function handleSearch(query: string, state: AppState) {
  state.searchQuery = query
  if (!query) {
    state.searchResults = [...state.history]
    return
  }
  state.searchResults = state.history.filter(p =>
    p.title.toLowerCase().includes(query.toLowerCase()),
  )
}

export function renderWidget(state: AppState) {
  let widget = document.getElementById("dlt-link-memo-widget")
  if (!widget) {
    widget = document.createElement("div")
    widget.id = "dlt-link-memo-widget"
    widget.innerHTML = `
      <div style="background: #34495e; padding: 8px; display: flex; align-items: center; gap: 8px; height: 36px; box-sizing: border-box;">
        <input id="dlt-search-input" type="text" placeholder="Type to search..."
          style="background: #1a252f; border: 1px solid #3498db; color: white; padding: 4px 8px; border-radius: 4px; flex: 1; outline: none; font-size: 13px;" />
        <span id="dlt-page-indicator" style="font-size: 11px; color: #bdc3c7; font-family: monospace;">Page: 1/1</span>
      </div>
      <div style="display: flex; flex: 1; overflow: hidden; height: calc(100% - 36px);">
        <div id="dlt-dock-pane" style="width: 40%; background: #1e272e; border-right: 1px solid #3d4e5d; padding: 8px; overflow: hidden; box-sizing: border-box;"></div>
        <div id="dlt-list-pane" style="width: 60%; padding: 8px; overflow: hidden; background: #2c3e50; box-sizing: border-box;"></div>
      </div>
    `
    document.body.appendChild(widget)

    const input = widget.querySelector("#dlt-search-input") as HTMLInputElement

    input.addEventListener("input", e => {
      const val = (e.target as HTMLInputElement).value
      state.searchQuery = val
      state.currentPage = 0 // 👈 文字が入力されたら、検索結果の1ページ目に強制リセットして溢れを防ぐ
      state.cursorIndex = 0
      handleSearch(val, state)
      renderWidget(state)
    })

    // 👈 インプット要素の「内部」で発生したEscが、ブラウザの標準挙動で消されるのを防ぐ絶対防御壁
    input.addEventListener(
      "keydown",
      e => {
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          input.blur()
          state.isSearching = false
          state.searchQuery = ""
          state.searchResults = []
          state.currentPage = 0
          state.cursorIndex = 0
          renderWidget(state)
        }
      },
      true,
    )
  }

  widget.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 20000000;
    width: 450px; height: 340px; background: #2c3e50; color: #ecf0f1;
    font-family: monospace; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    display: ${state.isWidgetActive ? "flex" : "none"}; flex-direction: column;
    overflow: hidden; border: 2px solid ${state.isSearching ? "#3498db" : "#f1c40f"};
    opacity: 0.95; box-sizing: border-box;
  `

  if (!state.isWidgetActive) return

  const inputEl = document.getElementById(
    "dlt-search-input",
  ) as HTMLInputElement
  if (inputEl && document.activeElement !== inputEl) {
    inputEl.value = state.searchQuery
  }

  // ページ情報の計算
  const sourceList = state.isSearching ? state.searchResults : state.history
  const maxPage = Math.max(
    1,
    Math.ceil(sourceList.length / state.numbersOfPage),
  )

  const pageIndicator = document.getElementById("dlt-page-indicator")
  if (pageIndicator) {
    pageIndicator.innerText = `Page: ${state.currentPage + 1}/${maxPage}`
  }

  const dockPane = document.getElementById("dlt-dock-pane")
  if (dockPane) {
    dockPane.innerHTML = `
      <div style="font-size: 11px; color: #e74c3c; font-weight: bold; margin-bottom: 6px;">[ DOCK (台) ]</div>
      ${state.leftDock.map(p => `<div style="font-size: 12px; margin-bottom: 4px; color: #2ecc71; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">⚓ {${p.title} ${p.id}}</div>`).join("")}
    `
  }

  const listPane = document.getElementById("dlt-list-pane")
  if (listPane) {
    // 👈 常にページングで切り出された10件だけを表示させる
    const rightItems = getPagedItems(state)
    listPane.innerHTML = `
      <div style="font-size: 11px; color: #f1c40f; font-weight: bold; margin-bottom: 6px;">
        ${state.isSearching ? "[ SEARCH RESULTS ]" : "[ HISTORY ]"}
      </div>
      ${rightItems
        .map((p, idx) => {
          const isSelected = idx === state.cursorIndex
          return `
          <div style="font-size: 12px; padding: 4px; border-radius: 3px; margin-bottom: 2px;
                      background: ${isSelected ? "#34495e" : "transparent"};
                      color: ${isSelected ? "#f1c40f" : "#ecf0f1"};
                      font-weight: ${isSelected ? "bold" : "normal"};
                      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${isSelected ? "➔" : "  "} {${p.title} ${p.id}}
          </div>
        `
        })
        .join("")}
    `
  }
}

function executeLinkOperation(links: PostLink[]) {
  console.log("🚚 出荷実行!! リンク数:", links.length, links)

  const hintmap: HintMap<null> = {
    targetElements: [
      {
        type: "non-terminal",
        keys: dltkeys.easy,
        elements() {
          return Array.from(document.querySelectorAll(".pg > .bln"))
        },
        hintMap(el) {
          return {
            targetElements: [
              {
                type: "terminal",
                keys: "dk".split(""),

                elements: () => {
                  const fg = el.querySelector(":scope > a.sgn_bg")
                  const bg = el.querySelector(
                    ":scope > article.mg.oln > div.bg",
                  )
                  return fg && bg ? [fg, bg] : []
                },
                action: (element, state) => {
                  let input: null | HTMLInputElement = null
                  if (element.nodeName === "A") {
                    input = el.querySelector(
                      ":scope > input.drg_in",
                    ) as HTMLInputElement
                  } else {
                    input = element.querySelector(":scope > input.drg_in")
                  }

                  if (!input) return
                  input.classList.add("shw")
                  input.value = postLinkTextList(links)
                  // 5. Enterキーのイベントを作成して送り込む
                  const enterEvent = new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                  })

                  input.dispatchEvent(enterEvent)
                },
              },
            ],
          }
        },
      },
    ],
  }

  console.log(hintmap)
  linkHint(hintmap, null)
}
