// src/myLinkHint.ts

import { getVisibleElements } from "./pure/dom"
import { showStatusTooltip } from "./pure/tooltip"
import { entriesMap } from "./pure/utils"

// 1. サイトごとに「VimiumCが無視するけどクリックしたい要素」のセレクターを定義
const SITE_TARGETS: { [key: string]: string } = {
  "wikipedia.org": "div.vector-menu-heading", // 例：ウィキペディアのサイドバーの見出し
  "sharepoint.com": "div[role='gridcell']", // 例：SharePointのファイル行
  "example.com": ".custom-clickable-div", // あなたがよく使うサイトのクラスに書き換えてください
  "dlt.kitetu.com": ".bln.I .knob.l",
}

function launchMyLinkHint() {
  // 現在のサイトに対応するターゲットがあるか確認
  const currentHost = window.location.hostname
  const selector = Object.keys(SITE_TARGETS).find(host =>
    currentHost.includes(host),
  )
  if (!selector) return

  const targetElements = document.querySelectorAll(SITE_TARGETS[selector])
  if (targetElements.length === 0) return

  // 使用するヒントキーの配列（押しやすいホームポジションのキー）
  const hintKeys = ["a", "s", "d", "f", "j", "k", "l", "g"]
  const activeHints: { key: string; element: HTMLElement }[] = []

  // 2. 画面上の対象要素にヒントラベルをインジェクション
  targetElements.forEach((el, index) => {
    if (index >= hintKeys.length) return // キーが足りなくなったら終了
    const htmlEl = el as HTMLElement
    const rect = htmlEl.getBoundingClientRect()

    // 画面外の要素はスキップ
    if (rect.top < 0 || rect.left < 0 || rect.top > window.innerHeight) return

    const key = hintKeys[index]
    activeHints.push({ key, element: htmlEl })

    // ラベル要素を作成
    const label = document.createElement("span")
    label.className = "my-ac-hint-label"
    label.innerText = key.toUpperCase()
    label.style.cssText = `
      position: fixed;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      z-index: 10000000;
      background: #f1c40f;
      color: black;
      font-weight: bold;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 3px;
      border: 1px solid #d35400;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      pointer-events: none; /* ラベル自体がクリックの邪魔をしないようにする */
    `
    document.body.appendChild(label)
  })

  // 3. キー入力を1回だけ待ち受けるリスナー
  const keyListener = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation() // 他の拡張機能（VimiumC等）にキーを渡さない

    const pressedKey = e.key.toLowerCase()
    const match = activeHints.find(h => h.key === pressedKey)

    if (match) {
      match.element.click() // ターゲットをクリック！
    }

    // ヒントラベルをすべて掃除してリスナーを解除
    document.querySelectorAll(".my-ac-hint-label").forEach(el => {
      el.remove()
    })
    window.removeEventListener("keydown", keyListener, true)
  }

  // キャプチャフェーズ（true）で最優先でキーを乗っ取る
  window.addEventListener("keydown", keyListener, true)
}

const KEYS = {
  l: "qwertasdfgzxc.b",
  r: "yuiophjkl;,mnv",
  l09: "fdsrewcxz",
  l10: "fdsrewcxzg",
  l11: "gfdsrewcxza",
  r09: "jkluiomnv",
  r10: "jkluiomnvh",
  r11: "hjkluiomnv;",
  easiest: "dkfjsleiruwoghtcm.,zvxnya;qpb",
  banned: "d   sleiruwo htcm ,zvxnya;qpb",
}

const vimiumcKeys = {
  dlt: "fgjk.",
}

const keyBlacklist = (blacklist: string) => (keySpec: keyof typeof KEYS) => {
  return KEYS[keySpec].split("").filter(c => !blacklist.includes(c))
}

const dltkeys = {
  easyL: keyBlacklist(vimiumcKeys.dlt + KEYS.r)("easiest"),
  easyR: keyBlacklist(vimiumcKeys.dlt + KEYS.l)("easiest"),
}

// ==========================================
// 1. 型定義（Interfaces）
// ==========================================

// 共通のプロパティ
interface BaseTarget extends Partial<TargetOption> {
  elements: () => NodeListOf<Element> | Element[]
  keys: string[]
}

interface TargetOption {
  hintOffsetPx: [top: number, left: number]
}

// 選択したらそこで終わる要素群
interface TerminalTarget<S> extends BaseTarget {
  type: "terminal"
  action: (el: HTMLElement, state: S) => S | void
}

