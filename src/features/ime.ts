import { isInput, mergeObjects, removePrefix, transpose } from "@/pure/utils"
import { candidateTip } from "./dlt-component"
import { getPopupPosition } from "@/pure/dom"
import { Key, KeyManager, Single } from "@/pure/key"
import { showToast, showToastAt } from "@/pure/component"
import { kana, KANA_TABLE, katakana } from "@/pure/table"
import { getSuffixes } from "./keys"

const DB_NAME = "ac_ime_db"
const DB_VERSION = 2
export const STORE_HANZI = "hanzi"
export const STORE_CODE = "zhcode"
export const STORE_WORD = "zhword"

type ZhStoreName = "hanzi" | "zhcode" | "zhword"

interface AsciiWord {
  word: string
  code: string
  lang: string
}

type CjkLang = "zh-cn" | "zh-tw" | "zh-hk" | "ja" | "ko"

export interface Hanzi {
  zh: string
  pinyins: string[]
  cj5: string[]
  cqkmForm: string | null
  cqkmInitials?: string[]
  on: boolean
  date: Date
  user: boolean
}

export const hanziInfo = (h: Hanzi): string => {
  return [
    h.zh,
    `(${h.cqkmForm})`,
    `"${h.cqkmInitials?.join("")}"`,
    h.pinyins.join(" "),
    `[${h.cj5.join(", ")}]`,
  ].join(" ")
}

export interface Cqkm {
  zh: string
  pinyins: string[]
  cj5: string[]
  cqkmForm: string
  cqkmInitial: string
}

export const toCqkm = (h: Hanzi): Cqkm | undefined => {
  if (h.cqkmForm && h.cqkmInitials?.length)
    return {
      zh: h.zh,
      cj5: h.cj5,
      cqkmForm: h.cqkmForm,
      cqkmInitial: h.cqkmInitials[0],
      pinyins: h.pinyins,
    }
}

export interface ZhCode {
  zh: string
  code: string
  schema: Schema
  nth: number
  on: boolean
  date: Date // 追加変更日時
  user: boolean
}
const CODE_KEYPATH = ["zh", "code", "schema"] as const

export interface ZhWord {
  zh: string
  code: string
  schema: Schema
  nth: number
  hans: Cqkm[]
  on: boolean
  date: Date
  user: boolean // user added or not
}

type Schema = "cj5" | "cqkm" | "cqkmxy" | "hiragana" | "katakana"

type SyncMessage<T> = { type: "updated" | "deleted"; items: T[] }

const syncChannel = new BroadcastChannel("ac_ime_channel")

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = _e => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_HANZI)) {
        const store = db.createObjectStore(STORE_HANZI, {
          keyPath: "zh",
        })
        store.createIndex("pinyins", "pinyins", {
          unique: false,
          multiEntry: true,
        })
        store.createIndex("cj5", "cj5", { unique: false, multiEntry: true })
        store.createIndex("cqkmInitials", "cqkmInitials", {
          unique: false,
          multiEntry: true,
        })
        store.createIndex("cqkmForm", "cqkmForm", { unique: false })
        store.createIndex("on", "on")
        store.createIndex("date", "date")
        store.createIndex("user", "user")
      }

      if (!db.objectStoreNames.contains(STORE_CODE)) {
        const store = db.createObjectStore(STORE_CODE, {
          keyPath: [...CODE_KEYPATH],
        })
        store.createIndex("code", "code")
        store.createIndex("schema", "schema")
        store.createIndex("nth", "nth")
        store.createIndex("on", "on")
        store.createIndex("date", "date")
        store.createIndex("user", "user")
        store.createIndex("codeNth", ["code", "nth"])
        store.createIndex("schemaCodeNth", ["schema", "code", "nth"])
        store.createIndex("zh", "zh", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORE_WORD)) {
        const store = db.createObjectStore(STORE_WORD, {
          keyPath: [...CODE_KEYPATH],
        })
        store.createIndex("code", "code")
        store.createIndex("schema", "schema")
        store.createIndex("nth", "nth")
        store.createIndex("on", "on")
        store.createIndex("date", "date")
        store.createIndex("user", "user")
        store.createIndex("codeNth", ["code", "nth"])
        store.createIndex("schemaCodeNth", ["schema", "code", "nth"])
        store.createIndex("zh", "zh", { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const getAllHansFromIDB = () => getAllFromIDB<Hanzi>(STORE_HANZI)
export const getAllCodesFromIDB = () => getAllFromIDB<ZhCode>(STORE_CODE)

async function getAllFromIDB<T>(storeName: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => {
      const items: T[] = request.result || []
      resolve(items)
    }
    request.onerror = () => reject(request.error)
  })
}

const IME_USER_ADDED_BACKUP_PATH = "<documents>/autocontrol-ime-user-added.json"
interface UserAddedBackup {
  codes: ZhCode[]
  words: ZhWord[]
  hans: Hanzi[]
}

export async function restoreUserAdded() {
  const backup: UserAddedBackup = await ACtl.getFile(
    IME_USER_ADDED_BACKUP_PATH,
    "json",
  ).catch(async _err => {
    const res = await ACtl.saveFile(
      IME_USER_ADDED_BACKUP_PATH,
      JSON.stringify({
        codes: [],
        words: [],
        hans: [],
      }),
    )

    if (res) {
      showToast(`${res}に新しく作成しました。もう一度試してください`)
      return
    } else {
      showToast(
        `初期化できませんでした。${IME_USER_ADDED_BACKUP_PATH}を作成してください`,
      )
    }
  })

  await putHansIDB(backup.hans)
  await putCodesIDB(backup.codes)
  await putWordsIDB(backup.words)

  const msg = `復元成功！ (${backup.words.length}語 ${backup.codes.length}字 ${backup.hans.length}漢字) ${IME_USER_ADDED_BACKUP_PATH}`

  showToast(msg)
}
export async function backupUserAdded() {
  const backup: UserAddedBackup = await ACtl.getFile(
    IME_USER_ADDED_BACKUP_PATH,
    "json",
  ).catch(async _err => {
    const res = await ACtl.saveFile(
      IME_USER_ADDED_BACKUP_PATH,
      JSON.stringify({
        codes: [],
        words: [],
        hans: [],
      }),
    )

    if (res) {
      showToast(`${res}に新しく作成しました。もう一度試してください`)
      return
    } else {
      showToast(
        `初期化できませんでした。${IME_USER_ADDED_BACKUP_PATH}を作成してください`,
      )
    }
  })

  const db = await openDB()

  const words = await new Promise<ZhWord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_WORD, "readonly")
    const store = tx.objectStore(STORE_WORD)
    // const user = store.index("user")
    // const req = user.getAll(IDBKeyRange.bound(true, true))

    const req: IDBRequest<ZhWord[]> = store.getAll()

    req.onsuccess = () => resolve(req.result.filter(w => w.user))
    req.onerror = () => reject(req.error)
  })

  const codes = (await getAllCodesFromIDB()).filter(w => w.user)

  const hans = (await getAllHansFromIDB()).filter(w => w.user)

  console.log({
    backup,
    hans,
    codes,
    words,
  })

  backup.codes = mergeObjects([...backup.codes, ...codes], [...CODE_KEYPATH])
  backup.words = mergeObjects([...backup.words, ...words], [...CODE_KEYPATH])
  backup.hans = mergeObjects([...backup.hans, ...hans], ["zh"])

  console.log("merged: ", backup)

  const res = await ACtl.saveFile(
    IME_USER_ADDED_BACKUP_PATH,
    JSON.stringify(backup),
  )

  const msg = res
    ? `保存成功 (${backup.words.length}語 ${backup.codes.length}字 ${backup.hans.length}漢字) ${res}`
    : `保存失敗！ ${IME_USER_ADDED_BACKUP_PATH}`

  showToast(msg)
}

