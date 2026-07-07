import { dltIME } from "@/features/dlt-ime"
import { startLinkMemo } from "@/features/dlt-link-memo"
import { watchDltPage } from "@/features/dlt-mutation"

export default function runDlt() {
  startLinkMemo()
  watchDltPage()
  dltIME()
}
