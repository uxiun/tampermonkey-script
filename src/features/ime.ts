import { isInput, transpose } from "@/pure/utils"
import { candidateTip } from "./dlt-component"
import { getPopupPosition } from "@/pure/dom"
import { Key, KeyManager, Single } from "@/pure/key"
import { showToast } from "@/pure/component"
import { kana, KANA_TABLE, katakana } from "@/pure/table"

const DB_NAME = "ac_ime_db"
const DB_VERSION = 2
export const STORE_HANZI = "hanzi"
export const STORE_CODE = "zhcode"
export const STORE_WORD = "zhword"

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

type Schema = "cj5" | "cqkm" | "cqkm-xy" | "hiragana" | "katakana"

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
          keyPath: ["zh", "code", "schema"],
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
          keyPath: ["zh", "code", "schema"],
        })
        store.createIndex("code", "code")
        store.createIndex("schema", "schema")
        store.createIndex("nth", "nth")
        store.createIndex("on", "on")
        store.createIndex("date", "date")
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

// export async function getZhCode(
//   storeName: string,
//   schema: Schema,
//   searchPrefix: string,
// ): Promise<[ZhCode[], ZhCode[]]> {
//   const db = await openDB()
//   const range = IDBKeyRange.bound(
//     searchPrefix,
//     searchPrefix + "\uffff",
//     true,
//     false,
//   )

//   return new Promise((resolve, reject) => {
//     const tx = db.transaction(storeName, "readonly")
//     const store = tx.objectStore(storeName)

//     const index = store.index("code")
//     const eq = index.getAll(searchPrefix)
//     eq.onsuccess = () => {
//       const eqs: ZhCode[] = eq.result
//       const req = index.getAll(range)
//       req.onsuccess = () => {
//         const codes: ZhCode[] = req.result
//         resolve(
//           [eqs, codes].map(zs => zs.filter(z => z.schema === schema)) as [
//             ZhCode[],
//             ZhCode[],
//           ],
//         )
//       }
//       req.onerror = () => reject(req.error)
//     }
//   })
// }

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
        resolve([eqs, codes] as [ZhCode[], ZhCode[]])
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
        resolve([eqs, codes] as [ZhWord[], ZhWord[]])
      }
      req.onerror = () => reject(req.error)
    }
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

    if (w.code.length > 0) return w
  }
}

export interface Cand {
  text: string
  code: string
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

interface ImeConfig {
  // keys: KeyConfig
  // schema: Record<Schema, SchemaConfig>

  cqkmFormLayout?: CodeMapToBase
}

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

// let config: ImeConfig = {
//   cqkmFormLayout: [],
// }

interface ImeState {
  active: boolean
  candidates: Cand[]
  cache: {
    codes: ZhCode[]
  }
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
  active: false,
  schema: "cqkm",
  cache: {
    codes: [],
  },
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
    console.log("coords", coords)
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

  state.cache.codes = await getAllCodesFromIDB()
  state.cache.codes.sort((a, b) => a.code.localeCompare(b.code))
  console.log("initial IME state", state)

  const keyManager = new KeyManager(40, committedChord => {
    if (!state.active || !state.target) return

    if (state.schema === "hiragana") {
      const k = kana(committedChord)
      if (k) {
        setText(k, state.startPos, state.endPos, "end")
        return
      }
      if (
        committedChord.length === 1 &&
        KANA_TABLE.map(row => row[0])
          .join("")
          .includes(committedChord[0])
      ) {
        setText(committedChord[0], state.startPos, state.endPos, "end")
      }
      return
    }

    if (state.schema === "katakana") {
      const k = katakana(committedChord)
      if (k) {
        setText(k, state.startPos, state.endPos, "end")
        return
      }
      if (
        committedChord.length === 1 &&
        KANA_TABLE.map(row => row[0])
          .join("")
          .includes(committedChord[0])
      ) {
        setText(committedChord[0], state.startPos, state.endPos, "end")
      }
      return
    }
  })

  const zaociPrompt = async (n: number) => {
    const t = prompt(
      "追加したい単語またはその最後のn入力分のn",
      lastNInputText(n),
    )

    if (!t) return
    const i = parseInt(t)
    if (Number.isNaN(i)) {
      const z = await zaoci(state.schema, t)
      const code = prompt(`「${t}」の綴`, z?.code)
      if (z && code) {
        z.code = code
        putWordsIDB([z])
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
    e => {
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

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
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
          e.preventDefault()
          e.stopImmediatePropagation()
          zaociPrompt(2)
        }
        return
      }

      if (e.ctrlKey && (e.key === " " || e.key === "i")) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSchema("hiragana")
      }

      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      // 以下は全て単打

      if (e.key === " ") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          commit()
          setSchema("hiragana")
        } else {
          e.preventDefault()
          e.stopImmediatePropagation()
          setSchema("katakana")
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
          if (state.buffer.length === 0) setState.resetBuffer()
          else updateCandidateRender()
        } else if (isAfterIMEInput(target)) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const n = lastInputText()!.length
          setText("", state.startPos - n, state.startPos, "end")
          state.inputHistory = state.inputHistory.slice(-1)
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

      if (e.key === "Tab" && state.buffer.length > 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setState.resetBuffer()
        return
      }
      if (e.key === "Escape" && state.buffer.length > 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setState.resetBuffer()
        return
      }

      if (/[a-z]/.test(e.key)) {
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
  setText(
    cand.text,
    state.startPos,
    state.endPos,
    "end", // move caret to insertion end
  )
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
          putCodesIDB([c.v.v])
        } else if (c.v.type === "zhword") {
          putWordsIDB([c.v.v])
        }
      }
    }
  }

  setState.resetBuffer()
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

function setText(
  text: string,
  start: number,
  end: number,
  mode: SelectionMode,
) {
  if (!state.target) return
  state.target.setRangeText(text, start, end, mode)
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
            : state.schema === "cj5"
              ? "倉頡五代"
              : state.schema
    }`,
  )
}

const lastZhSchema = () =>
  state.schemaHistory.findLast(s => s !== "hiragana" && s !== "katakana")

async function updateCandidateRender() {
  // const exact = state.cache.codes.filter(
  //   z => z.schema === state.schema && z.code === state.buffer,
  // )
  // const prefixed = state.cache.codes
  //   .filter(z => z.schema === state.schema && z.code.startsWith(state.buffer))
  //   .slice(exact.length)

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

  state.candidates = [
    ...matchz.map(fromZhCode),
    ...matchw.map(fromZhWord),
    ...nextz.map(fromZhCode),
    ...nextw.map(fromZhWord),
  ]

  state.selectedIndex = 0
  if (state.candidates.length === 0) {
    setState.resetBuffer()
  } else if (state.candidates.length === 1) commit()
  else renderWidget()
}