export async function getZhCode(
  schema: Schema,
  searchPrefix: string,
): Promise<[ZhCode[], ZhCode[]]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CODE, "readonly")
    const store = tx.objectStore(STORE_CODE)

    const index = store.index("schemaCodeNth")
    const eq = index.getAll(
      IDBKeyRange.bound(
        [schema, searchPrefix, -Infinity],
        [schema, searchPrefix, Infinity],
      ),
    )
    eq.onsuccess = () => {
      const eqs: ZhCode[] = eq.result
      const req = index.getAll(
        IDBKeyRange.bound(
          [schema, searchPrefix, Infinity],
          [schema, searchPrefix + "\uffff", Infinity],
        ),
      )
      req.onsuccess = () => {
        const codes: ZhCode[] = req.result
        resolve([eqs.filter(c => c.on), codes.filter(c => c.on)] as [
          ZhCode[],
          ZhCode[],
        ])
      }
      req.onerror = () => reject(req.error)
    }
  })
}
export async function getZhWord(
  schema: Schema,
  searchPrefix: string,
): Promise<[ZhWord[], ZhWord[]]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORD, "readonly")
    const store = tx.objectStore(STORE_WORD)

    const index = store.index("schemaCodeNth")
    const eq = index.getAll(
      IDBKeyRange.bound(
        [schema, searchPrefix, -Infinity],
        [schema, searchPrefix, Infinity],
      ),
    )
    eq.onsuccess = () => {
      const eqs: ZhWord[] = eq.result
      const req = index.getAll(
        IDBKeyRange.bound(
          [schema, searchPrefix, Infinity],
          [schema, searchPrefix + "\uffff", Infinity],
        ),
      )
      req.onsuccess = () => {
        const codes: ZhWord[] = req.result
        resolve([eqs.filter(c => c.on), codes.filter(c => c.on)] as [
          ZhWord[],
          ZhWord[],
        ])
      }
      req.onerror = () => reject(req.error)
    }
  })
}