// 選択したら、さらに次のヒントマップへ連鎖する要素群
interface NonTerminalTarget<S> extends BaseTarget {
  type: "non-terminal"
  action?: (el: HTMLElement, state: S) => S | void // 次の階層にいく前に状態を変えたい場合は任意で
  hintMap: (el: HTMLElement) => HintMap<S> // 次の階層のHintMapを返す関数（必須）
}

// これらを合体させたものがターゲットの型
type HintTarget<S> = TerminalTarget<S> | NonTerminalTarget<S>

// 全体を束ねるHintMap構造
interface HintMap<S> {
  showState?: (state: S) => void
  changeState?: Map<string, (state: S) => S>
  nonTerminal?: Map<string, HintMap<S>> | null
  targetElements?: HintTarget<S>[] // 複数種類の要素群を配列で同時に受け取る
}

// ==========================================
// 2. コアロジック（修正版 linkHint）
// ==========================================

function linkHint<S>(hintMap: HintMap<S>, state: S): void {
  const removeLabels = () => {
    document.querySelectorAll(".my-ac-hint-label").forEach(el => el.remove())
  }
  removeLabels()

  // 画面上のすべてのターゲット要素を一つのフラットな配列に集約する
  const activeHints: {
    key: string
    element: HTMLElement
    sourceTarget: HintTarget<S>
  }[] = []

  if (hintMap.targetElements) {
    hintMap.targetElements.forEach(t => {
      const elements = t.elements()
      elements.forEach((el, index) => {
        if (index >= t.keys.length) return // キーが足りなくなったら終了
        const htmlEl = el as HTMLElement
        const rect = htmlEl.getBoundingClientRect()

        if (rect.top < 0 || rect.left < 0 || rect.top > window.innerHeight)
          return

        const key = t.keys[index]
        // sourceTarget として、この要素がどの要素群（TerminalかNon-Terminalか）から来たかを記憶させておく
        activeHints.push({ key, element: htmlEl, sourceTarget: t })

        // ラベル作成
        const [offsetX, offsetY] = t.hintOffsetPx ?? [0, 0]

        const label = document.createElement("span")
        label.className = "my-ac-hint-label"
        label.innerText = key.toUpperCase()
        label.style.cssText = `
          position: fixed; top: ${offsetY + rect.top + window.scrollY}px; left: ${offsetX + rect.left + window.scrollX}px;
          z-index: 10000000; background: #f1c40f; color: black; font-weight: bold; font-size: 12px;
          padding: 2px 4px; border-radius: 3px; border: 1px solid #d35400; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          pointer-events: none;
        `
        document.body.appendChild(label)
      })
    })
  }

  // リスナーは常に「この階層（ターン）で唯一つだけ」登録
  const keyListener = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === "Escape") {
      cleanup()
      return
    }

    const pressedKey = e.key.toLowerCase()
    const match = activeHints.find(h => h.key === pressedKey)

    if (match) {
      cleanup() // 遷移する前に現在のリスナーとラベルを完全に解除
      const t = match.sourceTarget // 叩かれた要素のオリジナルの設定を取得

      let newState = state
      // 1. アクションがあれば実行して状態を更新
      if (t.action) {
        const res = t.action(match.element, state)
        if (res) {
          newState = res
          if (hintMap.showState) hintMap.showState(newState)
        }
      }

      // 2. 所属していたターゲットの type に応じて未来を分岐させる
      if (t.type === "terminal") {
        // terminal ならここで処理を終了（再帰しない）
        return
      } else if (t.type === "non-terminal") {
        // non-terminal なら、その要素用に定義されている次のヒントマップを生成して連鎖
        // ※ 1打鍵目のキーダウンイベントを完全にブラウザに消化させるため setTimeout で次ループへ逃がす
        setTimeout(() => {
          linkHint(t.hintMap(match.element), newState)
        }, 0)
        return
      }
    }

    // --- 省略：changeState と nonTerminal キーの判定（前回と同様） ---
    // パターン2: 状態変更（ChangeState）にマッチした場合（キーを奪うのでストップ propagation）
    const changeAction = hintMap.changeState?.get(pressedKey)
    if (changeAction) {
      e.stopImmediatePropagation()
      const newState = changeAction(state)
      if (hintMap.showState) hintMap.showState(newState)
      // 状態が変わったので、新しい状態を引き連れて「現在の階層」を再描画（リフレッシュ）
      cleanup()
      setTimeout(() => linkHint(hintMap, newState), 0)
      return
    }

    // パターン3: 文字入力による非ターミナル遷移（NonTerminalキー）
    const nextMap = hintMap.nonTerminal?.get(pressedKey)
    if (nextMap) {
      e.stopImmediatePropagation()
      cleanup()
      setTimeout(() => linkHint(nextMap, state), 0)
      return
    }
  }

  const cleanup = () => {
    removeLabels()
    window.removeEventListener("keydown", keyListener, true)
  }

  window.addEventListener("keydown", keyListener, true)
}

