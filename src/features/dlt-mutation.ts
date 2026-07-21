import { getAllMyLinkFromPage } from "./dlt-dom"
import { DLT_HISTORY_KEY, mergeLinksStorage } from "./dlt-storage"

export function watchDltPage() {
  console.log("watching dlt.kitetu.com")

  if ((window as any).__dlt_watching__) return
  ;(window as any).__dlt_watching__ = true
  document.addEventListener(
    "keydown",
    e => {
      // IME
      if (e.isComposing) return

      // Ctrlキー（またはMacのCmdキー）とEnterキーが同時に押されたか判定
      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      const isEnter = e.key === "Enter" || e.keyCode === 13

      if (isEnter) {
        if (
          isCtrlOrCmd &&
          (document.activeElement?.matches("#drw input") ||
            document.activeElement?.matches("#drw textarea"))
        ) {
          console.log("新規投稿")
          setTimeout(() => {
            const res = mergeLinksStorage(
              DLT_HISTORY_KEY,
              getAllMyLinkFromPage(),
            )
            window.dispatchEvent(
              new CustomEvent("dlt-history-updated", { detail: res }),
            )
          }, 500)
          return
        }

        if (document.activeElement?.matches("input#kw")) {
          console.log("全知検索")
          setTimeout(() => {
            const res = mergeLinksStorage(
              DLT_HISTORY_KEY,
              getAllMyLinkFromPage(),
            )
            window.dispatchEvent(
              new CustomEvent("dlt-history-updated", { detail: res }),
            )
          }, 300)
        }
      }
    },
    true,
  ) // ←ここが重要：サイト側の処理より先に実行する

  const observer = new MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        if (
          Array.from(mutation.addedNodes).some(
            node => node instanceof HTMLElement && node.matches(".pg"),
          )
        ) {
          console.log("mutation! .pg")
          const res = mergeLinksStorage(DLT_HISTORY_KEY, getAllMyLinkFromPage())
          if (
            res.result.inserted.length > 0 ||
            res.result.moved.length > 0 ||
            res.result.updated.length > 0
          )
            window.dispatchEvent(
              new CustomEvent("dlt-history-updated", { detail: res }),
            )
        }
      }
    }
  })

  observer.observe(document.body, {
    subtree: true,
    childList: true,
  })
}

function tryMutation() {
  const states = {
    focusSearch:
      document.querySelector("#sch")?.getAttribute("class") === "foc",
    focusDrw:
      document.activeElement?.matches("#drw input.knm") ||
      document.activeElement?.matches("#drw textarea.src"),
  }

  const observer = new MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      console.log("mutation:", mutation.type, mutation)

      // 1. 新しい子要素（ノード）が追加されたか？
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        console.log("childList:")
        mutation.addedNodes.forEach(node => {
          console.log(node)
          // 要素（HTMLElement）のときだけ処理
          if (node instanceof HTMLElement) {
            // 例: 新しい投稿要素（.post-item）が含まれているか？
            if (
              node.matches(".bln.I article.mg.oln") ||
              node.querySelector(".post-item")
            ) {
              console.log("🔥 新しい投稿のタイムライン表示を検知！")
              // ここで自動処理や見た目の変更を走らせる
            }
          }
        })
      }
    }
  })

  // 監視の開始
  // observer.observe(document.body, {
  //   childList: true, // 子要素の追加・削除を監視
  //   subtree: true, // 子孫要素のすべてを深く監視
  // })

  // new MutationObserver(mutations => {
  //   for (const mutation of mutations) {
  //     if (
  //       mutation.type === "attributes" &&
  //       mutation.attributeName === "class" &&
  //       mutation.target instanceof HTMLElement &&
  //       mutation.target.getAttribute("id") === "sch"
  //     ) {
  //       if (mutation.oldValue === "foc") {
  //         console.log("全知検索欄から出た")
  //         states.focusSearch = false
  //       } else if (mutation.target.getAttribute("class") === "foc") {
  //         console.log("全知検索欄に入った")
  //         states.focusSearch = true
  //       }
  //     }
  //   }
  // }).observe(document.body, {
  //   subtree: true,
  //   attributes: true,
  //   attributeOldValue: true,
  //   attributeFilter: ["class"],
  // })

  const observerDebug = new MutationObserver((mutations: MutationRecord[]) => {
    console.log("mutation!-----------------------------")
    for (const mutation of mutations) {
      console.log(mutation)
    }
  })

  // observerDebug.observe(document.body, {
  //   subtree: true,
  //   characterData: true,
  //   characterDataOldValue: true,
  //   attributes: true,
  //   attributeOldValue: true,
  //   attributeFilter: ["class"],
  // })

  window.addEventListener(
    "keydown",
    event => {
      // debug
      if (event.key === "-") {
        console.log("states:", states)
      }

      // IME
      if (event.isComposing) return

      // Ctrlキー（またはMacのCmdキー）とEnterキーが同時に押されたか判定
      const isCtrlOrCmd = event.ctrlKey || event.metaKey
      const isEnter = event.key === "Enter" || event.keyCode === 13

      if (isCtrlOrCmd && isEnter) {
        if (document.activeElement?.matches("#drw input.knm")) {
          console.log("新規投稿")
        }
      }
    },
    { capture: true },
  ) // ←ここが重要：サイト側の処理より先に実行する

  type Post = {
    kno: string
    knm: string
    dln?: string
  }

  const rinpu = ({ kno, knm }: { kno: string; knm: string }) =>
    `{${knm} K#${kno}}`

  document.addEventListener("focusin", e => {
    const target = e.target as HTMLElement
    console.log("focusin:", target)

    let p: Post | null = null

    if (target.matches("article .kno a")) {
      const kno = target.getAttribute("href")?.slice(5)
      const knm = target
        .closest("article.oln")
        ?.querySelector(".knm")
        ?.getAttribute("data-src")
      if (kno && knm) p = { kno, knm }
    } else if (target.classList.contains(".knm")) {
      const kno = target.getAttribute("href")?.slice(10)
      const knm = target.getAttribute("data-src")
      if (kno && knm) p = { kno, knm }
    }
  })
}
