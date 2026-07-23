import dltCursor from "@/features/dlt-cursor"
import { dltIME } from "@/features/dlt-ime"
import { startLinkMemo } from "@/features/dlt-link-memo"
import { watchDltPage } from "@/features/dlt-mutation"

export default function runDlt() {
  dltCursor()
  startLinkMemo() // s, alt,
  watchDltPage()
  dltIME({ suggestionNumbers: 10 })
}
