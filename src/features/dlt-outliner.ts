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

    // 選択範囲が含まれる行全体の「開始位置」と「終了位置」を取得する共通関数
    const getLineRange = () => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1
      const searchEnd = end > start && text[end - 1] === "\n" ? end - 1 : end
      const nextNewline = text.indexOf("\n", searchEnd)
      const lineEnd = nextNewline === -1 ? text.length : nextNewline
      return { lineStart, lineEnd }
    }

    // ----------------------------------------------------------------
    // 1. 行移動 (Alt + ArrowUp / ArrowDown)
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

        target.setRangeText(replacement, prevLineStart, lineEnd, "end")
        target.dispatchEvent(new Event("input", { bubbles: true }))
        target.setSelectionRange(start - shift, end - shift)
      } else if (e.key === "ArrowDown") {
        if (lineEnd === text.length) return
        const nextLineEnd = text.indexOf("\n", lineEnd + 1)
        const targetNextEnd = nextLineEnd === -1 ? text.length : nextLineEnd
        const nextLine = text.slice(lineEnd + 1, targetNextEnd)
        const replacement = nextLine + "\n" + selectedBlock
        const shift = targetNextEnd - lineEnd

        target.setRangeText(replacement, lineStart, targetNextEnd, "end")
        target.dispatchEvent(new Event("input", { bubbles: true }))
        target.setSelectionRange(start + shift, end + shift)
      }
      return
    }

    // ----------------------------------------------------------------
    // 2. 行削除 (Cmd/Ctrl + Shift + K)
    // ----------------------------------------------------------------
    if (e.altKey && e.key.toLowerCase() === "w") {
      e.preventDefault()
      const { lineStart, lineEnd } = getLineRange()

      // 改行を含めて削除する範囲を決定
      let deleteStart = lineStart
      let deleteEnd = lineEnd

      if (text[lineEnd] === "\n") {
        deleteEnd = lineEnd + 1 // 後ろの改行を巻き込んで削除
      } else if (lineStart > 0 && text[lineStart - 1] === "\n") {
        deleteStart = lineStart - 1 // 最終行の場合は前の改行を削除
      }

      target.setRangeText("", deleteStart, deleteEnd, "end")
      target.dispatchEvent(new Event("input", { bubbles: true }))
      target.setSelectionRange(deleteStart, deleteStart)
      return
    }

    // ----------------------------------------------------------------
    // 3. 箇条書きのインデント変更 (Tab / Shift + Tab)
    // ----------------------------------------------------------------
    if (e.key === "Tab") {
      const { lineStart, lineEnd } = getLineRange()
      const selectedBlock = text.slice(lineStart, lineEnd)
      const lines = selectedBlock.split("\n")

      // 行頭の空白の後に "- " または "1. " など（箇条書き）があるかチェックする正規表現
      const listRegex = /^\s*(-|\d+\.)\s/

      // 選択行の中に箇条書き行が含まれている場合のみ独自処理を実行
      const isListBlock = lines.some(line => listRegex.test(line))

      if (isListBlock) {
        e.preventDefault()

        const INDENT = "  " // インデント用文字列（半角スペース2つ）
        let startShift = 0
        let endShift = 0

        const newLines = lines.map((line, idx) => {
          let newLine = line
          let shift = 0

          if (!e.shiftKey) {
            // --- Tab: インデント追加 ---
            newLine = INDENT + line
            shift = INDENT.length
          } else {
            // --- Shift + Tab: インデント削除 ---
            if (line.startsWith(INDENT)) {
              newLine = line.slice(INDENT.length)
              shift = -INDENT.length
            } else if (line.startsWith("\t")) {
              newLine = line.slice(1)
              shift = -1
            } else if (line.startsWith(" ")) {
              newLine = line.slice(1)
              shift = -1
            }
          }

          // 選択範囲追従のためのオフセット計算
          if (idx === 0) startShift = shift
          endShift += shift

          return newLine
        })

        const replacement = newLines.join("\n")
        target.setRangeText(replacement, lineStart, lineEnd, "end")
        target.dispatchEvent(new Event("input", { bubbles: true }))

        // カーソル・選択範囲の位置を更新
        const newStart = Math.max(lineStart, start + startShift)
        const newEnd = Math.max(newStart, end + endShift)
        target.setSelectionRange(newStart, newEnd)
      }
    }
  }
}
