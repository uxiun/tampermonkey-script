import { launchIME } from "./features/ime"
import runDlt from "./sites/dlt"

const currentHost = window.location.hostname

const hostObj: { [hostname: string]: () => void } = {
  "dlt.kitetu.com": runDlt,
}

// const m = new Map(Object.entries(hostObj))
const f = hostObj[currentHost]
if (f) f()