export async function putIDB<T>(items: T[], storeName: string): Promise<void> {
  if (items.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    const store = tx.objectStore(storeName)

    items.forEach(item => {
      store.put(item)
    })

    tx.oncomplete = () => {
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function putCodesIDB(codes: ZhCode[]): Promise<void> {
  if (codes.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CODE, "readwrite")
    const store = tx.objectStore(STORE_CODE)

    codes.forEach(code => {
      store.put(code)
    })

    tx.oncomplete = () => {
      const msg: SyncMessage<ZhCode> = {
        type: "updated",
        items: codes,
      }
      syncChannel.postMessage(msg)
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteWordsIDB(words: ZhWord[]): Promise<void> {
  if (words.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORD, "readwrite")
    const store = tx.objectStore(STORE_WORD)

    words.forEach(({ zh, code, schema }) => {
      store.delete([zh, code, schema])
    })

    tx.oncomplete = () => {
      const msg: SyncMessage<ZhCode> = {
        type: "deleted",
        items: words,
      }
      syncChannel.postMessage(msg)
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function putWordsIDB(words: ZhWord[]): Promise<void> {
  if (words.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORD, "readwrite")
    const store = tx.objectStore(STORE_WORD)

    words.forEach(code => {
      store.put(code)
    })

    tx.oncomplete = () => {
      const msg: SyncMessage<ZhWord> = {
        type: "updated",
        items: words,
      }
      syncChannel.postMessage(msg)
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function putHansIDB(hans: Hanzi[]): Promise<void> {
  if (hans.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANZI, "readwrite")
    const store = tx.objectStore(STORE_HANZI)

    hans.forEach(han => {
      store.put(han)
    })

    tx.oncomplete = () => {
      const msg: SyncMessage<Hanzi> = {
        type: "updated",
        items: hans,
      }
      syncChannel.postMessage(msg)
      resolve()
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function getHans(hans: string): Promise<Hanzi[]> {
  const db = await openDB()
  const tx = db.transaction(STORE_HANZI, "readonly")
  const store = tx.objectStore(STORE_HANZI)

  // 1. 各文字の取得処理を Promise に変換する
  const promises = hans.split("").map(h => {
    return new Promise<Hanzi | undefined>((resolve, reject) => {
      const r = store.get(h)

      r.onsuccess = () => {
        // データが存在すれば resolve、なければ undefined（またはお好みの処理）
        resolve(r.result as Hanzi)
      }

      r.onerror = () => {
        console.log(r.error)
        resolve(undefined)
      }
    })
  })

  // 2. すべての Promise が完了するのを待って結果を返す
  return Promise.all(promises).then(hs => hs.filter(h => h !== undefined))
}

// export async function getByZh(zh: string): {codes: ZhCode[] words: ZhWord[] } {
//   const db = await openDB()
//   const res : {
//     codes: ZhCode[],
//     words: ZhWord[]
//   } = {
//     codes: [],
//     words: []
//   }

//   const tx = db.transaction(STORE_CODE, "readonly")
//   const store = tx.objectStore(STORE_CODE)
//   const index = store.index("zh")
//   const r = index.getAll(zh)
//   r.onsuccess = () => { res.codes = r.result }
//   r.onerror = () =>
// }

export async function zaoci(schema: Schema, zh: string) {
  const hans = await getHans(zh)

  if (schema === "cqkm" || schema === "cqkmxy") {
    const hs = hans.map(toCqkm).filter(Boolean) as Cqkm[]
    if (hs.length === 0) return

    const w: ZhWord = {
      code: "",
      hans: hs,
      nth: 0,
      schema,
      zh,
      date: new Date(),
      on: true,
      user: true,
    }

    if (hs.length === 1) {
      w.code = hs[0].cqkmInitial + hs[0].cqkmForm
    } else if (schema === "cqkm") {
      const hans = hs.length < 5 ? hs : [...hs.slice(0, 4), hs[hs.length - 1]]
      w.code = hans.map(h => h.cqkmInitial + h.cqkmForm[0]).join("")
    } else if (schema === "cqkmxy") {
      const hans = hs.length < 5 ? hs : [...hs.slice(0, 4), hs[hs.length - 1]]
      w.code =
        hans.map(h => h.cqkmForm.slice(0, 2)).join("") +
        hans.map(h => h.cqkmInitial).join("")
    }

    if (w.code.length)
      return {
        word: w,
        hans,
      }
  }
}

export async function __zaoci(schema: Schema, zh: string) {
  const hans = await getHans(zh)

  if (schema === "cqkm") {
    const hs = hans.map(toCqkm).filter(Boolean) as Cqkm[]

    const w: ZhWord = {
      code: "",
      hans: hs,
      nth: 0,
      schema,
      zh,
      date: new Date(),
      on: true,
      user: true,
    }

    if (hs.length === 0) {
      console.log("hs.length 0")
    } else if (hs.length === 1) {
      w.code = hs[0].cqkmInitial + hs[0].cqkmForm
    } else if (hs.length === 2) {
      w.code = [
        hs.map(h => h.cqkmInitial + h.cqkmForm[0]),
        hs.map(h => h.cqkmForm[1]),
      ]
        .flat()
        .join("")

      // const xy = [
      //   hans.map(h => h.cqkmForm!.slice(0, 2)),
      //   hans.map(h => h.cqkmInitials[0]),
      // ]
      //   .flat()
      //   .join("")
    } else if (hs.length === 3) {
      w.code =
        hs[0].cqkmInitial +
        hs[0].cqkmForm[0] +
        hs[1].cqkmInitial +
        hs[2].cqkmInitial +
        hs[1].cqkmForm[1] +
        hs[2].cqkmForm[1] +
        hs[1].cqkmForm[2] +
        hs[2].cqkmForm[2]
    } else if (hs.length === 4) {
      w.code = transpose(
        hs.map(h => [h.cqkmInitial, ...h.cqkmForm.slice(0, 2)]),
      )
        .map(k => k.join(""))
        .join("")
    } else if (hs.length > 4) {
      w.code = transpose(
        [...hs.slice(0, 4), hs[hs.length - 1]].map(h => [
          h.cqkmInitial,
          ...h.cqkmForm.slice(0, 2),
        ]),
      )
        .map(k => k.join(""))
        .join("")
    }

    if (w.code.length > 0)
      return {
        word: w,
        hans,
      }
  }
}

export interface Cand {
  text: string
  code: string
  suffix?: {
    text: string
    start: number
  }
  v: CandVar
}

type CandVar = { type: "zhcode"; v: ZhCode } | { type: "zhword"; v: ZhWord }

const fromZhCode = (z: ZhCode): Cand => ({
  code: z.code,
  text: z.zh,
  v: { type: "zhcode", v: z },
})

const fromZhWord = (z: ZhWord): Cand => ({
  code: z.code,
  text: z.zh,
  v: { type: "zhword", v: z },
})

// interface ImeConfig {
//   // keys: KeyConfig
//   // schema: Record<Schema, SchemaConfig>

//   cqkmFormLayout?: CodeMapToBase
//   cqkmInitialLayout?: CodeMapToBase
// }

type CodeMapToBase = Map<string, string> // 受け取った入力 > 元のcodeに変換

interface KeyConfig {
  toggleActive: Single
  commitNthKeys: Single[]
  selectUpDownKeys: [Single, Single]
}

interface SchemaConfig {
  codeKeys: Key[]
  keys?: KeyConfig
  doublePress?: {
    codeKey: string
    intervalMsec: number
    orderSensitive: boolean
  }
  changeSchema: {
    type: "autoChangeAfter"
    autoFlip?: Schema
  }
}

const config = {
  cqkmFormLayout: new Map(
    `
      wa em rp tn     yb uy ih og
      sd dk fi gc     hv ju kj lf
      zq xr cw .e  bt ,x mo nl vs
    `
      .split(/\s+/)
      .flatMap(s => (s.length === 2 ? [s.split("") as [string, string]] : [])),
  ),
  cqkmInitialLayout: new Map(
    `
      wp eb rf tm    yy ux ij oq
      st dd fl gn    hr ju ki lo
      zk xg ch .a be ,w ms nz vc
  `
      .split(/\s+/)
      .flatMap(s => (s.length === 2 ? [s.split("") as [string, string]] : [])),
  ),
}

// const toOriginalSpell = (layout: CodeMapToBase, customed: string): string =>
//   customed
//     .split("")
//     .map(c => layout.get(c))
//     .join("")

// const toCustomedSpell = (layout: CodeMapToBase, original: string) => {
//   const m = new Map([...layout].map(([c, o]) => [o, c]))
//   return original
//     .split("")
//     .map(o => m.get(o))
//     .join("")
// }

// const toCustomedSpellCqkm = (original: string) => {
//   toCustomedSpell(config.cqkmInitialLayout, original.slice(0, 1)) +
//     toCustomedSpell(config.cqkmFormLayout, original.slice(1))
// }

// 汎用の二分探索ヘルパー関数（述語 predicate に基づき、条件を満たす最小のインデックスを返す）
function binarySearch<T>(list: T[], predicate: (item: T) => boolean): number {
  let low = 0
  let high = list.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (predicate(list[mid])) {
      high = mid
    } else {
      low = mid + 1
    }
  }
  return low
}

// ソート用の比較関数 (schema 優先 -> code 昇順 -> nth 昇順)
function compareItems<T extends { schema: Schema; code: string; nth: number }>(
  a: T,
  b: T,
): number {
  if (a.schema !== b.schema) return a.schema.localeCompare(b.schema)
  if (a.code !== b.code) return a.code.localeCompare(b.code)
  return a.nth - b.nth
}

class Cache {
  private hans: Hanzi[] = []
  private codes: ZhCode[] = []
  private words: ZhWord[] = []
  private isLoaded = false

  async init() {
    if (this.isLoaded) return
    const [hans, codes, words] = await Promise.all([
      getAllFromIDB<Hanzi>(STORE_HANZI),
      getAllFromIDB<ZhCode>(STORE_CODE),
      getAllFromIDB<ZhWord>(STORE_WORD),
    ])

    // 初期ロード時に二分探索用のソートを実施
    this.hans = hans
    this.codes = codes.sort(compareItems)
    this.words = words.sort(compareItems)
    this.isLoaded = true
  }

  // 二分探索を使って指定 prefix の開始・終了インデックスの範囲を取得
  private getPrefixRange<T extends { schema: Schema; code: string }>(
    list: T[],
    schema: Schema,
    prefix: string,
  ): T[] {
    // 範囲の開始位置：schema が一致し、かつ code >= prefix となる最初の要素
    const startIndex = binarySearch(
      list,
      item =>
        item.schema > schema || (item.schema === schema && item.code >= prefix),
    )

    // 範囲の終了位置を決めるための境界文字列（例: "a" -> "b"）
    const nextPrefix =
      prefix.slice(0, -1) +
      String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)

    const endIndex = binarySearch(
      list,
      item =>
        item.schema > schema ||
        (item.schema === schema && item.code >= nextPrefix),
    )

    return list.slice(startIndex, endIndex)
  }

  prefixSearch(schema: Schema, prefix: string): Cand[] {
    if (!prefix) return []

    // 1. 二分探索で該当する prefix のアイテム範囲だけを O(log N) で一括抽出
    const targetCodes = this.getPrefixRange(this.codes, schema, prefix)
    const targetWords = this.getPrefixRange(this.words, schema, prefix)

    const matchedCodes: ZhCode[] = []
    const prefixMatchedCodes: ZhCode[] = []
    for (const c of targetCodes) {
      if (c.code === prefix) matchedCodes.push(c)
      else matchedCodes.push(c) // 抽出範囲内なので c.code.startsWith(prefix) は確定
    }

    const matchedWords: ZhWord[] = []
    const prefixMatchedWords: ZhWord[] = []
    for (const w of targetWords) {
      if (w.code === prefix) matchedWords.push(w)
      else prefixMatchedWords.push(w)
    }

    // 完全一致 -> 前方一致の順で結合して返却
    return [
      ...matchedCodes.map(fromZhCode),
      ...matchedWords.map(fromZhWord),
      ...prefixMatchedCodes.map(fromZhCode),
      ...prefixMatchedWords.map(fromZhWord),
    ]
  }

  // データ更新時：二分探索で挿入位置を特定して配列のソート状態を維持
  async updateCode(code: ZhCode) {
    await putIDB([code], STORE_CODE)

    // 既存データのインデックスを特定
    const existingIdx = this.codes.findIndex(
      c => c.zh === code.zh && c.code === code.code && c.schema === code.schema,
    )

    if (existingIdx !== -1) {
      // 既存の要素を削除（再挿入で順序を保つため）
      this.codes.splice(existingIdx, 1)
    }

    // 二分探索で新しい挿入位置（O(log N)）を検索
    const insertIdx = binarySearch(
      this.codes,
      item => compareItems(item, code) >= 0,
    )

    this.codes.splice(insertIdx, 0, code)
  }

  async updateWord(word: ZhWord) {
    await putIDB([word], STORE_WORD)

    const existingIdx = this.words.findIndex(
      w => w.zh === word.zh && w.code === word.code && w.schema === word.schema,
    )

    if (existingIdx !== -1) {
      this.words.splice(existingIdx, 1)
    }

    const insertIdx = binarySearch(
      this.words,
      item => compareItems(item, word) >= 0,
    )

    this.words.splice(insertIdx, 0, word)
  }

  async hideCode(code: ZhCode) {
    await putIDB(
      [
        {
          ...code,
          on: false,
        },
      ],
      STORE_CODE,
    )

    const existingIdx = this.codes.findIndex(
      c => c.zh === code.zh && c.code === code.code && c.schema === code.schema,
    )

    this.codes.splice(existingIdx, 1)
  }

  async hideWord(word: ZhWord) {
    await putIDB(
      [
        {
          ...word,
          on: false,
        },
      ],
      STORE_WORD,
    )

    const existingIdx = this.words.findIndex(
      w => w.zh === word.zh && w.code === word.code && w.schema === word.schema,
    )

    this.words.splice(existingIdx, 1)
  }
}

interface ImeState {
  active: boolean
  candidates: Cand[]
  lastRemained: boolean
  cache: Cache
  selectedIndex: number
  startPos: number
  endPos: number
  schema: Schema
  buffer: string
  inputHistory: (string | Cand)[]
  schemaHistory: Schema[]
  target: null | HTMLInputElement | HTMLTextAreaElement
  selectedIndexMax: number
}

const state: ImeState = {
  active: true,
  lastRemained: true,
  schema: "cqkm",
  cache: new Cache(),
  inputHistory: [],
  buffer: "",
  candidates: [],
  endPos: 0,
  selectedIndex: 0,
  startPos: 0,
  target: null,
  schemaHistory: [],
  selectedIndexMax: 20,
}

export const getImeState = () => ({ ...state })
export const initializeCache = () => state.cache.init()

export const isImeCandidateVisible = () => state.candidates.length > 0

type InputElement = HTMLInputElement | HTMLTextAreaElement

class InlineSuggestPopup {
  private el: HTMLDivElement

  constructor() {
    this.el = document.createElement("div")
    this.el.id = "ac-inline-ime-popup"
    Object.assign(this.el.style, {
      position: "fixed",
      zIndex: "300000",
      background: "transparent",
      border: "none",
      boxShadow: "none",
      padding: "4px",
      display: "none",
      // maxWidth: "520px", // 💡 横方向に敷き詰めるための適切な最大幅
      overflowY: "auto",
      fontFamily: "monospace",
      fontSize: "13px",
    })
    document.body.appendChild(this.el)
  }

  show(
    coords: { top: number; left: number; lineHeight: number },
    selectedIndex: number,
    // _optionNumbers: number,
  ) {
    // console.log("coords", coords)
    if (state.candidates.length === 0) {
      this.hide()
      return
    }

    // 重ね順で最手前に維持するため、表示のたびに body の最末尾に移動
    if (this.el.parentElement === document.body) {
      document.body.appendChild(this.el)
    }

    // 画面全体の有効な横幅を取得（スクロールバーを含まない幅）
    const client = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }
    const maxWidth = client.width - coords.left - 16
    const maxHeight = client.height - coords.top - 16

    // 入力欄の1行分の高さ（取得できない場合はデフォルト20px）
    const lineHeight = coords.lineHeight ?? 20
    // 画面下部の残領域と上部の残領域を計算
    const spaceBelow = client.height - (coords.top + lineHeight) - 16
    const spaceAbove = coords.top - 16

    // 💡 下の領域が狭く(180px未満)、かつ上の方が広い場合は「上表示モード」に切替
    const showAbove = spaceBelow < 180 && spaceAbove > spaceBelow

    Object.assign(
      this.el.style,
      maxWidth < 200
        ? {
            right: "16px",
            maxWidth: "200px",
          }
        : {
            left: `${coords.left}px`,
            maxWidth: `${maxWidth}px`,
          },
    )

    // // 💡 Flex-wrap で横向きレンガ状に敷き詰める設定
    // Object.assign(this.el.style, {
    //   top: `${coords.top}px`,
    //   display: "flex",
    //   flexWrap: "wrap",
    //   gap: "6px",
    //   maxHeight: `${maxHeight}px`,
    //   alignItems: "flex-end",
    // })

    if (showAbove) {
      // ----------------------------------------------------
      // 【パターンA：上向き表示】（Link Memo等の最下部入力欄）
      // ----------------------------------------------------
      Object.assign(this.el.style, {
        top: "auto",

        bottom: `${client.height - coords.top + coords.lineHeight}px`, // キャレットの直上
        display: "flex",
        // flexDirection: "row-reverse", // 💡 横並び折り返し時、下から上へ積むための反転
        flexWrap: "wrap-reverse", // 💡 下から上に向かって行が積み上がる
        justifyContent: "flex-start",
        alignItems: "flex-start",
        gap: "6px",
        maxHeight: `${Math.max(100, spaceAbove)}px`,
      })
    } else {
      // ----------------------------------------------------
      // 【パターンB：下向き表示】（通常の入力欄）
      // ----------------------------------------------------
      Object.assign(this.el.style, {
        top: `${coords.top}px`,
        // bottom: "auto",
        display: "flex",
        // flexDirection: "row",
        flexWrap: "wrap",
        // justifyContent: "flex-start",
        gap: "6px",
        maxHeight: `${Math.max(20, spaceBelow)}px`,
        alignItems: "flex-end",
      })
    }

    // const bufferText = state.suffixStart
    //   ? `${state.buffer.slice(0, state.suffixStart)})${state.buffer.slice(state.suffixStart)}`
    //   : state.buffer

    this.el.innerHTML = [
      candidateTip(
        {
          code: "",
          text: state.buffer,
          v: {
            type: "zhcode",
            v: {
              code: "",
              nth: 0,
              schema: state.schema,
              zh: "",
              date: new Date(),
              on: true,
              user: true,
            },
          },
        },
        "",
        true,
      ),
      ...state.candidates.slice(0, state.selectedIndexMax).map((cand, idx) => {
        const isSelected = idx === selectedIndex
        return candidateTip(cand, state.buffer, isSelected, {
          fontSize: {
            code: "15px",
            fg: "15px",
            text: "19px",
          },
        })
      }),
    ].join("")

    // 選択中のチップへの自動スクロール追従
    const selectedEl = this.el.children[selectedIndex] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }

  hide() {
    this.el.style.display = "none"
    // document.body.removeChild(this.el)
  }
}

const inlinePopup = new InlineSuggestPopup()

export const launchIME = async () => {
  console.log("AutoControl.launchIME")
  if ((window as any).__ac_ime__) return
  ;(window as any).__ac_ime__ = true

  console.log("initial IME state", state)

  const keyManager = new KeyManager(40, committedChord => {
    if (!state.active || !state.target) return

    if (state.schema === "hiragana") {
      const k = kana(committedChord)
      if (k) {
        setText(k)
        return
      }
      if (
        committedChord.length === 1 &&
        KANA_TABLE.map(row => row[0])
          .join("")
          .includes(committedChord[0])
      ) {
        setText(committedChord[0])
      }
      return
    }

    if (state.schema === "katakana") {
      const k = katakana(committedChord)
      if (k) {
        setText(k)
        return
      }
      if (
        committedChord.length === 1 &&
        KANA_TABLE.map(row => row[0])
          .join("")
          .includes(committedChord[0])
      ) {
        setText(committedChord[0])
      }
      return
    }
  })

  const cqkmAnotherSchema = (schema: Schema): Schema | null =>
    schema === "cqkm" ? "cqkmxy" : schema === "cqkmxy" ? "cqkm" : null

  const zaociPrompt = async (n: number) => {
    const t = prompt(
      "追加したい単語またはその最後のn入力分のn",
      lastNInputText(n),
    )

    if (!t) return
    const i = parseInt(t)
    if (Number.isNaN(i)) {
      const z = await zaoci(state.schema, t)
      const infos = z ? ["", ...z.hans.map(hanziInfo)] : []
      const a = cqkmAnotherSchema(state.schema)
      let else_code = ""
      if (a && t.length > 1) {
        const w = await zaoci(a, t)
        console.log(a, w)
        if (w) else_code = w.word.code
      }
      const else_msg = else_code.length > 0 ? `(${else_code}: [${a}]) &` : ""

      const msg = [`「${t}」の綴`, ...infos, else_msg].join("\n")
      const code = prompt(msg, z?.word.code)
      if (z && code) {
        z.word.code = code
        putWordsIDB([z.word])
        if (a && else_code && code === z?.word.code) {
          putWordsIDB([
            {
              ...z.word,
              zh: z.word.zh.replaceAll(/\$space/, " "),
              schema: a,
              code: else_code,
            },
          ])
        }
      }
    } else {
      zaociPrompt(i)
    }
  }

  window.addEventListener(
    "keyup",
    e => {
      keyManager.onkeyup(e)

      if (!state.active || !isInput()) return

      // if (state.schema === "hiragana") {
      //   const k = kana(keyManager.chord)
      //   if (k) {
      //     e.preventDefault()
      //     e.stopImmediatePropagation()
      //     setText(k, state.startPos, state.endPos, "end")
      //     return
      //   }

      //   return
      // }

      // if (state.schema === "katakana") {
      //   const k = katakana(keyManager.chord)
      //   if (k) {
      //     e.preventDefault()
      //     e.stopImmediatePropagation()
      //     setText(k, state.startPos, state.endPos, "end")
      //     return
      //   }
      //   return
      // }

      if (keyManager.isModifierLRPressed.ShiftLeft) {
        if (state.candidates.length > 0) {
          const select = state.candidates[state.selectedIndex]
          if (select.v.type === "zhcode") {
            showToast("単漢字は編集できません")
            return
          }
          const code = prompt("修正綴", select.code)
          if (!code) return
          const word = select.v.v
          deleteWordsIDB([word])
          putWordsIDB([{ ...word, code }])
        } else if (state.buffer.length === 0) {
          zaociPrompt(2)
        }
      }
    },
    true,
  ) // capture phase じゃないと stopPropagation で潰されて届かない

  window.addEventListener(
    "keydown",
    async e => {
      keyManager.onkeydown(e)

      const target = e.target as InputElement

      if (!state.active) {
        if (isInput() && e.ctrlKey && e.key === "j") {
          e.preventDefault()
          e.stopImmediatePropagation()
          setState.activate()
          showToast("IME ON")
          return
        }
      }

      if (!state.active || !isInput()) return
      state.target = target
      state.startPos = target.selectionStart ?? 0
      state.endPos = target.selectionEnd ?? 0

      if (e.ctrlKey && e.key === "j") {
        e.preventDefault()
        e.stopImmediatePropagation()
        setState.diactivate()
        showToast("IME OFF")
        return
      }

      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        return
      }

      if (state.schema === "hiragana" || state.schema === "katakana") {
        if (
          KANA_TABLE.map(row => row[0])
            .join("")
            .includes(e.key)
        ) {
          e.preventDefault()
          e.stopImmediatePropagation()
          keyManager.onkeydownChord(e)
        }
      }

      if (state.schema === "hiragana") {
        if (!e.shiftKey && e.key === " ") {
          e.preventDefault()
          e.stopImmediatePropagation()
          const schema = lastZhSchema() ?? "cqkm"
          setSchema(schema)

          return
        }

        return
      }

      if (state.schema === "katakana") {
        if (e.shiftKey && e.key === " ") {
          return
        }

        if (e.key === " ") {
          e.preventDefault()
          e.stopImmediatePropagation()
          setSchema("hiragana")
        }
        return
      }

      if (e.shiftKey && e.key === " ") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const select = state.candidates[state.selectedIndex]
          if (select.v.type === "zhcode") {
            showToast("単漢字は編集できません")
            return
          }
          const code = prompt("修正綴", select.code)
          if (!code) return
          const word = select.v.v
          deleteWordsIDB([word])
          putWordsIDB([{ ...word, code }])
        } else if (state.buffer.length === 0) {
          // e.preventDefault()
          // e.stopImmediatePropagation()
          // zaociPrompt(2)
        }
        return
      }

      if (e.ctrlKey && (e.key === " " || e.key === "i")) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSchema("hiragana")
      }

      if (e.ctrlKey && e.key === "Backspace") {
        if (isAfterIMEInput(target)) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const n = lastInputText()!.length
          setText("", state.startPos - n, state.startPos)
          state.inputHistory = state.inputHistory.slice(-1)
          return
        }
        return
      }

      if (e.shiftKey && e.key === "Backspace") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const select = state.candidates[state.selectedIndex]
          const ok = confirm(
            `${select.text}: ${select.code} (${select.v.type}) を非表示にしますか？`,
          )
          if (!ok) return
          if (select.v.type === "zhcode") {
            state.cache.hideCode(select.v.v)

            // await putCodesIDB([
            //   {
            //     ...select.v.v,
            //     on: false,
            //   },
            // ])
          } else if (select.v.type === "zhword") {
            state.cache.hideWord(select.v.v)
            // await putWordsIDB([{ ...select.v.v, on: false }])
          }
          state.candidates.splice(state.selectedIndex, 1)
          renderWidget()
        }
      }

      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      // 以下は全て単打

      if (e.key === ";") {
        if (state.buffer.length === 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          zaociPrompt(2)
        } else {
          if (state.schema === "cqkm") {
            e.preventDefault()
            e.stopImmediatePropagation()
            setSchema("cqkmxy")
          } else if (state.schema === "cqkmxy") {
            e.preventDefault()
            e.stopImmediatePropagation()
            setSchema("cqkm")
          }
        }
        return
      }

      if (e.key === " ") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          commit()
          setSchema("hiragana")
        } else {
          e.preventDefault()
          e.stopImmediatePropagation()
          setSchema("hiragana")
        }
        return
      }

      if (e.key === "Enter") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          commit()
        }
        return
      }

      if (e.key === "Backspace") {
        if (state.buffer.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          state.buffer = state.buffer.slice(0, -1)
          updateCandidateRender()
        }
        return
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (e.key === "ArrowDown") {
            const i = state.selectedIndex + 1
            state.selectedIndex = i % state.selectedIndexMax
          }
          if (e.key === "ArrowUp") {
            const i = state.selectedIndex - 1
            state.selectedIndex = i % state.selectedIndexMax
          }
          renderWidget()
        }
        return
      }

      if (e.key === "Tab") {
        if (state.buffer.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setState.resetBuffer()
        }
        return
      }
      if (e.key === "Escape" && state.buffer.length > 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setState.resetBuffer()
        return
      }

      if (state.schema === "cqkm" || state.schema === "cqkmxy") {
        const isCodeRange = /[a-z.,]/.test(e.key)
        if (state.buffer.length === 0) {
          if (e.key === "q") {
            e.preventDefault()
            e.stopImmediatePropagation()
            setSchema("katakana")
          } else if (e.key === "p") {
            e.preventDefault()
            e.stopImmediatePropagation()
            setText(" ")
          } else if (isCodeRange) {
            e.preventDefault()
            e.stopImmediatePropagation()
            state.buffer += e.key
            updateCandidateRender()
          }
        } else {
          if (e.key === "q") {
            e.preventDefault()
            e.stopImmediatePropagation()
            commit()
            setText("。")
          } else if (e.key === "p") {
            e.preventDefault()
            e.stopImmediatePropagation()
            commit()
            setText("，")
          } else if (isCodeRange) {
            e.preventDefault()
            e.stopImmediatePropagation()
            state.buffer += e.key
            updateCandidateRender()
          }
        }
        return
      } else if (/[a-z]/.test(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        state.buffer += e.key
        updateCandidateRender()
        return
      }
    },
    true,
  )
}

