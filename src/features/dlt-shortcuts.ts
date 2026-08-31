import { isInput } from "@/pure/utils"
import { getPageType } from "./dlt-dom"
import togglePublicityDrw from "./dlt-toggle-publicity"
import { showCommandPalette } from "@/commandPalette"

export async function dltShortcuts(e: KeyboardEvent) {
  if (!e.isTrusted || (window as any).__dlt_link_hint_active__) return

  if (!isInput() && e.key === "h") {
    // const pageType = getPageType()
    // if (!(pageType === "bg" || pageType === "fg")) return
    e.preventDefault()
    e.stopPropagation()
    const pageType = getPageType()
    if (pageType === "fg" || pageType === "bg") {
      const kw = document.querySelector("input#kw")
      if (kw) {
        window.location.href = `/?kw=${(kw as HTMLInputElement).value}`
      } else {
      }
    } else if (
      pageType === "home" &&
      (new URLSearchParams(window.location.search).get("kw")?.length || 0) > 0
    ) {
      // "&"状態を引き継いでホームへ
      const strk = document.querySelector("#sch_box .strk")
      if (strk?.classList.contains("on")) window.location.href = "/?kw="
      else window.location.href = "/"
    } else {
      const fixbl = document.querySelector("#fixbl")
      if (fixbl?.classList.contains("hid")) fixbl?.classList.remove("hid")
      const kw = document.querySelector("input#kw")! as HTMLInputElement
      kw.focus()
    }
    return
  }

  if ((!isInput() || e.ctrlKey) && e.key === "s") {
    e.preventDefault()
    e.stopPropagation()
    togglePublicityDrw()
    return
  }

  if (
    document.activeElement?.getAttribute("id") === "kw" &&
    (e.ctrlKey || e.metaKey) &&
    e.key === "Enter"
  ) {
    const query = (document.activeElement as HTMLInputElement).value
    window.location.href = `/?kw=${query}`
    return
  }

  if (!isInput() && e.ctrlKey && e.key === "k") {
    e.preventDefault()
    showCommandPalette()
  }
}
