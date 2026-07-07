// src/commandPalette.ts

import { getLinkMainPage, getLinkOnFgBgPage } from "./features/dlt-dom"
import {
  collectAndMergeLinks,
  DLT_HISTORY_KEY,
  getHistoryFromLocalStorage,
} from "./features/dlt-storage"

function showCommandPalette() {
  if (document.getElementById("ac-palette")) return

  const container = document.createElement("div")
  container.id = "ac-palette"
  container.style.cssText = `
    position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
    z-index: 21000000; background: #2c3e50; padding: 20px; border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 2px solid #3498db;
  `

  const input = document.createElement("input")
  input.placeholder = "コマンドを入力..."
  input.style.cssText = `
    background: #1a252f; border: 1px solid #3498db; color: white;
    padding: 6px 12px; border-radius: 4px; outline: none; width: 300px; font-family: monospace;
  `

  // 👈 ここ！keydown イベントのインターセプトを最強にする
  input.addEventListener(
    "keydown",
    e => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation() // 👈 他のすべてのリスナーへの伝播を即座に完全停止
        container.remove()
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        e.stopImmediatePropagation()
        executeCommand(input.value)
        container.remove()
      }
    },
    true,
  ) // 👈 キャプチャフェーズ(true)に設定することで、最優先でEscをフックする

  container.appendChild(input)
  document.body.appendChild(container)
  input.focus()
}

function executeCommand(val: string) {
  console.log("実行するコマンド:", val)

  switch (val) {
    case "hello":
      console.log("hello, world!")
      break

    case "g": {
      if (window.location.hostname !== "dlt.kitetu.com") return
      const params = new URLSearchParams(window.location.search)
      const links =
        params.has("fg") || params.has("bg")
          ? getLinkOnFgBgPage()()
          : getLinkMainPage()()

      console.log("links", links)
      break
    }

    case "f": {
      if (window.location.hostname !== "dlt.kitetu.com") return
      const history = getHistoryFromLocalStorage()
      const params = new URLSearchParams(window.location.search)
      const links =
        params.has("fg") || params.has("bg")
          ? getLinkOnFgBgPage()()
          : getLinkMainPage()()

      collectAndMergeLinks(links)

      window.dispatchEvent(new CustomEvent("dlt-history-updated"))
      break
    }
  }
}

console.log("AutoControl: commandPalette")
showCommandPalette()