function renderWidget() {
  if (!state.active || !state.target) {
    inlinePopup.hide()
    return
  }
  const coords = getPopupPosition(
    state.target,
    state.startPos,
    "__ac_ime__mirror",
  )
  inlinePopup.show(coords, state.selectedIndex)
}

function commit() {
  if (!state.active || !state.target) return
  const cand = state.candidates[state.selectedIndex]
  const coords = getPopupPosition(
    state.target,
    state.startPos,
    "__ac_ime__mirror",
  )

  setText(cand.text)

  state.inputHistory = [...state.inputHistory, cand]

  if (state.selectedIndex > 0) {
    const i = state.candidates.findIndex(c => c.code === cand.code)
    const j = state.candidates.findLastIndex(c => c.code === cand.code)
    if (i < state.selectedIndex) {
      const cands: Cand[] = state.candidates
        .slice(i, Math.max(state.selectedIndex, j) + 1)
        .map((c, i) => {
          const nth = c.text === cand.text ? 0 : i + 1
          c.v.v.nth = nth
          return c
        })

      for (const c of cands) {
        if (c.v.type === "zhcode") {
          state.cache.updateCode(c.v.v)
          // putCodesIDB([c.v.v])
        } else if (c.v.type === "zhword") {
          state.cache.updateWord(c.v.v)
          // putWordsIDB([c.v.v])
        }
      }
    }
  }

  setState.resetBuffer()

  if (
    state.schema === "cj5" ||
    state.schema === "cqkm" ||
    state.schema === "cqkmxy"
  ) {
    const hans = getHans(cand.text)
    coords.top -= coords.lineHeight + 32
    coords.left -= 5

    hans.then(hans =>
      showToastAt(hans.map(hanziInfo).join("  "), coords, 3000, 299999),
    )
  }
}

