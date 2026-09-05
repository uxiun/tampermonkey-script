import { isInput, mergeObjects, removePrefix, transpose } from "@/pure/utils"
import { candidateTip } from "./dlt-component"
import { getPopupPosition } from "@/pure/dom"
import { Key, KeyManager, Single } from "@/pure/key"
import { showToast, showToastAt } from "@/pure/component"
import { kana, KANA_TABLE, katakana } from "@/pure/table"
import { getSuffixes } from "./keys"
import { onTabLoadIME } from "./ime-add-listener"

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

export type Schema = "cj5" | "cqkm" | "cqkmxy" | "hiragana" | "katakana"

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

// type ExceptionOption = "prompt" | "skip" | "ignore_continue"

export async function zaoci(
  schema: Schema,
  zh: string,
  // exceptionOption: ExceptionOption = "skip",
) {
  const hans = await getHans(zh)

  if (schema === "cqkm" || schema === "cqkmxy") {
    const hs = hans.map(toCqkm).filter(Boolean) as Cqkm[]
    if (hs.length === 0) return

    // let exceptionSkip = true
    if (hs.length !== zh.length) {
      console.log("取得できた漢字数と文字列の長さが一致しません")
      console.log({
        zh,
        hans,
        hs,
      })

      // if (exceptionOption === "prompt")
      //   exceptionSkip = prompt(
      //     `cqkmForm, cqkmInitials を持つ漢字数と文字列の長さが一致しません（取得: ${hs.map(h => h.zh).join()}） それでも追加しますか？`,
      //   )
    }

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
      const hans = hs.length > 4 ? [...hs.slice(0, 4), hs[hs.length - 1]] : hs
      w.code = hans.map(h => h.cqkmInitial + h.cqkmForm[0]).join("")
    } else if (schema === "cqkmxy") {
      const hans = hs.length > 4 ? [...hs.slice(0, 4), hs[hs.length - 1]] : hs

      w.code =
        hans.map(h => h.cqkmForm.slice(0, 2)).join("") +
        hans.map(h => h.cqkmInitial).join("")
    }

    if (w.code.length)
      return {
        word: w,
        hans,
        hs,
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

export const multiZaociPrompt = () => {
  const isUser = confirm("これから登録する単語を手動追加分として記録しますか？")
  const text = prompt(
    "登録したい単語を貼り付けて（漢字熟語を正規表現で抽出します）",
  )
  if (!text) return
  const hansSeps = text.match(/[々〆〇〻㐂-頻]+/g)
  if (!hansSeps) return
  const words = hansSeps.filter(w => w.length >= 2)

  showToast(`${words.length}単語追加します…`)
  multiZaoci(words, isUser)
  showToast(`${words.length}単語を追加しました`)
}

export const importWordsJSONArray = async () => {
  const isUser = confirm("これから登録する単語を手動追加分として記録しますか？")
  const url = prompt("漢字熟語一覧 json URL (string[])")
  if (!url) return
  const res = await fetch(new Request(url))

  const words: string[] = await res.json()
  showToast(`${words.length}単語追加します…`)
  multiZaoci(words, isUser)
  showToast(`${words.length}単語を追加しました`)
}

export const multiZaoci = async (words: string[], user: boolean) => {
  let zhwords: ZhWord[] = []

  // for (const s of spells.slice(0, 20)) {
  //   const w = await zaoci("cqkm", s.zh)
  //   console.log("word", w)
  // }

  let i = 1
  for (const word of words) {
    const w = await zaoci("cqkm", word)
    const x = await zaoci("cqkmxy", word)

    if (w)
      zhwords.push({
        ...w.word,
        user,
      })
    if (x)
      zhwords.push({
        ...x.word,
        user,
      })
    if (zhwords.length % 1000 === 0) {
      console.log(`${(i - 1) * 1000}件～${i * 1000}件`, zhwords)
      i++
      zhwords.forEach(w => state.cache.updateWord(w))
      zhwords = []
    }
  }

  console.log("zhwords:", zhwords)
  zhwords.forEach(w => state.cache.updateWord(w))
  console.log("putWordsIDB DONE")
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

type CandVar =
  | { type: "zhcode"; v: ZhCode; hans: Hanzi[] }
  | { type: "zhword"; v: ZhWord }
  | { type: "other"; memo?: string }

const fromZhCode = (z: ZhCode): Cand => ({
  code: z.code,
  text: z.zh,
  v: { type: "zhcode", v: z, hans: state.cache.getHans(z.zh) },
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

// 1. ソート用比較関数（zh 昇順 -> 必要に応じて nth などで並び替え）
function compareHans(a: Hanzi, b: Hanzi): number {
  return a.zh.localeCompare(b.zh)
}

export class Cache {
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
    this.hans = hans.sort((a, b) => a.zh.localeCompare(b.zh))
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
      else prefixMatchedCodes.push(c) // 抽出範囲内なので c.code.startsWith(prefix) は確定
    }

    const matchedWords: ZhWord[] = []
    const prefixMatchedWords: ZhWord[] = []
    for (const w of targetWords) {
      if (w.code === prefix) matchedWords.push(w)
      else prefixMatchedWords.push(w)
    }

    prefixMatchedCodes.sort((a, b) =>
      a.code.length === b.code.length
        ? a.code.localeCompare(b.code)
        : a.code.length - b.code.length,
    )

    prefixMatchedWords.sort((a, b) =>
      a.code.length === b.code.length
        ? a.code.localeCompare(b.code)
        : a.code.length - b.code.length,
    )

    console.log({
      matchedCodes,
      matchedWords,
      prefixMatchedCodes,
      prefixMatchedWords,
    })

    // 完全一致 -> 前方一致の順で結合して返却
    return [
      ...matchedCodes.map(fromZhCode),
      ...matchedWords.map(fromZhWord),
      ...prefixMatchedCodes.map(fromZhCode),
      ...prefixMatchedWords.map(fromZhWord),
    ]
  }

  /**
   * 指定した漢字（zh）に一致する Hanzi レコード配列を二分探索で取得
   * @param zh 検索したい漢字 (例: "漢")
   */
  getHans(zh: string): Hanzi[] {
    if (!zh) return []

    // 1. 指定した zh 以上（>= zh）が最初に現れるインデックスを取得
    const startIndex = binarySearch(
      this.hans,
      item => item.zh.localeCompare(zh) >= 0,
    )

    // 2. 指定した zh より大きい（> zh）が最初に現れるインデックスを取得
    const endIndex = binarySearch(
      this.hans,
      item => item.zh.localeCompare(zh) > 0,
    )

    // 該当範囲を O(log N) でスライスして返却
    return this.hans.slice(startIndex, endIndex)
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

  // データ更新時（Hanzi の追加・更新）
  async updateHanzi(hanzi: Hanzi) {
    await putIDB([hanzi], STORE_HANZI)

    const existingIdx = this.hans.findIndex(h => h.zh === hanzi.zh)

    if (existingIdx !== -1) {
      this.hans.splice(existingIdx, 1)
    }

    // 二分探索で適切な挿入位置を検索
    const insertIdx = binarySearch(
      this.hans,
      item => compareHans(item, hanzi) >= 0,
    )

    this.hans.splice(insertIdx, 0, hanzi)
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

export interface ImeState {
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

export const globalImeState: ImeState = {
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

const state = globalImeState

export const getImeState = () => ({ ...state })
export const initializeCache = () => state.cache.init()

export const isImeCandidateVisible = () => state.candidates.length > 0

export class InlineSuggestPopup {
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
          v: { type: "other" },
        },
        true,
        state.buffer,
      ),
      ...state.candidates.slice(0, state.selectedIndexMax).map((cand, idx) => {
        const isSelected = idx === selectedIndex

        return candidateTip(cand, isSelected, state.buffer, {
          fontSize: {
            text: "21px",
            above: "20px",
            below: "12px",
          },
        })

        // return candidateTip(
        //   cand.text,
        //   aboveTexts,
        //   belowTexts,
        //   isSelected,
        //   undefined,
        //   {
        //     fontSize: {
        //       text: "21px",
        //       above: "20px",
        //       below: "12px",
        //     },
        //   },
        // )
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

export const inlinePopup = new InlineSuggestPopup()

export const launchIME = async () => {
  console.log("AutoControl.launchIME")

  state.cache.init()
  console.log("initial IME state", state)
}

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
