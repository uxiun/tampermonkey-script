import { mergeObjects } from "@/pure/utils"
import { codewordIsEqual, Hanzi, ZhCode, ZhWord } from "./ime"

// ストレージキーを一括管理
const STORAGE_KEYS = {
  HANS: "gm_ime_hanzi",
  CODES: "gm_ime_codes",
  WORDS: "gm_ime_words",
} as const

const compactCodes = (codes: ZhCode[]) =>
  codes.map(c => [c.code, c.date, c.nth, c.on, c.schema, c.user, c.zh])

const compactWords = (words: ZhWord[]) =>
  words.map(c => [c.code, c.date, c.hans, c.nth, c.on, c.schema, c.user, c.zh])

const restoreCode = (item: any): ZhCode => ({
  code: item[0],
  date: item[1],
  nth: item[2],
  on: item[3],
  schema: item[4],
  user: item[5],
  zh: item[6],
})

const restoreWord = (item: any): ZhWord => ({
  code: item[0],
  date: item[1],
  hans: item[2],
  nth: item[3],
  on: item[4],
  schema: item[5],
  user: item[6],
  zh: item[7],
})

// 汎用の GM ラッパー
export async function loadStorage<T>(key: string): Promise<T[]> {
  return GM_getValue<T[]>(key) ?? []
}

export async function saveStorage<T>(key: string, data: T[]): Promise<void> {
  GM_setValue(key, data)
}

// 1キーあたりのチャンクサイズ（例: 5000件ずつ分割）
// const CHUNK_SIZE = 5000

// 外部に公開する API はこれだけで OK
export const storage = {
  getHans: () => loadStorage<Hanzi>(STORAGE_KEYS.HANS),
  getCodes: () => loadStorage<ZhCode>(STORAGE_KEYS.CODES),
  // getCodes: async () => {
  //   const raw = await GM_getValue(STORAGE_KEYS.CODES, [])
  //   const codes: ZhCode[] = raw.map(item => ({
  //     code: item[0],
  //     date: item[1],
  //     nth: item[2],
  //     on: item[3],
  //     schema: item[4],
  //     user: item[5],
  //     zh: item[6],
  //   }))
  //   return codes
  // },
  setHans: (data: Hanzi[]) => saveStorage(STORAGE_KEYS.HANS, data),
  setCodes: (data: ZhCode[]) => saveStorage(STORAGE_KEYS.CODES, data),

  // getWords: async () => {
  //   const countKey = "words_chunk_count"
  //   const chunkCount = await GM_getValue<number>(countKey, 0)

  //   if (chunkCount === 0) return []

  //   const chunks: ZhWord[][] = []
  //   for (let i = 0; i < chunkCount; i++) {
  //     const chunk = await GM_getValue<ZhWord[]>(`words_chunk_${i}`, [])
  //     chunks.push(chunk)
  //   }

  //   // 分割された配列を1つの配列に結合して返す
  //   return chunks.flat()
  // },

  // setWords: async (words: ZhWord[]) => {
  //   // 1. 既存の words 関連キーを一旦クリア
  //   const countKey = "words_chunk_count"
  //   const oldCount = await GM_getValue<number>(countKey, 0)
  //   for (let i = 0; i < oldCount; i++) {
  //     GM_deleteValue(`words_chunk_${i}`)
  //   }

  //   // 2. 配列を分割して保存
  //   const chunkCount = Math.ceil(words.length / CHUNK_SIZE)
  //   await GM_setValue(countKey, chunkCount)

  //   for (let i = 0; i < chunkCount; i++) {
  //     const chunk = words.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
  //     await GM_setValue(`words_chunk_${i}`, chunk)
  //   }
  // },

  // 単語を1件個別追加する API
  async addWord(newWord: ZhWord): Promise<void> {
    const prefix = newWord.code.slice(0, 2)
    const key = `words_prefix_${prefix}`

    // 1. そのプレフィックスのチャンクだけを取得（存在しない場合は空配列）
    const currentChunk = await GM_getValue<ZhWord[]>(key, [])

    // 2. 単語を追加（重複チェックが必要な場合はここで行う）
    const already = currentChunk.find(w => codewordIsEqual(w, newWord))
    if (already) {
      console.log("既に存在します:", already)
      return
    }

    currentChunk.push(newWord)

    // 3. そのチャンクだけをピンポイントで再保存
    await GM_setValue(key, currentChunk)

    // 4. 新しい prefix だった場合は prefix 一覧も更新
    const prefixes = await GM_getValue<string[]>("word_prefixes", [])
    if (!prefixes.includes(prefix)) {
      prefixes.push(prefix)
      await GM_setValue("word_prefixes", prefixes)
    }
  },

  async getChunkByPrefix(prefix: string) {
    const key = `words_prefix_${prefix.slice(0, 2)}`
    const chunk = await GM_getValue<ZhWord[]>(key)
    return chunk
  },
}

// 初期化時（imeInitializeGM）
export const saveWordsByPrefix = async (words: ZhWord[]) => {
  // 1. 先頭文字ごとにグループ化 (例: { "a": [...], "b": [...], "cq": [...] })
  const grouped: Record<string, ZhWord[]> = {}

  for (const word of words) {
    // 検索で使うキーの先頭1〜2文字（例: pinyinやcqkmの頭文字）
    const prefix = word.code.slice(0, 2)
    if (!grouped[prefix]) grouped[prefix] = []
    grouped[prefix].push(word)
  }

  // 2. グループごとに小分けして GM_setValue (これで64MBの通信上限を絶対超えない)
  const prefixes = Object.keys(grouped)
  await GM_setValue("word_prefixes", prefixes) // 存在するキー一覧

  for (const prefix of prefixes) {
    await GM_setValue(`words_prefix_${prefix}`, grouped[prefix])
  }
}

// 初期化時（imeInitializeGM）
export const saveCodesByPrefix = async (codes: ZhCode[]) => {
  // 1. 先頭文字ごとにグループ化 (例: { "a": [...], "b": [...], "cq": [...] })
  const grouped: Record<string, ZhCode[]> = {}

  for (const code of codes) {
    // 検索で使うキーの先頭1〜2文字（例: pinyinやcqkmの頭文字）
    const prefix = code.code.slice(0, 2)
    if (!grouped[prefix]) grouped[prefix] = []
    grouped[prefix].push(code)
  }

  // 2. グループごとに小分けして GM_setValue (これで64MBの通信上限を絶対超えない)
  const prefixes = Object.keys(grouped)
  await GM_setValue("code_prefixes", prefixes) // 存在するキー一覧

  for (const prefix of prefixes) {
    await GM_setValue(`codes_prefix_${prefix}`, grouped[prefix])
  }
}