const setState = {
  activate: () => {
    state.active = true
    setState.resetBuffer()
  },

  diactivate: () => {
    state.active = false
    setState.resetBuffer()
  },

  resetBuffer: () => {
    state.buffer = ""
    state.candidates = []
    state.selectedIndex = 0
    inlinePopup.hide()
  },
}

const lastNInputText = (n: number) => {
  return state.inputHistory
    .slice(state.inputHistory.length - n)
    .map(s => (typeof s === "string" ? s : s.text))
    .join("")
}

const lastInputText = () => {
  const last = state.inputHistory[state.inputHistory.length - 1]
  if (!last) return undefined
  return typeof last === "string" ? last : last.text
}

const isAfterIMEInput = (target: InputElement) => {
  const last = lastInputText()
  if (!last) return false
  return target.value.slice(0, state.startPos).endsWith(last)
}

function setText(text: string, start?: number, end?: number) {
  if (!state.target) return
  state.target.setRangeText(
    text,
    start ?? state.startPos,
    end ?? state.endPos,
    "end",
  )
  state.target.dispatchEvent(new Event("input", { bubbles: true }))
  state.startPos = state.target.selectionStart ?? 0
  state.endPos = state.target.selectionEnd ?? 0
}

function setSchema(schema: Schema) {
  state.schemaHistory.push(state.schema)
  state.schema = schema
  showToast(
    `${
      state.schema === "hiragana"
        ? "ひらがな"
        : state.schema === "katakana"
          ? "カタカナ"
          : state.schema === "cqkm"
            ? "超强快码"
            : state.schema === "cqkmxy"
              ? "超强快码形音"
              : state.schema === "cj5"
                ? "倉頡五代"
                : state.schema
    }`,
  )

  updateCandidateRender()
}

