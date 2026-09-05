import { restoreLinks } from "./features/dlt-storage"
import { initializeCache } from "./features/ime"

const restored = restoreLinks()
console.log("restored links:", restored)

initializeCache()
