const runCommandPrompt = async () => {
  const command = prompt("command:")
  if (!command) return
  runCommand(command)
}

const runCommand = async (command: string) => {
  switch (command) {
    case "delete chunks": {
      console.log("削除を開始します...")

      // 0〜100 までの chunk を削除（十分な数を指定）
      for (let i = 0; i < 100; i++) {
        await GM_deleteValue(`words_chunk_${i}`)
      }
      // 単語数管理用のキーも削除
      await GM_deleteValue("words_chunk_count")
      await GM_deleteValue("gm_ime_words")

      console.log("削除完了。確認を行います:")
      for (let i = 0; i < 5; i++) {
        const key = `words_chunk_${i}`
        const res = await GM_getValue(key)
        console.log(`[CHECK] ${key}:`, res ?? "undefined (正常に削除済み)")
      }
      break
    }

    case "check deleted": {
      for (let i = 0; i < 10; i++) {
        const key = `words_chunk_${i}`
        const res = await GM_getValue(key)
        console.log(`[CHECK] ${key}:`, res)
      }
      break
    }

    case "delete key": {
      const text = prompt("消したい GM keyを（カンマ区切りで）")
      if (!text) return
      const keys = text.split(",").map(key => key.trim())
      console.log("消す GM keys:", keys)

      for (const key of keys) {
        await GM_deleteValue(key)
      }

      console.log("消せたか確認")
      for (const key of keys) {
        const res = await GM_getValue(key)
        console.log(`GM_getValue("${key}"):`, res ?? "undefined (削除済み)")
      }
      break
    }
  }
}

async function main() {
  if (window.location.href.includes(".google.com")) {
    await runCommand("delete chunks")
    await runCommand("check deleted")

    // console.log("commands.ts, set shortcuts")
    // if (!(window as any).__commands__) return
    // ;(window as any).__commands__ = true

    // window.addEventListener(
    //   "keydown",
    //   e => {
    //     if (e.ctrlKey && e.key === "d") {
    //       e.preventDefault()
    //       e.stopImmediatePropagation()
    //       runCommandPrompt()
    //       return
    //     }
    //   },
    //   true,
    // )
  }
}

main()
