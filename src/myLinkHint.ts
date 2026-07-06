// src/myLinkHint.ts

import { getLinkAuto } from "./features/dlt-dom"
import { DLT_DOCK_KEY, PostLink } from "./features/dlt-storage"
import { HintMap, linkHint } from "./features/link-hint"
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
  dlt: "fgjk.m",
}

const autocontrolKeys = {
  dlt: "vts",
}

const keyBlacklist = (blacklist: string) => (keySpec: keyof typeof KEYS) => {
  return KEYS[keySpec].split("").filter(c => !blacklist.includes(c))
}

const dltkeys = {
  easyL: keyBlacklist(vimiumcKeys.dlt + autocontrolKeys.dlt + KEYS.r)(
    "easiest",
  ),
  easyR: keyBlacklist(vimiumcKeys.dlt + autocontrolKeys.dlt + KEYS.l)(
    "easiest",
  ),
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
      mode: "open" | "pick"
      openInNewTab: boolean
      fgOrBg: "fg" | "bg"
    }

    const actionWith =
      (
        getUrl: (el: Element, s: State) => string | null | undefined,
        getLinkElement: (el: Element) => Element | null | undefined,
      ) =>
      (el: Element, s: State) => {
        if (s.mode === "open") {
          const url = getUrl(el, s)
          if (!url) return

          if (s?.openInNewTab) {
            ACtl.openURL(url, {
              rightOf: "#currentTab",
            })
          } else {
            ACtl.openURL(url, "#currentTab")
          }
        } else {
          const dock: PostLink[] = JSON.parse(
            localStorage.getItem(DLT_DOCK_KEY) || "[]",
          )
          const newDock = [...getLinkAuto(getLinkElement(el)), ...dock]

          localStorage.setItem(DLT_DOCK_KEY, JSON.stringify(newDock))

          // 💡【新設】同じタブ内の全スクリプトに向けて「台が変わったぞ」と叫ぶ
          window.dispatchEvent(
            new CustomEvent("dlt-dock-updated", { detail: newDock }),
          )
        }
      }

    const hm: HintMap<State> = {
      changeState: entriesMap({
        " ": s => ({
          ...s,
          mode: s.mode === "open" ? "pick" : "open",
        }),
        backspace: s => ({
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
        const message =
          s.mode === "open"
            ? `${s.fgOrBg === "fg" ? "後景" : "前景"}を${s.openInNewTab ? "新しい" : "現在の"}タブで開く`
            : "リンク収集"

        showStatusTooltip(message)
      },

      nonTerminal: null,

      targetElements: [
        {
          type: "terminal",
          keys: dltkeys.easyL,
          elements: () =>
            getVisibleElements(".pg > .bln article.mg.oln .kno a"),
          action: actionWith(
            (el, s) => dataKnoToUrl(s)(el.closest("article.oln")),
            e => e.closest("article.oln"),
          ),
          hintOffsetPx: [50, 0],
        },
        {
          type: "non-terminal",
          keys: dltkeys.easyR,
          elements: () => getVisibleElements(".pg > .bln"),

          hintMap: el => {
            const queryFg = ":scope > .oln > .knob.l"
            const queryBg = ":scope > article > .bg > .oln > .knob.l"

            const action = actionWith(
              (el, s) => dataKnoToUrl(s)(el.parentElement),
              e => e.closest(".oln"),
            )

            return {
              changeState: entriesMap({
                " ": s => ({
                  ...s,
                  mode: s.mode === "open" ? "pick" : "open",
                }),
                backspace: s => ({
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
                const message =
                  s.mode === "open"
                    ? `${s.fgOrBg === "fg" ? "後景" : "前景"}を${s.openInNewTab ? "新しい" : "現在の"}タブで開く`
                    : "リンク収集"
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

    linkHint(hm, { mode: "pick", openInNewTab: false, fgOrBg: "bg" } as State)
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
