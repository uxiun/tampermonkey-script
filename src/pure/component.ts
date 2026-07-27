export function showToast(message: string, durationMs = 2500) {
  // 1. ツールチップの要素を作成
  const toast = document.createElement("div")
  toast.textContent = message

  // 2. 左下に固定するスタイルを適用
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    left: "20px",
    backgroundColor: "rgba(50, 50, 50, 0.9)",
    color: "#ffffff",
    padding: "10px 16px",
    borderRadius: "4px",
    fontSize: "14px",
    fontFamily: "sans-serif",
    zIndex: "999999", // 他の要素の裏に隠れないように最前面へ
    opacity: "0",
    transition: "opacity 0.3s ease", // 自然に消えるフェード効果
    pointerEvents: "none", // クリックの邪魔にならないようにする
  })

  // 3. 画面に追加
  document.body.appendChild(toast)

  // 4. フェードイン
  setTimeout(() => {
    toast.style.opacity = "1"
  }, 10)

  // 5. 2秒後にフェードアウトして削除
  setTimeout(() => {
    toast.style.opacity = "0"
    // フェードアウトのCSSアニメーション（0.3秒）が終わった後に要素を消去
    setTimeout(() => toast.remove(), 300)
  }, durationMs)
}
