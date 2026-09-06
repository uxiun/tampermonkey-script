// import { launchIME } from "./features/ime"

// import { onTabLoadIME } from "./features/ime-unified"

import { onTabLoadIME } from "./features/ime-add-listener"

console.log("this is new ime.ts")
// console.log("using ime-unified.ts")
console.log("using separated ime.ts")
onTabLoadIME()