const lastZhSchema = () =>
  state.schemaHistory.findLast(s => s !== "hiragana" && s !== "katakana")

async function prefixSearch() {
  const [matchz, nextz] = await getZhCode(
    // STORE_CODE,
    state.schema,
    state.buffer,
  )

  const [matchw, nextw] = await getZhWord(state.schema, state.buffer)

  // const nexts = [
  //   ...nextz.map(fromZhCode),
  //   ...nextw.map(fromZhWord)
  // ].sort((a, b) =>
  //     a.code.length === b.code.length
  //   ? ([a.code, b.code].sort()[0] === a.code ? -1 : 1)
  //   : a.code.length - b.code.length)

  const cands = [
    ...matchz.map(fromZhCode),
    ...matchw.map(fromZhWord),
    ...nextz.map(fromZhCode),
    ...nextw.map(fromZhWord),
  ]

  return cands
}

async function updateCandidateRender() {
  if (state.buffer.length === 0) {
    setState.resetBuffer()
    return
  }
  // const exact = state.cache.codes.filter(
  //   z => z.schema === state.schema && z.code === state.buffer,
  // )
  // const prefixed = state.cache.codes
  //   .filter(z => z.schema === state.schema && z.code.startsWith(state.buffer))
  //   .slice(exact.length)

  const filtered: Cand[] = []
  const needSuffix: Cand[] = []
  const remained: Cand[] = []
  state.candidates.forEach(cand => {
    if (cand?.suffix) {
      const bufferSuffix = state.buffer.slice(cand.suffix.start)
      const rem = removePrefix(bufferSuffix, cand.suffix.text)
      if (rem.length === 0) needSuffix.push(cand)
      else if (rem.length < cand.suffix.text.length) filtered.push(cand)
      else remained.push(cand)
    }
  })

  const searched = state.cache.prefixSearch(state.schema, state.buffer)

  if (needSuffix.length < 2) {
    state.candidates = [...needSuffix, ...searched]
  } else {
    const suffixes = getSuffixes(
      state.buffer ?? "",
      [...filtered, ...remained],
      needSuffix.length - 1,
    )
    const suffixed = applySuffixes(needSuffix, suffixes)
    state.candidates = [...filtered, ...suffixed, ...searched]
  }

  console.log("state.candidates", state.candidates)
  state.selectedIndex = 0

  if (state.candidates.length === 0) {
    setState.resetBuffer()
  } else if (state.candidates.length === 1) {
    commit()
  } else renderWidget()
}

