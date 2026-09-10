import { mergeObjects } from "@/pure/utils"
import { codewordIsEqual, Hanzi, ZhCode, ZhWord } from "./ime"
import { showToast } from "@/pure/component"

// ストレージキーを一括管理
const STORAGE_KEYS = {
  HANS: "gm_ime_hanzi",
  CODES: "gm_ime_codes",
  WORDS: "gm_ime_words",
} as const

// 保存時：Dateオブジェクトならミリ秒（number）にし、stringなら数値化、無ければ現在時刻
const compact = <T extends ZhCode | ZhWord>(codes: T[]) =>
  codes.map(c => [
    c.code,
    c.date instanceof Date
      ? c.date.getTime()
      : c.date
        ? new Date(c.date).getTime()
        : Date.now(),
    c.nth,
    c.on,
    c.schema,
    c.user,
    c.zh,
  ])

// 復元時：数値（ミリ秒）や文字列から Date インスタンスを確実に再生成する
export const restoreCode = (item: any): ZhCode => ({
  code: item[0],
  date: item[1] ? new Date(item[1]) : new Date(), // ★ ここで Date オブジェクトに復元！
  nth: item[2],
  on: item[3],
  schema: item[4],
  user: item[5],
  zh: item[6],
})

export const restoreWord = (item: any): ZhWord => ({
  code: item[0],
  date: item[1] ? new Date(item[1]) : new Date(), // ★ ここで Date オブジェクトに復元！
  nth: item[2],
  on: item[3],
  schema: item[4],
  user: item[5],
  zh: item[6],
})

// 汎用の GM ラッパー
export async function loadStorage<T>(key: string): Promise<T[]> {
  return GM_getValue<T[]>(key) ?? []
}

export async function saveStorage<T>(key: string, data: T[]): Promise<void> {
  GM_setValue(key, data)
}

export const PREFIX_MAX_LEN = 3

// 外部に公開する API はこれだけで OK
export const storage = {
  getHans: () => loadStorage<Hanzi>(STORAGE_KEYS.HANS),
  // getCodes: () => loadStorage<ZhCode>(STORAGE_KEYS.CODES),
  getCodes: async () => {
    const raw = await GM_getValue(STORAGE_KEYS.CODES, [])
    const codes: ZhCode[] = raw.map(item => restoreCode(item))
    return codes
  },
  setHans: (data: Hanzi[]) => saveStorage(STORAGE_KEYS.HANS, data),

  // setCodes: (data: ZhCode[]) => saveStorage(STORAGE_KEYS.CODES, data),
  setCodes: async (data: ZhCode[]) => {
    const raws = compact(data)
    GM_setValue(STORAGE_KEYS.CODES, raws)
  },

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
    const prefix = newWord.code.slice(0, PREFIX_MAX_LEN)
    const key = `words_prefix_${prefix}`

    // 1. そのプレフィックスのチャンクだけを取得（存在しない場合は空配列）
    const raws = await GM_getValue(key, [])
    const currentChunk = raws.map(r => restoreWord(r))

    // 2. 単語を追加（重複チェックが必要な場合はここで行う）
    const already = currentChunk.find(w => codewordIsEqual(w, newWord))
    if (already) {
      console.log("既に存在します:", already)
      return
    }

    currentChunk.push(newWord)

    // 3. そのチャンクだけをピンポイントで再保存
    await GM_setValue(key, compact(currentChunk))

    // 4. 新しい prefix だった場合は prefix 一覧も更新
    const prefixes = await GM_getValue<string[]>("word_prefixes", [])
    if (!prefixes.includes(prefix)) {
      prefixes.push(prefix)
      await GM_setValue("word_prefixes", prefixes)
    }
  },

  async getChunkByPrefix(prefix: string) {
    const key = `words_prefix_${prefix.slice(0, PREFIX_MAX_LEN)}`
    const raws = await GM_getValue(key, [])
    const chunk = raws.map(r => restoreWord(r))
    return chunk
  },

  async updateWord(updatedWord: ZhWord): Promise<void> {
    const prefix = updatedWord.code.slice(0, PREFIX_MAX_LEN)
    const key = `words_prefix_${prefix}`

    const raws = await GM_getValue(key, [])
    const currentChunk = raws.map(r => restoreWord(r))

    // code と zh が一致する既存要素のインデックスを探す
    const index = currentChunk.findIndex(
      w => w.code === updatedWord.code && w.zh === updatedWord.zh,
    )

    if (index !== -1) {
      // 既存要素を上書き（置換）
      currentChunk[index] = updatedWord
    } else {
      // なければ追加
      currentChunk.push(updatedWord)
    }

    // チャンクを保存
    await GM_setValue(key, compact(currentChunk))
  },
}

// 初期化時（imeInitializeGM）
export const saveWordsByPrefix = async (words: ZhWord[]) => {
  // 1. 先頭文字ごとにグループ化 (例: { "a": [...], "b": [...], "cq": [...] })
  const grouped: Record<string, ZhWord[]> = {}

  for (const word of words) {
    // 検索で使うキーの先頭1〜2文字（例: pinyinやcqkmの頭文字）
    const prefix = word.code.slice(0, PREFIX_MAX_LEN)
    if (!grouped[prefix]) grouped[prefix] = []
    grouped[prefix].push(word)
  }

  // 2. グループごとに小分けして GM_setValue (これで64MBの通信上限を絶対超えない)
  const prefixes = Object.keys(grouped)
  await GM_setValue("word_prefixes", prefixes) // 存在するキー一覧

  for (const prefix of prefixes) {
    await GM_setValue(`words_prefix_${prefix}`, compact(grouped[prefix]))
  }
}

// 初期化時（imeInitializeGM）
export const saveCodesByPrefix = async (codes: ZhCode[]) => {
  // 1. 先頭文字ごとにグループ化 (例: { "a": [...], "b": [...], "cq": [...] })
  const grouped: Record<string, ZhCode[]> = {}

  for (const code of codes) {
    // 検索で使うキーの先頭1〜2文字（例: pinyinやcqkmの頭文字）
    const prefix = code.code.slice(0, PREFIX_MAX_LEN)
    if (!grouped[prefix]) grouped[prefix] = []
    grouped[prefix].push(code)
  }

  // 2. グループごとに小分けして GM_setValue (これで64MBの通信上限を絶対超えない)
  const prefixes = Object.keys(grouped)
  await GM_setValue("code_prefixes", prefixes) // 存在するキー一覧

  for (const prefix of prefixes) {
    await GM_setValue(`codes_prefix_${prefix}`, compact(grouped[prefix]))
  }
}

// 単語データを JSON ファイルとしてローカルに保存する関数
export const exportWordsBackup = async () => {
  showToast("単語一覧を出力します")
  const prefixes = await GM_getValue<string[]>("word_prefixes", [])
  const allWords: ZhWord[] = []

  for (const prefix of prefixes) {
    const chunk = await GM_getValue<ZhWord[]>(`words_prefix_${prefix}`, [])
    if (chunk) allWords.push(...chunk)
  }

  console.log("単語一覧:", allWords)
  showToast(`${allWords.length}単語`)

  // JSON 化してダウンロードリンクを生成
  const blob = new Blob([JSON.stringify(allWords, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `ime_words_backup_${new Date().toISOString().slice(0, 10)}.json`
  a.click()

  URL.revokeObjectURL(url)
}

// export const exportHansCodesBackup = async () => {
//   const hans = await storage.getHans()
//   const codes = await storage.getCodes()
//   const blob = new Blob([JSON.stringify])
// }
