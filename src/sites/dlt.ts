import dltCursor from "@/features/dlt-cursor"
import { dltIME } from "@/features/dlt-ime"
import { startLinkMemo } from "@/features/dlt-link-memo"
import { watchDltPage } from "@/features/dlt-mutation"
import { onTabLoadIME } from "@/features/ime-add-listener"

export default function runDlt() {
  dltIME({ suggestionNumbers: 10 })
  startLinkMemo({
    toggleKeys: ["l"], // Alt
    searchKeys: ["s", "/", "i"],
  })
  onTabLoadIME()
  dltCursor()
  watchDltPage()
}
