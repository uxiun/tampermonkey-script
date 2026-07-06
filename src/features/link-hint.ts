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
export interface HintMap<S> {
  showState?: (state: S) => void
  changeState?: Map<string, (state: S) => S>
  nonTerminal?: Map<string, HintMap<S>> | null
  targetElements?: HintTarget<S>[] // 複数種類の要素群を配列で同時に受け取る
}

// ==========================================
// 2. コアロジック（修正版 linkHint）
// ==========================================

export function linkHint<S>(hintMap: HintMap<S>, state: S): void {
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
