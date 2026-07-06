import watchDlt from "./sites/dlt"

const currentHost = window.location.hostname

const hostObj: { [hostname: string]: () => void } = {
  "dlt.kitetu.com": watchDlt,
}

// const m = new Map(Object.entries(hostObj))
const f = hostObj[currentHost]
if (f) f()
