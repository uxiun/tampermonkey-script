import { showToast } from "@/pure/component"
import {
  getAllLinksFromIDB,
  mergeLinksToIDB,
  scrapeAndMergeFgBg,
  setupTabSyncListener,
} from "./dlt-db"
import {
  backupLinks,
  DLT_DOCK_KEY,
  DLT_HISTORY_KEY,
  getAt,
  getRecentLinks,
  linkIdText,
  MergeLinkResult,
  mergeLinksFast,
  overwriteBackupLinks,
  PostLink,
  postLinkText,
  postLinkTextList,
  restoreLinks,
  searchLinks,
  useCount,
} from "./dlt-storage"
import { dltkeys } from "./keys"
import { HintMap, linkHint } from "./link-hint"
import { candidateTip } from "./dlt-component"

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
  lastAddedCount: number
}

let globalState: AppState = {
  history: [],
  isWidgetActive: false,
  leftDock: [],
  currentPage: 0,
  cursorIndex: 0,
  numbersOfPage: 12,
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  lastAddedCount: 0,
}

// function syncLocalStorage(state: AppState) {
//   state.history = JSON.parse(localStorage.getItem(DLT_HISTORY_KEY) || "[]")
// }

async function syncIDB(state: AppState) {
  state.history = await getAllLinksFromIDB()
}

