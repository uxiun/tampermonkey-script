export default async function outlinerShortcuts(e: KeyboardEvent) {
  const activeEl = e.target
  const isInput =
    activeEl &&
    ((activeEl as HTMLElement).tagName === "INPUT" ||
      (activeEl as HTMLElement).tagName === "TEXTAREA" ||
      (activeEl as HTMLElement).isContentEditable)
  if (!isInput) return

  if (
    activeEl instanceof HTMLInputElement ||
    activeEl instanceof HTMLTextAreaElement
  ) {
    const target = activeEl
    const text = target.value
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0

    // --- Undo (Ctrl+Z) を維持したテキスト置換ヘルパー ---
    const replaceTextWithUndo = (
      insertText: string,
      selectStart: number,
      selectEnd: number,
    ) => {
      target.focus()
      target.setSelectionRange(selectStart, selectEnd)
      const success = document.execCommand("insertText", false, insertText)
      if (!success) {
        target.setRangeText(insertText, selectStart, selectEnd, "end")
        target.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }

    // 選択範囲が含まれる行全体の「開始位置」と「終了位置」を取得
    const getLineRange = () => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1
      const searchEnd = end > start && text[end - 1] === "\n" ? end - 1 : end
      const nextNewline = text.indexOf("\n", searchEnd)
      const lineEnd = nextNewline === -1 ? text.length : nextNewline
      return { lineStart, lineEnd }
    }

    // 箇条書きプレフィックスの解析用正規表現 (例: "  - ", "  12. ")
    const listRegex = /^(\s*)(?:(-)|(\d+)\.)\s/

    // ----------------------------------------------------------------
    // 1. Home / End の論理行移動（スマート Home 対応）
    // ----------------------------------------------------------------
    if (e.key === "Home" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const { lineStart } = getLineRange()
      const lineText = text.slice(lineStart)
      const match = lineText.match(listRegex)

      // 箇条書きの記号を除いたテキスト先頭位置
      const textStartPos = match ? lineStart + match[0].length : lineStart

      // トグル動作: すでにテキスト先頭にいる場合は行の絶対先頭へ、それ以外はテキスト先頭へ
      const targetPos = start === textStartPos ? lineStart : textStartPos

      if (e.shiftKey) {
        target.setSelectionRange(targetPos, end)
      } else {
        target.setSelectionRange(targetPos, targetPos)
      }
      return
    }

    if (e.key === "End" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const { lineEnd } = getLineRange()

      if (e.shiftKey) {
        target.setSelectionRange(start, lineEnd)
      } else {
        target.setSelectionRange(lineEnd, lineEnd)
      }
      return
    }

    // ----------------------------------------------------------------
    // 2. Backspace での削除・行連結処理
    // ----------------------------------------------------------------
    if (e.key === "Backspace" && start === end) {
      const { lineStart, lineEnd } = getLineRange()
      const lineText = text.slice(lineStart, lineEnd)

      const isSpaceOnly = /^\s*$/.test(lineText)
      const isPrefixOnly =
        listRegex.test(lineText) &&
        lineText.replace(listRegex, "").trim() === ""

      // A. 行が空（空白のみ）または箇条書き記号のみの場合：行自体を削除して前行の末尾へ移動
      if (isSpaceOnly || isPrefixOnly) {
        e.preventDefault()

        if (lineStart > 0) {
          const deleteStart = lineStart - 1
          const deleteEnd = lineEnd
          replaceTextWithUndo("", deleteStart, deleteEnd)
          target.setSelectionRange(deleteStart, deleteStart)
        } else {
          const deleteEnd = lineEnd < text.length ? lineEnd + 1 : lineEnd
          replaceTextWithUndo("", 0, deleteEnd)
          target.setSelectionRange(0, 0)
        }
        return
      }

      // B. 箇条書きの実質的な先頭（記号の直後、または行頭）で Backspace を押した場合：箇条書き記号を消去して前行と連結
      const match = lineText.match(listRegex)
      if (match) {
        const prefixLength = match[0].length
        const textStartPos = lineStart + prefixLength

        // カーソルが「箇条書きのテキスト開始位置」または「行頭」にある場合
        if (start === textStartPos || start === lineStart) {
          e.preventDefault()

          if (lineStart > 0) {
            // 前の行の末尾位置を取得
            const prevLineEnd = lineStart - 1
            // 箇条書き記号を除いたコンテンツテキスト
            const contentText = lineText.slice(prefixLength)

            // 「前の行の改行 + 現在行の箇条書き記号まで」を削除してテキストだけを連結
            replaceTextWithUndo(contentText, prevLineEnd, lineEnd)
            // カーソルを前行の結合地点（元々の前行の末尾）へ移動
            target.setSelectionRange(prevLineEnd, prevLineEnd)
          } else {
            // 先頭行の場合は箇条書き記号のみを削除
            const contentText = lineText.slice(prefixLength)
            replaceTextWithUndo(contentText, 0, lineEnd)
            target.setSelectionRange(0, 0)
          }
          return
        }
      }
    }

    // ----------------------------------------------------------------
    // 3. Enter での箇条書き自動追加（子項目を持つ親項目に対応）
    // ----------------------------------------------------------------
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const { lineStart, lineEnd } = getLineRange()
      const lineText = text.slice(lineStart, lineEnd)
      const match = lineText.match(listRegex)

      if (match) {
        e.preventDefault()
        const fullPrefix = match[0] // 例: "  - "
        const indent = match[1] // インデント空白
        const isBullet = !!match[2] // "-" かどうか
        const numStr = match[3] // 数字（"1" など）

        const content = lineText.slice(fullPrefix.length).trim()

        // 記号だけの状態で Enter なら箇条書き解除
        if (content === "") {
          replaceTextWithUndo("", lineStart, lineEnd)
          return
        }

        // --- 直後の行が「子項目（より深いインデント）」か判定 ---
        let hasChild = false
        let childPrefix = ""

        if (lineEnd < text.length) {
          const nextLineStart = lineEnd + 1
          const nextLineEndIdx = text.indexOf("\n", nextLineStart)
          const nextLineEnd =
            nextLineEndIdx === -1 ? text.length : nextLineEndIdx
          const nextLineText = text.slice(nextLineStart, nextLineEnd)
          const nextMatch = nextLineText.match(listRegex)

          if (nextMatch) {
            const currentIndentLen = indent.length
            const nextIndentLen = nextMatch[1].length

            // 直後の行のインデントが自分より深い場合
            if (nextIndentLen > currentIndentLen) {
              hasChild = true
              const childIndent = nextMatch[1]
              const childIsBullet = !!nextMatch[2]
              childPrefix = childIsBullet
                ? `${childIndent}- `
                : `${childIndent}1. `
            }
          }
        }

        // 挿入するプレフィックスを決定
        let nextPrefix = ""
        if (hasChild) {
          nextPrefix = childPrefix // 子項目と同じ深さ・スタイルの箇条書きを挿入
        } else if (isBullet) {
          nextPrefix = fullPrefix
        } else if (numStr) {
          const nextNum = parseInt(numStr, 10) + 1
          nextPrefix = `${indent}${nextNum}. `
        }

        replaceTextWithUndo("\n" + nextPrefix, start, end)
        return
      }
    }

    // ----------------------------------------------------------------
    // 4. 行選択 (Cmd/Ctrl + L)
    // ----------------------------------------------------------------
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault()
      const { lineStart, lineEnd } = getLineRange()
      const lineText = text.slice(lineStart, lineEnd)
      const match = lineText.match(listRegex)

      if (match) {
        const prefixLength = match[0].length
        target.setSelectionRange(lineStart + prefixLength, lineEnd)
      } else {
        target.setSelectionRange(lineStart, lineEnd)
      }
      return
    }

    // ----------------------------------------------------------------
    // 5. 行削除 (Cmd/Ctrl + Shift + K)
    // ----------------------------------------------------------------
    if (e.altKey && e.key.toLowerCase() === "w") {
      e.preventDefault()
      const { lineStart, lineEnd } = getLineRange()

      let deleteStart = lineStart
      let deleteEnd = lineEnd

      if (text[lineEnd] === "\n") {
        deleteEnd = lineEnd + 1
      } else if (lineStart > 0 && text[lineStart - 1] === "\n") {
        deleteStart = lineStart - 1
      }

      replaceTextWithUndo("", deleteStart, deleteEnd)
      return
    }

    // ----------------------------------------------------------------
    // 6. 行移動 (Alt + ArrowUp / ArrowDown)
    // ----------------------------------------------------------------
    if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      const { lineStart, lineEnd } = getLineRange()
      const selectedBlock = text.slice(lineStart, lineEnd)

      if (e.key === "ArrowUp") {
        if (lineStart === 0) return
        const prevLineStart = text.lastIndexOf("\n", lineStart - 2) + 1
        const prevLine = text.slice(prevLineStart, lineStart - 1)
        const replacement = selectedBlock + "\n" + prevLine
        const shift = lineStart - prevLineStart

        replaceTextWithUndo(replacement, prevLineStart, lineEnd)
        target.setSelectionRange(start - shift, end - shift)
      } else if (e.key === "ArrowDown") {
        if (lineEnd === text.length) return
        const nextLineEnd = text.indexOf("\n", lineEnd + 1)
        const targetNextEnd = nextLineEnd === -1 ? text.length : nextLineEnd
        const nextLine = text.slice(lineEnd + 1, targetNextEnd)
        const replacement = nextLine + "\n" + selectedBlock
        const shift = targetNextEnd - lineEnd

        replaceTextWithUndo(replacement, lineStart, targetNextEnd)
        target.setSelectionRange(start + shift, end + shift)
      }
      return
    }

    // ----------------------------------------------------------------
    // 7. インデント変更 (Tab / Shift + Tab)
    // ----------------------------------------------------------------
    if (e.key === "Tab") {
      const { lineStart, lineEnd } = getLineRange()
      const selectedBlock = text.slice(lineStart, lineEnd)
      const lines = selectedBlock.split("\n")

      const isListBlock = lines.some(line => listRegex.test(line))

      if (isListBlock) {
        e.preventDefault()
        const INDENT = "  "
        let startShift = 0
        let endShift = 0

        const newLines = lines.map((line, idx) => {
          let newLine = line
          let shift = 0

          if (!e.shiftKey) {
            newLine = INDENT + line
            shift = INDENT.length
          } else {
            if (line.startsWith(INDENT)) {
              newLine = line.slice(INDENT.length)
              shift = -INDENT.length
            } else if (line.startsWith("\t") || line.startsWith(" ")) {
              newLine = line.slice(1)
              shift = -1
            }
          }

          if (idx === 0) startShift = shift
          endShift += shift
          return newLine
        })

        const replacement = newLines.join("\n")
        replaceTextWithUndo(replacement, lineStart, lineEnd)

        const newStart = Math.max(lineStart, start + startShift)
        const newEnd = Math.max(newStart, end + endShift)
        target.setSelectionRange(newStart, newEnd)
      }
    }
  }
}
