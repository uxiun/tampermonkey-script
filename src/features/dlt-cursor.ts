import { isInput } from "@/pure/utils"
import { getPageType } from "./dlt-dom"

export default function dltCursor() {
  if ((window as any).__dlt_cursor_listener_installed__) return
  ;(window as any).__dlt_cursor_listener_installed__ = true
}
