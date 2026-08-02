import dltCursor from "@/features/dlt-cursor"
import { dltIME } from "@/features/dlt-ime"
import { startLinkMemo } from "@/features/dlt-link-memo"
import { watchDltPage } from "@/features/dlt-mutation"

export default function runDlt() {
  startLinkMemo({
    toggleKeys: ["l"], // Alt
    searchKeys: ["s", "/", "i"],
  })
  dltCursor()
  watchDltPage()
  dltIME({ suggestionNumbers: 10 })
}