export async function startLinkMemo() {
  console.log("🚀 startLinkMemo")

  // 1. 初回起動時にIDBから全件取得してメモリ(globalState.history)にロード
  globalState.history = await getAllLinksFromIDB()

  // 2. タブ間同期リスナーをセット（他タブで変更があったら再読み込み）
  // 💡【重要】他タブからの更新は、メモリ上でのみマージする（再保存による無限ループを遮断！）
  setupTabSyncListener(diff => {
    const m = mergeLinksFast(globalState.history, diff)
    globalState.history = m.links
    if (globalState.isWidgetActive) renderWidget(globalState)

    // IME側のインメモリキャッシュも同期するカスタムイベントを発行
    window.dispatchEvent(new CustomEvent("dlt-history-updated", { detail: m }))
  })

  // 3. 画面内からの自動収集リンクをIDBにマージ
  const scraped = await scrapeAndMergeFgBg(true, globalState.history)
  globalState.history = scraped.links
  globalState.lastAddedCount = scraped.result.inserted.length

  renderWidget(globalState)

  // 💡【重要】リロード対策：左の台（leftDock）の状態も localStorage から復元する！
  globalState.leftDock = JSON.parse(localStorage.getItem(DLT_DOCK_KEY) || "[]")

  renderWidget(globalState)

  if ((window as any).__dlt_memo_listener_installed__) return
  ;(window as any).__dlt_memo_listener_installed__ = true

  window.addEventListener("storage", e => {
    if (e.key === DLT_HISTORY_KEY) {
      globalState.history = JSON.parse(e.newValue || "[]")
      if (globalState.isWidgetActive) renderWidget(globalState)
    }
    if (e.key === DLT_DOCK_KEY) {
      globalState.leftDock = JSON.parse(e.newValue || "[]")
      if (globalState.isWidgetActive) renderWidget(globalState)
    }
  })

  // 💡【新設】同じタブ内で myLinkHint 等が台を更新した瞬間をキャッチ
  window.addEventListener("dlt-dock-updated", async (e: any) => {
    console.log("⚓ 同一タブ内での台の更新を検知:", e.detail)
    const links = e.detail as PostLink[]

    const m = await mergeLinksToIDB(links)

    const diff = m.result.inserted.length
    if (diff > 0) {
      globalState.lastAddedCount = diff // 直近追加件数を更新
    }

    globalState.leftDock = links

    console.log(globalState.history.slice(0, 5))
    globalState.history = m.links
    console.log(globalState.history.slice(0, 5))

    // 直接最新のデータを受け取る
    if (globalState.isWidgetActive) {
      renderWidget(globalState) // 即座に描画更新！
    }
  })

  window.addEventListener("dlt-history-updated", (e: any) => {
    const res: {
      links: PostLink[]
      result: MergeLinkResult
    } = e.detail
    if (res.result.inserted.length > 0)
      globalState.lastAddedCount = res.result.inserted.length
    globalState.history = res.links
    if (globalState.isWidgetActive) {
      renderWidget(globalState) // 即座に描画更新！
    }
  })

  let isAltDown = false
  window.addEventListener("keyup", e => {
    if (e.code === "AltLeft") {
      if (isAltDown) {
        e.preventDefault()
        e.stopPropagation()
        if (globalState.isWidgetActive) {
          globalState.isWidgetActive = false
        } else {
          // syncLocalStorage(globalState)
          syncIDB(globalState)
          globalState.isWidgetActive = true
          globalState.isSearching = false
          globalState.searchQuery = ""
          globalState.currentPage = 0
          globalState.cursorIndex = 0
        }
        renderWidget(globalState)
      }
    }
  })

  window.addEventListener(
    "keydown",
    async (e: KeyboardEvent) => {
      // 💡【追加】出荷ロジック等から擬似的に発行されたプログラムイベント(isTrusted=false)は、
      // 小窓のショートカット操作と衝突するため、完全に無視してブラウザ標準（input要素）へ流す。
      if (!e.isTrusted) return

      // 【超重要】リンクヒントモード（自動リンク）が動いている間は、このメモ小窓の全ショトカを完全スルー
      if ((window as any).__dlt_link_hint_active__) return

      const state = globalState

      if (e.code === "AltLeft") {
        e.preventDefault()
        isAltDown = true
      } else {
        isAltDown = false
      }

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
          // syncLocalStorage(state)
          syncIDB(globalState)
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
        if (e.isComposing) return

        // 現在のページに表示されている検索結果のサブセットを取得
        const currentItems = getPagedItems(state)
        const maxPage = Math.max(
          1,
          Math.ceil(state.searchResults.length / state.numbersOfPage),
        )

        if (e.key === "ArrowDown") {
          e.preventDefault()

          if (state.cursorIndex < currentItems.length - 1) {
            // ページ内で下に動く
            state.cursorIndex++
          } else {
            // ページの最末尾に達したとき
            if (state.currentPage < maxPage - 1) {
              state.currentPage++
              state.cursorIndex = 0 // 次のページの先頭へ
            } else {
              state.currentPage = 0 // 最終ページの最後なら、最初のページの最初へワープ！
              state.cursorIndex = 0
            }
          }

          renderWidget(state)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          if (state.cursorIndex > 0) {
            // ページ内で上に動く
            state.cursorIndex--
          } else {
            // ページの先頭に達したとき
            if (state.currentPage > 0) {
              state.currentPage--
              // 前のページの最後のインデックス（10件切り出しなので、デクリメント後の要素数 - 1）
              state.cursorIndex = getPagedItems(state).length - 1
            } else {
              // 最初のページの最初なら、最終ページの最後へワープ！
              state.currentPage = maxPage - 1
              state.cursorIndex = getPagedItems(state).length - 1
            }
          }
          renderWidget(state)
          return
        }
        // if (e.key === "ArrowRight") {
        //   e.preventDefault() // input内でのカーソル移動を殺してページめくりに充てる
        //   if (state.currentPage < maxPage - 1) {
        //     state.currentPage++
        //     state.cursorIndex = 0
        //     renderWidget(state)
        //   }
        //   return
        // }
        // if (e.key === "ArrowLeft") {
        //   e.preventDefault()
        //   if (state.currentPage > 0) {
        //     state.currentPage--
        //     state.cursorIndex = 0
        //     renderWidget(state)
        //   }
        //   return
        // }
        if (e.key === " " && state.searchQuery === "") {
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

          handleSearch("", state)
          executeLinkOperation(state.leftDock)

          const m = await scrapeAndMergeFgBg(true, state.history)
          state.history = m.links

          renderWidget(state)
        }
        if (e.key === "Backspace" && state.searchQuery === "") {
          state.leftDock = []
          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(state.leftDock))
          handleSearch("", state)
          renderWidget(state)
        }

        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault()
          e.stopPropagation()
          const target = currentItems[state.cursorIndex]
          if (target) {
            const targetUpdated = useCount({ ...target, at: getAt() })
            state.leftDock.push(targetUpdated)
            // 💡 localStorage にも保存して他タブに通知
            localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(state.leftDock))

            mergeLinksToIDB([targetUpdated], state.history).then(m => {
              state.history = m.links
            })

            // const history = [
            //   targetUpdated,
            //   ...state.history.filter(link => link.id !== target.id),
            // ]
            // state.history = history
            // localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(history))

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

        if (e.key === "Tab") {
          await executeCopy(state.leftDock.reverse())
          state.leftDock = []
          state.isWidgetActive = false
        }

        // 通常の文字入力はブラウザ標準にパスする
        return
      }

      // -------------------------------------------------------------
      // パターンB：右の自動履歴欄に疑似フォーカス中の場合
      // -------------------------------------------------------------
      if (e.key === "/" || e.key === "d" || e.key === "l") {
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
          if (state.cursorIndex < currentItems.length - 1) {
            // ページ内で下に動く
            state.cursorIndex++
          } else {
            // ページの最末尾に達したとき
            if (state.currentPage < maxPage - 1) {
              state.currentPage++
              state.cursorIndex = 0 // 次のページの先頭へ
            } else {
              state.currentPage = 0 // 最終ページの最後なら、最初のページの最初へワープ！
              state.cursorIndex = 0
            }
          }
          break
        case "ArrowUp":
          if (state.cursorIndex > 0) {
            // ページ内で上に動く
            state.cursorIndex--
          } else {
            // ページの先頭に達したとき
            if (state.currentPage > 0) {
              state.currentPage--
              // 前のページの最後のインデックス（10件切り出しなので、デクリメント後の要素数 - 1）
              state.cursorIndex = getPagedItems(state).length - 1
            } else {
              // 最初のページの最初なら、最終ページの最後へワープ！
              state.currentPage = maxPage - 1
              state.cursorIndex = getPagedItems(state).length - 1
            }
          }
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
          if (!target) return
          if (state.leftDock.some(l => l.id === target.id)) {
            state.leftDock = state.leftDock.filter(l => l.id !== target.id)
            localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(state.leftDock))
          } else {
            const targetUpdated = useCount({ ...target, at: getAt() })
            state.leftDock.push(targetUpdated)
            // 💡 保存＆同期
            localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(state.leftDock))

            mergeLinksToIDB([targetUpdated], state.history).then(m => {
              state.history = m.links
            })

            // const history = [
            //   targetUpdated,
            //   ...state.history.filter(link => link.id !== target.id),
            // ]
            // state.history = history
            // localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(history))
          }
          break
        }
        case "Backspace":
          state.leftDock = []
          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(state.leftDock))
          break
        case " ": {
          executeLinkOperation(state.leftDock)
          state.leftDock = []
          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(state.leftDock))
          const m = await scrapeAndMergeFgBg(true, state.history)
          state.history = m.links
          break
        }
        case "Tab":
          await executeCopy(state.leftDock.reverse())
          state.leftDock = []
          state.isWidgetActive = false
          break
        case "s":
          state.isWidgetActive = false
          break
        case "b": {
          // backup
          const msg = await backupLinks(state.history)
          console.log(msg)
          showToast(msg)
          break
        }
        case "y": {
          // get
          const restored = await restoreLinks(state.history)
          console.log("restored links:", restored)
          state.history = restored
          break
        }
        // case "q": {
        //   overwriteBackupLinks(state.history)
        // }
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
  state.searchQuery = query.trim()
  if (!query) {
    state.searchResults = [...state.history]
    return
  }
  state.searchResults = searchLinks(state.searchQuery, state.history)
}