const dataKnoToUrl =
  (s: { fgOrBg: string }) => (oln: Element | null | undefined) => {
    if (oln) {
      const kno = oln.getAttribute("data-kno")
      if (kno) {
        return `https://dlt.kitetu.com/?${s.fgOrBg}=${kno.replace("#", "No.")}`
      }
    }
  }

const perSiteLaunch = {
  "dlt.kitetu.com": () => {
    type State = {
      openInNewTab: boolean
      fgOrBg: "fg" | "bg"
    }

    const actionWith =
      (getUrl: (el: Element, s: State) => string | null | undefined) =>
      (el: Element, s: State) => {
        const url = getUrl(el, s)
        if (!url) return

        if (s?.openInNewTab) {
          ACtl.openURL(url, {
            rightOf: "#currentTab",
          })
        } else {
          ACtl.openURL(url, "#currentTab")
        }
      }

    const hm: HintMap<State> = {
      changeState: entriesMap({
        " ": s => ({
          ...s,
          openInNewTab: !s.openInNewTab,
        }),
        enter: s => ({
          ...s,
          fgOrBg: s.fgOrBg === "bg" ? "fg" : "bg",
        }),
      }),

      showState: s => {
        console.log("現在の状態:", s)
        const message = `${s.fgOrBg === "fg" ? "後景" : "前景"}を${s.openInNewTab ? "新しい" : "現在の"}タブで開く`
        showStatusTooltip(message)
      },

      nonTerminal: null,

      targetElements: [
        {
          type: "terminal",
          keys: dltkeys.easyL,
          elements: () => {
            const pg = Array.from(document.querySelectorAll(".pg")).at(-2)
            return pg
              ? Array.from(
                  pg.querySelectorAll(":scope > .bln article.mg.oln .kno a"),
                )
              : []
          },
          action: actionWith(
            (el, s) => dataKnoToUrl(s)(el.closest("article.oln")),

            // `https://dlt.kitetu.com/?${s.fgOrBg}=${el.closest("article.oln")?.getAttribute("data-kno")}`,
          ),
          hintOffsetPx: [50, 0],
        },
        {
          type: "non-terminal",
          keys: dltkeys.easyR,
          elements: () => {
            const pgs = Array.from(document.querySelectorAll(".pg"))
            const pg = pgs.at(-2)
            return pg ? Array.from(pg.querySelectorAll(":scope > .bln")) : []
          },

          hintMap: el => {
            const queryFg = ":scope > .oln > .knob.l"
            const queryBg = ":scope > article > .bg > .oln > .knob.l"

            const action = actionWith((el, s) =>
              dataKnoToUrl(s)(el.parentElement),
            )

            return {
              changeState: entriesMap({
                " ": s => ({
                  ...s,
                  openInNewTab: !s.openInNewTab,
                }),
                enter: s => ({
                  ...s,
                  fgOrBg: s.fgOrBg === "bg" ? "fg" : "bg",
                }),
              }),

              showState: s => {
                console.log("現在の状態:", s)
                const message = `${s.fgOrBg === "fg" ? "後景" : "前景"}を${s.openInNewTab ? "新しい" : "現在の"}タブで開く`
                showStatusTooltip(message)
              },

              targetElements: [
                {
                  type: "terminal",
                  keys: dltkeys.easyL,
                  elements: () => getVisibleElements(queryFg, el),
                  action,
                  hintOffsetPx: [-10, 0],
                },
                {
                  type: "terminal",
                  keys: dltkeys.easyR,
                  elements: () => getVisibleElements(queryBg, el),
                  action,
                  hintOffsetPx: [-10, 0],
                },
              ],
            }
          },
        },
      ],
    }

    linkHint(hm, { openInNewTab: false, fgOrBg: "bg" } as State)
  },
}

function main() {
  const currentHost = window.location.hostname
  const perSiteLaunchMap: Map<string, () => void> = new Map(
    Object.entries(perSiteLaunch),
  )
  const f = perSiteLaunchMap.get(currentHost)
  if (f) f()
  // とりあえず実行（AutoControl側からこの関数を叩くイメージ）
  else launchMyLinkHint()
}

main()
