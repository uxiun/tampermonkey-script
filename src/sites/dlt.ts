import dltCursor from "@/features/dlt-cursor"
import { dltIME } from "@/features/dlt-ime"
import { startLinkMemo } from "@/features/dlt-link-memo"
import { watchDltPage } from "@/features/dlt-mutation"
import { launchIME } from "@/features/ime"

export default function runDlt() {
  launchIME()
  dltIME({ suggestionNumbers: 10 })
  startLinkMemo({
    toggleKeys: ["l"], // Alt
    searchKeys: ["s", "/", "i"],
  })
  dltCursor()
  watchDltPage()
}