const applySuffixes = (candidates: Cand[], suffixes: string[]): Cand[] =>
  candidates.map((cand, i) => {
    const suffix =
      i === 0
        ? cand.v.type === "zhword" && !cand.suffix
          ? state.schema === "cqkm"
            ? cand.v.v.hans.map(h => h.cqkmForm.slice(2)).join("")
            : state.schema === "cqkmxy"
              ? cand.v.v.hans.map(h => h.cqkmForm.slice(3)).join("")
              : suffixes.pop()
          : ""
        : cand.v.type === "zhcode"
          ? suffixes.pop()
          : !cand.suffix
            ? state.schema === "cqkm"
              ? cand.v.v.hans.map(h => h.cqkmForm.slice(2)).join("")
              : state.schema === "cqkmxy"
                ? cand.v.v.hans.map(h => h.cqkmForm.slice(3)).join("")
                : suffixes.pop()
            : suffixes.pop()

    return {
      ...cand,
      suffix: {
        text: suffix ?? "",
        start: state.buffer.length,
      },
    }
  })

// const suffixForSameCodeCandidates = (cands: Cand[]) => {
//   // let lastCode: string | undefined
//   const needSuffix: Cand[] = []
//   const suffixed: Cand[] = []
//   const remained: Cand[] = []
//   for (const c of cands) {
//     if (
//       c.suffix !== undefined
//         ? c.suffix.length === 0
//         : c.code.length === state.buffers.map(s => s.length).sum()
//     ) {
//       needSuffix.push(c)
//     } else if (c.suffix) suffixed.push(c)
//     else remained.push(c)
//   }

