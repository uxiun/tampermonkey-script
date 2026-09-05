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
  PostLink,
  postLinkText,
  postLinkTextList,
  restoreLinks,
  searchLinks,
  useCount,
} from "./dlt-storage"
import { dltkeys } from "./keys"
import { HintMap, linkHint } from "./link-hint"
import { candidateLink } from "./dlt-component"
import { dltShortcuts } from "./dlt-shortcuts"
import outlinerShortcuts from "./dlt-outliner"
import { isImeActive } from "./dlt-ime"
import {
  backupUserAdded,
  getImeState,
  importWordsJSONArray,
  initializeCache,
  restoreUserAdded,
} from "./ime"

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

const appState: AppState = {
  history: [],
  isWidgetActive: false,
  leftDock: [],
  currentPage: 0,
  cursorIndex: 0,
  numbersOfPage: 10,
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

export async function syncRenderLinkMemo(links?: PostLink[]) {
  appState.history = links ?? (await getAllLinksFromIDB())
  renderWidget(appState)
}

interface LinkMemoOption {
  toggleKeys: string[]
  searchKeys: string[]
}

export async function startLinkMemo(option: LinkMemoOption) {
  if (option.toggleKeys.some(key => option.searchKeys.includes(key))) {
    console.log("option key は被らないようにしてください")
    return
  }
  console.log("🚀 startLinkMemo")

  // 1. 初回起動時にIDBから全件取得してメモリ(appState.history)にロード
  appState.history = await getAllLinksFromIDB()

  // 2. タブ間同期リスナーをセット（他タブで変更があったら再読み込み）
  // 💡【重要】他タブからの更新は、メモリ上でのみマージする（再保存による無限ループを遮断！）
  setupTabSyncListener(diff => {
    const m = mergeLinksFast(appState.history, diff)
    appState.history = m.links
    if (appState.isWidgetActive) renderWidget(appState)

    // IME側のインメモリキャッシュも同期するカスタムイベントを発行
    window.dispatchEvent(new CustomEvent("dlt-history-updated", { detail: m }))
  })

  // 3. 画面内からの自動収集リンクをIDBにマージ
  const scraped = await scrapeAndMergeFgBg(true, appState.history)
  appState.history = scraped.links
  appState.lastAddedCount = scraped.result.inserted.length

  renderWidget(appState)

  // 💡【重要】リロード対策：左の台（leftDock）の状態も localStorage から復元する！
  appState.leftDock = JSON.parse(localStorage.getItem(DLT_DOCK_KEY) || "[]")

  renderWidget(appState)

  if ((window as any).__dlt_memo_listener_installed__) return
  ;(window as any).__dlt_memo_listener_installed__ = true

  window.addEventListener("storage", e => {
    if (e.key === DLT_HISTORY_KEY) {
      appState.history = JSON.parse(e.newValue || "[]")
      if (appState.isWidgetActive) renderWidget(appState)
    }
    if (e.key === DLT_DOCK_KEY) {
      appState.leftDock = JSON.parse(e.newValue || "[]")
      if (appState.isWidgetActive) renderWidget(appState)
    }
  })

  // 💡【新設】同じタブ内で myLinkHint 等が台を更新した瞬間をキャッチ
  window.addEventListener("dlt-dock-updated", async (e: any) => {
    console.log("⚓ 同一タブ内での台の更新を検知:", e.detail)
    const links = e.detail as PostLink[]

    const m = await mergeLinksToIDB(links)

    const diff = m.result.inserted.length
    if (diff > 0) {
      appState.lastAddedCount = diff // 直近追加件数を更新
    }

    appState.leftDock = links

    console.log(appState.history.slice(0, 5))
    appState.history = m.links
    console.log(appState.history.slice(0, 5))

    // 直接最新のデータを受け取る
    if (appState.isWidgetActive) {
      renderWidget(appState) // 即座に描画更新！
    }
  })

  window.addEventListener("dlt-history-updated", (e: any) => {
    const res: {
      links: PostLink[]
      result: MergeLinkResult
    } = e.detail
    if (res.result.inserted.length > 0)
      appState.lastAddedCount = res.result.inserted.length
    appState.history = res.links
    if (appState.isWidgetActive) {
      renderWidget(appState) // 即座に描画更新！
    }
  })

  let isAltDown = false
  window.addEventListener("keyup", e => {
    if (e.code === "AltLeft") {
      if (isAltDown) {
        e.preventDefault()
        e.stopPropagation()
        if (appState.isWidgetActive) {
          appState.isWidgetActive = false
        } else {
          // syncLocalStorage(appState)
          syncIDB(appState)
          appState.isWidgetActive = true
          appState.isSearching = false
          appState.searchQuery = ""
          appState.currentPage = 0
          appState.cursorIndex = 0
        }
        renderWidget(appState)
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
      if (isImeActive()) return

      // 1. 修飾キーがすべて false であること
      const noModifiers = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey

      if (e.code === "AltLeft") {
        e.preventDefault()
        isAltDown = true
      } else {
        isAltDown = false
      }

      // 1. 小窓が非アクティブな時
      if (!appState.isWidgetActive) {
        const activeEl = document.activeElement
        const isInput =
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            (activeEl as HTMLElement).isContentEditable)

        if (option.toggleKeys.includes(e.key) && !isInput && noModifiers) {
          e.preventDefault()
          e.stopPropagation()
          // syncLocalStorage(state)
          syncIDB(appState)
          appState.isWidgetActive = true
          appState.isSearching = false
          appState.searchQuery = ""
          appState.currentPage = 0
          appState.cursorIndex = 0
          renderWidget(appState)
        }

        outlinerShortcuts(e)
        dltShortcuts(e)

        return
      }

      // -------------------------------------------------------------
      // 【絶対最優先】Escape キーの完全乗っ取り
      // -------------------------------------------------------------
      if (noModifiers && e.key === "Escape") {
        if (appState.isSearching) {
          e.preventDefault()
          e.stopPropagation()
          // 1段階目のEsc: 検索を終了して通常履歴モードへ
          const input = document.getElementById(
            "dlt-search-input",
          ) as HTMLInputElement
          if (input) input.blur()
          appState.isSearching = false
          appState.searchQuery = ""
          appState.searchResults = []
          appState.currentPage = 0
          appState.cursorIndex = 0
          renderWidget(appState)
        } else if (appState.isWidgetActive) {
          e.preventDefault()
          e.stopPropagation()
          // 2段階目のEsc: 小窓を閉じる
          appState.isWidgetActive = false
          renderWidget(appState)
        }
        return
      }

      // -------------------------------------------------------------
      // パターンA：右の検索欄に入力中の場合
      // -------------------------------------------------------------
      if (appState.isSearching) {
        if (e.isComposing) return

        if (!noModifiers) return

        // 現在のページに表示されている検索結果のサブセットを取得
        const currentItems = getPagedItems(appState)
        const maxPage = Math.max(
          1,
          Math.ceil(appState.searchResults.length / appState.numbersOfPage),
        )

        if (e.key === "ArrowDown") {
          e.preventDefault()
          e.stopPropagation()

          if (appState.cursorIndex < currentItems.length - 1) {
            // ページ内で下に動く
            appState.cursorIndex++
          } else {
            // ページの最末尾に達したとき
            if (appState.currentPage < maxPage - 1) {
              appState.currentPage++
              appState.cursorIndex = 0 // 次のページの先頭へ
            } else {
              appState.currentPage = 0 // 最終ページの最後なら、最初のページの最初へワープ！
              appState.cursorIndex = 0
            }
          }

          renderWidget(appState)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          e.stopPropagation()
          if (appState.cursorIndex > 0) {
            // ページ内で上に動く
            appState.cursorIndex--
          } else {
            // ページの先頭に達したとき
            if (appState.currentPage > 0) {
              appState.currentPage--
              // 前のページの最後のインデックス（10件切り出しなので、デクリメント後の要素数 - 1）
              appState.cursorIndex = getPagedItems(appState).length - 1
            } else {
              // 最初のページの最初なら、最終ページの最後へワープ！
              appState.currentPage = maxPage - 1
              appState.cursorIndex = getPagedItems(appState).length - 1
            }
          }
          renderWidget(appState)
          return
        }

        if (e.key === " " && appState.searchQuery === "") {
          e.preventDefault()
          e.stopPropagation()
          // 1段階目のEsc: 検索を終了して通常履歴モードへ
          const input = document.getElementById(
            "dlt-search-input",
          ) as HTMLInputElement
          if (input) input.blur()
          appState.isSearching = false
          appState.searchQuery = ""
          appState.searchResults = []
          appState.currentPage = 0
          appState.cursorIndex = 0

          handleSearch("", appState)
          executeLinkOperation(appState.leftDock, getAt())
          handleSearch("", appState)
          renderWidget(appState)
          return
        }
        if (e.key === "Backspace" && appState.searchQuery === "") {
          appState.leftDock = []
          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(appState.leftDock))
          handleSearch("", appState)
          renderWidget(appState)
          return
        }

        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault()
          e.stopPropagation()
          const target = currentItems[appState.cursorIndex]
          if (target) {
            const targetUpdated = useCount({ ...target, at: getAt() })
            appState.leftDock.push(targetUpdated)
            // 💡 localStorage にも保存して他タブに通知
            localStorage.setItem(
              DLT_DOCK_KEY,
              JSON.stringify(appState.leftDock),
            )

            mergeLinksToIDB([targetUpdated], appState.history).then(m => {
              appState.history = m.links
            })

            // const history = [
            //   targetUpdated,
            //   ...state.history.filter(link => link.id !== target.id),
            // ]
            // state.history = history
            // localStorage.setItem(DLT_HISTORY_KEY, JSON.stringify(history))

            appState.searchQuery = ""
            appState.currentPage = 0
            appState.cursorIndex = 0
            handleSearch("", appState)
            renderWidget(appState)

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
          e.preventDefault()
          e.stopPropagation()
          const target = currentItems[appState.cursorIndex]
          console.log(target)
          showToast(JSON.stringify(target), 2000)
          return
        }

        return
      }

      // -------------------------------------------------------------
      // パターンB：右の自動履歴欄に疑似フォーカス中の場合
      // -------------------------------------------------------------
      if (e.ctrlKey) {
        switch (e.key) {
          case "n": {
            e.preventDefault()
            e.stopPropagation()
            // backup
            const msg = await backupLinks(appState.history)
            console.log(msg)
            showToast(msg)
            break
          }
          case "o": {
            e.preventDefault()
            e.stopPropagation()
            // backup
            const msg = await backupLinks(appState.history)
            console.log(msg)
            showToast(msg)
            break
          }

          case "p": {
            e.preventDefault()
            e.stopPropagation()
            // get
            const restored = await restoreLinks(appState.history)
            console.log("restored links:", restored)
            appState.history = restored
            break
          }

          case "d": {
            e.preventDefault()
            e.stopImmediatePropagation()
            await importWordsJSONArray()
            break
          }

          case "s": {
            e.preventDefault()
            e.stopImmediatePropagation()
            await backupUserAdded()
            break
          }

          case "q": {
            e.preventDefault()
            e.stopImmediatePropagation()
            await restoreUserAdded()
            break
          }

          case "t": {
            e.preventDefault()
            e.stopImmediatePropagation()
            await initializeCache()
            const state = getImeState()
            console.log("ImeState", state)
            showToast(`IME Cache Initilized!`)
            break
          }
        }
      }

      if (!noModifiers) return

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault()
        e.stopPropagation()
        const index = Number(e.key) - 1
        console.log("index", index)
        appState.leftDock.splice(index, 1)
        renderWidget(appState)
        return
      }

      if (option.toggleKeys.includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        appState.isWidgetActive = false
        renderWidget(appState)
        return
      }

      if (option.searchKeys.includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        appState.isSearching = true
        appState.currentPage = 0
        appState.cursorIndex = 0
        handleSearch("", appState) // 全件ヒット状態にする
        renderWidget(appState)

        const input = document.getElementById(
          "dlt-search-input",
        ) as HTMLInputElement
        if (input) {
          input.focus()
        }
        return
      }

      const currentItems = getPagedItems(appState)
      const maxPage = Math.max(
        1,
        Math.ceil(appState.history.length / appState.numbersOfPage),
      )

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault()
          e.stopPropagation()

          if (appState.cursorIndex < currentItems.length - 1) {
            // ページ内で下に動く
            appState.cursorIndex++
          } else {
            // ページの最末尾に達したとき
            if (appState.currentPage < maxPage - 1) {
              appState.currentPage++
              appState.cursorIndex = 0 // 次のページの先頭へ
            } else {
              appState.currentPage = 0 // 最終ページの最後なら、最初のページの最初へワープ！
              appState.cursorIndex = 0
            }
          }
          break
        }
        case "ArrowUp": {
          e.preventDefault()
          e.stopPropagation()
          if (appState.cursorIndex > 0) {
            // ページ内で上に動く
            appState.cursorIndex--
          } else {
            // ページの先頭に達したとき
            if (appState.currentPage > 0) {
              appState.currentPage--
              // 前のページの最後のインデックス（10件切り出しなので、デクリメント後の要素数 - 1）
              appState.cursorIndex = getPagedItems(appState).length - 1
            } else {
              // 最初のページの最初なら、最終ページの最後へワープ！
              appState.currentPage = maxPage - 1
              appState.cursorIndex = getPagedItems(appState).length - 1
            }
          }
          break
        }
        case "ArrowRight": {
          e.preventDefault()
          e.stopPropagation()
          if (appState.currentPage < maxPage - 1) {
            appState.currentPage++
            appState.cursorIndex = 0
          }
          break
        }
        case "ArrowLeft": {
          e.preventDefault()
          e.stopPropagation()
          if (appState.currentPage > 0) {
            appState.currentPage--
            appState.cursorIndex = 0
          }
          break
        }
        case "Enter": {
          e.preventDefault()
          e.stopPropagation()
          const target = currentItems[appState.cursorIndex]
          if (!target) return
          if (appState.leftDock.some(l => l.id === target.id)) {
            appState.leftDock = appState.leftDock.filter(
              l => l.id !== target.id,
            )
          } else {
            appState.leftDock.unshift(target)
          }
          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(appState.leftDock))
          break
        }
        case "Backspace": {
          e.preventDefault()
          e.stopPropagation()
          appState.leftDock = []
          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(appState.leftDock))
          break
        }
        case " ": {
          e.preventDefault()
          e.stopPropagation()
          executeLinkOperation(appState.leftDock, getAt())
          break
        }
        case "Tab": {
          e.preventDefault()
          e.stopPropagation()

          const target = currentItems[appState.cursorIndex]
          console.log(target)
          showToast(JSON.stringify(target), 2000)
          break
        }

        // case "q": {
        //   overwriteBackupLinks(state.history)
        // }
      }

      renderWidget(appState)
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
    z-index: 2000;
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
      z-index: 2001;
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
          candidateLink(idToLinkMap, link, true, {
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

  // const renderLinkItem = (link: PostLink, isSelected: boolean) => {
  //   // 1. 前景（親）のタイトルを最大2〜3件抽出（IDからタイトルを逆引き）
  //   const fgTitles = (link.fg || [])
  //     .map(fgId => idToLinkMap.get(fgId)?.title || "")
  //     .filter(s => s.length > 0)
  //     .slice(0, 10)

  //   const fgBadgeHtml =
  //     fgTitles.length > 0
  //       ? `<div style="font-size: 14px; color: #89b4fa; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">
  //           ${fgTitles.join("｜")}
  //          </div>`
  //       : ""

  //   return `
  //     <div class="dlt-list-item" style="padding: 5px 8px; border-radius: 5px; margin-bottom: 4px;
  //                 background: ${isSelected ? "#313244" : "rgba(255,255,255,0.02)"};
  //                 border: 1px solid ${isSelected ? "#89b4fa" : "transparent"};
  //                 transition: background 0.1s ease;">
  //       ${fgBadgeHtml}

  //       <div style="font-size: 16px; font-weight: ${isSelected ? "bold" : "normal"};
  //                   color: ${isSelected ? "#89b4fa" : "#cdd6f4"};
  //                   white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  //                   display: flex; align-items: center; justify-content: space-between; gap: 12px">
  //         <span>${link.title}
  //           ${link.use ? `<span style="font-size: 9px; opacity: 0.6; background: #11111b; padding: 1px 4px; border-radius: 3px; color: #f9e2af;">★${link.use}</span>` : ""}
  //         </span>
  //         <span style="font-size: 10px; font-family: monospace; opacity: .5">${linkIdText(link)}</span>
  //       </div>
  //     </div>
  //   `
  // }

  // LISTペイン描画 ...
  if (listPane) {
    listPane.style.cssText = floatingDockCss
    listPane.innerHTML = getPagedItems(state)
      .map((link, i) =>
        candidateLink(idToLinkMap, link, state.cursorIndex === i, {
          wrapTitle: true,
        }),
      )
      .join("")
  }
}

async function _executeCopy(links: PostLink[]) {
  for (const link of links) {
    const s = postLinkText(link)
    await ACtl.setClipboard(s)
  }
}

function executeLinkOperation(links: PostLink[], at: string) {
  console.log("🚚 出荷実行!! リンク数:", links.length, links)

  interface State {
    executed: boolean
  }
  const hintmap: HintMap<State> = {
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
                keys: ["l", "s"],

                elements: () => {
                  const fg = el.querySelector(":scope > a.sgn_bg")
                  const bg = el.querySelector(
                    ":scope > article.mg.oln > div.bg",
                  )
                  return fg && bg ? [fg, bg] : []
                },
                action: (element, _state) => {
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

                  const timestamped = links.map(link =>
                    useCount({ ...link, at }),
                  )
                  const res = mergeLinksFast(appState.history, timestamped)
                  appState.leftDock = []

                  setTimeout(async () => {
                    console.log("after executeLinkOperation")
                    const m = await scrapeAndMergeFgBg(true, res.links)
                    appState.history = m.links
                    renderWidget(appState)
                  }, 300)

                  localStorage.setItem(
                    DLT_DOCK_KEY,
                    JSON.stringify(appState.leftDock),
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
  return linkHint(hintmap, { executed: false })
}
