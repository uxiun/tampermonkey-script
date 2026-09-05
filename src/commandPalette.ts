// src/commandPalette.ts

import { deleteAllFgBg } from "./features/dlt-db"
import { getLinkMainPage, getLinkOnFgBgPage } from "./features/dlt-dom"
import {
  DLT_HISTORY_KEY,
  getHistoryFromLocalStorage,
  mergeLinksStorage,
  migrateLocalStorageToIDB,
} from "./features/dlt-storage"
import {
  getAllCodesFromIDB,
  getAllHansFromIDB,
  getHans,
  getZhCode,
  Hanzi,
  importWordsJSONArray,
  putCodesIDB,
  putHansIDB,
  putWordsIDB,
  STORE_CODE,
  zaoci,
  ZhCode,
  ZhWord,
} from "./features/ime"
// import { db } from "./features/ime-db"

export function showCommandPalette() {
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

async function executeCommand(val: string) {
  console.log("実行するコマンド:", val)

  switch (val) {
    case "cqkm": {
      const code = prompt("code")
      if (!code) return
      const zs = await getZhCode("cqkm", code)
      console.log(zs)
      break
    }
    case "get codes": {
      const codesStored = await getAllCodesFromIDB()
      console.log(codesStored)
      break
    }

    case "ime hanzi": {
      const url = prompt("json URL")
      if (!url) return
      const res = await fetch(
        new Request(
          url,
          // "https://raw.githubusercontent.com/uxiun/ime-table-convert/main/json/cqkm-cj5-21000.json",
          // "https://raw.githubusercontent.com/uxiun/ime-table-convert/main/json/Cangjie5_special_hans_custom.json",
        ),
      )
      const hans: Hanzi[] = await res.json()
      console.log("hans", hans)

      const completed = hans.map(h => ({
        ...h,
        date: new Date(),
        on: true,
        user: false,
      }))
      putHansIDB(completed)
      const hansStored = await getAllHansFromIDB()
      console.log("hansStored", hansStored)
      break
    }

    case "ime code": {
      const url = prompt("json URL")
      if (!url) return
      const res = await fetch(
        new Request(
          url,
          // "https://raw.githubusercontent.com/uxiun/ime-table-convert/main/json/zi-spells-21000.json",
          // "https://raw.githubusercontent.com/uxiun/ime-table-convert/main/json/Cangjie5_special_codes_custom.json",
        ),
      )
      const _codes: ZhCode[] = await res.json()
      const codes = _codes.map(c => ({
        ...c,
        date: new Date(),
        on: true,
        user: false,
      }))
      console.log("codes", codes)

      putCodesIDB(codes)
      const codesStored = await getAllCodesFromIDB()
      console.log("codesStored", codesStored)

      // if (codes.length > codesStored.length) {
      //   for (const stored of codesStored) {
      //     let sames = codes.filter(
      //       code =>
      //         code.zh === stored.zh &&
      //         code.code === stored.code &&
      //         code.schema === stored.schema,
      //     )
      //     if (sames.length > 1) console.log("重複", sames)
      //   }
      // }
      // console.log("重複は以上")

      break
    }

    case "ime zhwords": {
      importWordsJSONArray()
      break
    }

    case "hans": {
      const text = prompt("漢字を取得したい文字列")
      if (!text) return
      const hans = await getHans(text)
      console.log(hans)
      break
    }

    case "fgbg.delete":
      await deleteAllFgBg()
      break

    case "migrate idb": {
      const ok = confirm("LocalStorageからIndexedDBに移行しますか？")
      if (ok) migrateLocalStorageToIDB()
      break
    }
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

      mergeLinksStorage(DLT_HISTORY_KEY, links)

      window.dispatchEvent(new CustomEvent("dlt-history-updated"))
      break
    }
  }
}
