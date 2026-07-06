// src/commandPalette.ts

function showCommandPalette() {
  // 1. 重複作成を防ぐ
  if (document.getElementById("ac-palette")) return

  // 2. オーバーレイ要素を作成
  const container = document.createElement("div")
  container.id = "ac-palette"
  container.style.cssText = `
    position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
    z-index: 999999; background: white; padding: 20px; border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  `

  // 3. 入力欄を作成
  const input = document.createElement("input")
  input.placeholder = "コマンドを入力..."

  // 4. Enterキーで処理を実行
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      executeCommand(input.value)
      container.remove() // 処理後に消去
    }
  })

  container.appendChild(input)
  document.body.appendChild(container)
  input.focus()
}

function executeCommand(val: string) {
  console.log("実行するコマンド:", val)
  // ここにACtl.setClipboard等を使ったロジックを分岐させる
}

console.log("AutoControl: commandPalette")
showCommandPalette()
