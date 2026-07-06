/**
 * 画面中央に一瞬だけメッセージを表示するツールチップ関数
 * @param message 表示したいテキスト
 * @param duration 表示時間（ミリ秒、デフォルトは 1.2秒）
 */
export function showStatusTooltip(message: string, duration = 1000): void {
  // 1. ツールチップ要素を作成
  const tooltip = document.createElement("div")
  tooltip.textContent = message

  // 2. スタイルを適用（CSSで綺麗に装飾）
  Object.assign(tooltip.style, {
    position: "fixed",
    top: "20px", // 画面上部（中央にしたい場合は top: '50%', transform: 'translate(-50%, -50%)'）
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647", // 他の要素の最前面に表示（最大値）
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    color: "#ffffff",
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "bold",
    fontFamily: "sans-serif",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    pointerEvents: "none", // マウスクリックを透過（裏の要素を邪魔しない）
    opacity: "0",
    transition: "opacity 0.2s ease-in-out", // フェードイン・アウトの効果
  })

  // 3. 画面（DOM）に追加
  document.body.appendChild(tooltip)

  // 4. 一瞬遅らせてフェードイン（transitionを効かせるためリフローを挟む）
  requestAnimationFrame(() => {
    tooltip.style.opacity = "1"
  })

  // 5. 指定時間後にフェードアウトしてから要素を削除
  setTimeout(() => {
    tooltip.style.opacity = "0"

    // フェードアウトの transition (0.2秒) が終わってから DOM から消去
    tooltip.addEventListener("transitionend", () => {
      tooltip.remove()
    })
  }, duration)
}