//   state.lastRemained = remained.length > 0

//   // const sameCodes = []
//   // for (const c of cands) {
//   //   const code = c.suffix ? c.suffix : c.code.slice(state.buffer.length - 1)
//   //   if (lastCode ? lastCode === code : true) {
//   //     sameCodes.push(c)
//   //     lastCode = code
//   //   } else break
//   // }
//   // console.log("sameCodes", sameCodes)

//   if (needSuffix.length < 2) {
//     if (suffixed.length + needSuffix.length === 0) state.suffixStart = null
//     return cands
//   } else {
//     const isFirstSuffix = state.suffixStart === null
//     if (state.suffixStart) {
//       state.suffixStart +=
//         suffixed.length > 0 ? (suffixed[0].suffix?.length ?? 0) : 1
//     } else {
//       state.suffixStart = state.buffer.length
//     }

//     const suffixes = getSuffixes(
//       state.buffer,
//       remained,
//       needSuffix.length - 1,
//     ).reverse()

//     console.log({
//       suffixStart: state.suffixStart,
//       needSuffix,
//       suffixed,
//       remained,
//       suffixes,
//     })

//     const newSuffixed = needSuffix.map((cand, i) => {
//       const suffix =
//         i === 0
//           ? cand.v.type === "zhword" && isFirstSuffix
//             ? state.schema === "cqkm"
//               ? cand.v.v.hans.map(h => h.cqkmForm.slice(2)).join("")
//               : state.schema === "cqkmxy"
//                 ? cand.v.v.hans.map(h => h.cqkmForm.slice(3)).join("")
//                 : suffixes.pop()
//             : ""
//           : cand.v.type === "zhcode"
//             ? suffixes.pop()
//             : isFirstSuffix
//               ? state.schema === "cqkm"
//                 ? cand.v.v.hans.map(h => h.cqkmForm.slice(2)).join("")
//                 : state.schema === "cqkmxy"
//                   ? cand.v.v.hans.map(h => h.cqkmForm.slice(3)).join("")
//                   : suffixes.pop()
//               : suffixes.pop()

//       return {
//         ...cand,
//         suffix,
//       }
//     })

//     return [...newSuffixed, ...remained]
//   }
// }