export function renderWidget(state: AppState) {
  let widget = document.getElementById("dlt-link-memo-widget")
  let floatingDock = document.getElementById("dlt-floating-dock")
  let listPane = document.getElementById("dlt-list-pane")
  if (!widget) {
    widget = document.createElement("div")
    widget.id = "dlt-link-memo-widget"

    widget.innerHTML = `
      <div>
        <div id="dlt-floating-dock"></div>
        <div id="dlt-list-pane"></div>

        <div style="border-radius: 8px; boxShadow: 0 10px 30px rgba(0,0,0,0.6); border: 1px solid ${state.isSearching ? "#89b4fa" : "#45475a"};
        background: #181825; padding: 8px; display: flex; align-items: center; gap: 8px; height: 36px; box-sizing: border-box; border-bottom: 1px solid #313244;">
          <input id="dlt-search-input" type="text" placeholder="Type to search..." autocomplete="off"
            style="background: #1e1e2e; border: 1px solid #45475a; color: #cdd6f4; padding: 4px 8px; border-radius: 4px; flex: 1; outline: none; font-size: 16px;" />
          <span id="dlt-storage-status" style="font-size: 12px; color: #a6adc8; font-family: monospace; background: #1e1e2e; padding: 2px 6px; border-radius: 4px;"></span>
          <span id="dlt-page-indicator" style="font-size: 12px; color: #a6adc8; font-family: monospace;">1/1</span>
        </div>
        <!-- <div style="display: flex; flex: 1; overflow: hidden; height: calc(100% - 36px);">
          <div id="dlt-list-pane" style="width: 100%; padding: 8px; overflow-y: auto; background: #181825; box-sizing: border-box;"></div>
        </div> -->
      </div>
    `

    document.body.appendChild(widget)

    // 💡 小窓の直上に浮遊する DOCK コンテナ
    floatingDock = widget.querySelector("#dlt-floating-dock")
    listPane = widget.querySelector("#dlt-list-pane")

    // floatingDock = document.createElement("div")
    // floatingDock.id = "dlt-floating-dock"
    // document.body.appendChild(floatingDock)

    const input = widget.querySelector("#dlt-search-input") as HTMLInputElement

    input.addEventListener("input", e => {
      const val = (e.target as HTMLInputElement).value
      state.searchQuery = val
      state.currentPage = 0 // 👈 文字が入力されたら、検索結果の1ページ目に強制リセットして溢れを防ぐ
      state.cursorIndex = 0
      handleSearch(val, state)
      renderWidget(state)
    })

    // 💡【新発想】VimiumCがEscを横取りしてフォーカスを外した瞬間（blur）を検知して、
    // 連動してシステム側も一発で [ HISTORY ] モードへ安全に押し戻す最強の裏口
    input.addEventListener("blur", () => {
      // タイムアウトを挟まないと、Enter確定時のblurと衝突して挙動がバグるのを防止
      setTimeout(() => {
        if (state.isSearching && document.activeElement !== input) {
          state.isSearching = false
          state.searchQuery = ""
          state.searchResults = []
          state.currentPage = 0
          state.cursorIndex = 0
          renderWidget(state)
        }
      }, 100)
    })
  }

  // right: 70px; width: min(90%, 430px);

  const widgetWidth = Math.min(500, document.documentElement.clientWidth * 0.8)
  const widgetRight =
    document.documentElement.clientWidth * 0.45 - widgetWidth / 2

  widget.style.cssText = `
    position: fixed; bottom: 0px;
    right: ${widgetRight}px;
    z-index: 20000000;
    width: ${widgetWidth}px;
    <!-- height: min(500px, 70vh); -->
    background: #181825; color: #cdd6f4;
    font-family: monospace;
    display: ${state.isWidgetActive ? "flex" : "none"}; flex-direction: column;
    overflow: hidden;
    opacity: 0.96; box-sizing: border-box;
  `

  // 前景IDからタイトルを即座に引けるマップを作成（パフォーマンス確保）
  const idToLinkMap = new Map(state.history.map(l => [l.id, l]))

  // 💡 浮遊 DOCK コンテナのスタイル（小窓の右上起点で上へ積み上がる）
  const floatingDockCss = `
      margin-bottom: 4px;
      <!-- position: fixed;
      right: 16px;
      bottom: min(508px, calc(50vh + 8px)); /* 小窓のすぐ上 */ -->
      width: ${widgetWidth}px;
      z-index: 20000001;
      display: flex;
      flex-wrap: wrap-reverse; /* 下から上へ折れ曲がって積み上がる */
      /* justify-content: flex-end; 右揃え（小窓の右端に整列） */
      justify-content: center;
      align-items: flex-start;
      gap: 6px;
      pointer-events: none; /* コンテナ自体はクリックを透過 */
      box-sizing: border-box;
    `

  if (floatingDock) {
    floatingDock.style.cssText = floatingDockCss

    // DOCK（台）アイテムの描画（IME風浮遊チップ）
    floatingDock.innerHTML = state.leftDock
      .map(
        link =>
          candidateTip(idToLinkMap, link, true, {
            withId: false,
            withFg: false,
            fgFontSize: "8px",
            titleFontSize: "12px",
          }),

        //     `
        //   <div style="pointer-events: auto; background: rgba(24, 24, 37, 0.88); border: 1px solid rgba(69, 71, 90, 0.6); color: #cdd6f4; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-family: monospace; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(4px); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;">
        //     ⚓ ${postLinkText(link)}
        //   </div>
        // `,
      )
      .join("")
  }

  if (!state.isWidgetActive) return

  // ==========================================
  // 💡 総件数・直近7日間の更新件数・直近追加件数のリアルタイム描画
  // ==========================================
  const storageStatus = document.getElementById("dlt-storage-status")
  if (storageStatus) {
    const total = state.isSearching ? state.searchResults : state.history

    const plusText =
      state.lastAddedCount > 0
        ? ` <span style="color: #a6e3a1; font-weight: bold;">+${state.lastAddedCount}</span>`
        : ""

    // 表示例: "1250 items (42 in 7d) +3"
    storageStatus.innerHTML = `${getRecentLinks(total, 0).length}/日 ${getRecentLinks(total, 7).length}/週 / ${total.length} ${plusText}`
  }

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
    pageIndicator.innerText = `${state.currentPage + 1}/${maxPage}`
  }

  const renderLinkItem = (link: PostLink, isSelected: boolean) => {
    // 1. 前景（親）のタイトルを最大2〜3件抽出（IDからタイトルを逆引き）
    const fgTitles = (link.fg || [])
      .map(fgId => idToLinkMap.get(fgId)?.title || "")
      .filter(s => s.length > 0)
      .slice(0, 10)

    const fgBadgeHtml =
      fgTitles.length > 0
        ? `<div style="font-size: 14px; color: #89b4fa; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">
            ${fgTitles.join("｜")}
           </div>`
        : ""

    return `
      <div class="dlt-list-item" style="padding: 5px 8px; border-radius: 5px; margin-bottom: 4px;
                  background: ${isSelected ? "#313244" : "rgba(255,255,255,0.02)"};
                  border: 1px solid ${isSelected ? "#89b4fa" : "transparent"};
                  transition: background 0.1s ease;">
        ${fgBadgeHtml}

        <div style="font-size: 16px; font-weight: ${isSelected ? "bold" : "normal"};
                    color: ${isSelected ? "#89b4fa" : "#cdd6f4"};
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    display: flex; align-items: center; justify-content: space-between; gap: 12px">
          <span>${link.title}
            ${link.use ? `<span style="font-size: 9px; opacity: 0.6; background: #11111b; padding: 1px 4px; border-radius: 3px; color: #f9e2af;">★${link.use}</span>` : ""}
          </span>
          <span style="font-size: 10px; font-family: monospace; opacity: .5">${linkIdText(link)}</span>
        </div>
      </div>
    `
  }

  // // DOCKペイン描画 ...
  // const dockPane = document.getElementById("dlt-dock-pane")
  // if (dockPane) {
  //   dockPane.innerHTML = `
  //     <div style="font-size: 10px; color: #f38ba8; font-weight: bold; margin-bottom: 6px;">[ DOCK ]</div>
  //     ${state.leftDock.map(link => `<div style="font-size: 11px; margin-bottom: 4px; color: #a6e3a1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">⚓ ${postLinkText(link)}</div>`).join("")}
  //   `
  // }

  // LISTペイン描画 ...
  if (listPane) {
    listPane.style.cssText = floatingDockCss
    listPane.innerHTML = getPagedItems(state)
      .map((link, i) =>
        candidateTip(idToLinkMap, link, state.cursorIndex === i, {
          wrapTitle: true,
        }),
      )
      .join("")

    // const rightItems = getPagedItems(state)
    // listPane.innerHTML = `
    //   <div style="font-size: 10px; color: #f9e2af; font-weight: bold; margin-bottom: 6px;">
    //     ${state.isSearching ? "[ SEARCH RESULTS ]" : "[ HISTORY ]"}
    //   </div>
    //   ${rightItems.map((link, idx) => renderLinkItem(link, idx === state.cursorIndex)).join("")}
    // `

    // 💡【コア】選択中の項目へ自動スクロール追従させて見切れを解消！
    // const selectedEl = listPane.querySelectorAll(".dlt-list-item")[
    //   state.cursorIndex
    // ] as HTMLElement
    // if (selectedEl) {
    //   selectedEl.scrollIntoView({ block: "nearest" })
    // }
  }
}

async function executeCopy(links: PostLink[]) {
  for (const link of links) {
    const s = postLinkText(link)
    await ACtl.setClipboard(s)
  }
}

function executeLinkOperation(links: PostLink[]) {
  console.log("🚚 出荷実行!! リンク数:", links.length, links)

  // 💡 リンクヒント起動の合図となるフラグを立てる
  // ;(window as any).__dlt_link_hint_active__ = true

  const hintmap: HintMap<null> = {
    targetElements: [
      {
        type: "non-terminal",
        keys: dltkeys.easy,
        elements() {
          const e = document.querySelector(".bln.hng")
          const articles = Array.from(document.querySelectorAll(".pg > .bln"))
          return e ? [e, ...articles] : articles
        },
        hintMap(el) {
          return {
            targetElements: [
              {
                type: "terminal",
                keys: ["d", "l"],

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
                  console.log("input.value =", input.value)
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
                  // ;(window as any).__dlt_link_hint_active__ = false

                  globalState.leftDock = []
                  localStorage.setItem(
                    DLT_DOCK_KEY,
                    JSON.stringify(globalState.leftDock),
                  )
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
