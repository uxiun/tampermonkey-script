// src/autocontrol.d.ts

declare namespace ACtl {
  function setClipboard(text: string): Promise<boolean>
  function setClipboard(image: string): Promise<boolean>
  function setClipboard(data: { html: string }): Promise<boolean>

  function expand(template: string): Promise<string>
  function expand(template: string, tabSpec: TabSpec): Promise<string>
  function expand(
    template: string,
    tabSpec: TabSpec | undefined,
    returnType: "string",
  ): Promise<string>
  function expand(
    template: string,
    tabSpec: TabSpec | undefined,
    returnType: "array",
  ): Promise<string[]>

  function getTabInfo(tabSpec: string): Promise<{ [tabId: number]: TabInfo }>

  //openURL-----------------------------------------------------------------------------------------
  /**
   * options.newWindow の設定
   * 「normal」「popup」「incognito」のいずれか、またはそれらをスペース区切りで組み合わせた文字列
   */
  type NewWindowOption =
    | "normal"
    | "popup"
    | "incognito"
    | "normal incognito"
    | "popup incognito"
    | "incognito normal"
    | "incognito popup"

  /**
   * options オブジェクトの型定義
   * 仕様：「以下のプロパティのいずれか1つのみを持つオブジェクト」
   */
  type OpenURLOptions =
    | { newWindow: NewWindowOption; rightOf?: never; leftOf?: never }
    | { rightOf?: TabSpec; newWindow?: never; leftOf?: never }
    | { leftOf?: TabSpec; newWindow?: never; rightOf?: never }
    | { [key: string]: never } // 空のオブジェクト {} を許容するための設定

  /**
   * 指定したURLを既存のタブや新しいタブ、または新しいウィンドウで開きます。
   *
   * @param urls 開きたい単一のURL文字列、またはURLの配列。
   * @param tabSpec URLを開く対象となるタブを指定する TabSpec。数が足りない場合は新規タブが作成されます。
   * @returns 実際にURLが開かれたタブのID（number）の配列を返す Promise。
   */
  function openURL(urls: string | string[], tabSpec: TabSpec): Promise<number[]>

  /**
   * 指定したURLをオプション（新規ウィンドウ、位置指定など）に従って開きます。
   *
   * @param urls 開きたい単一のURL文字列、またはURLの配列。
   * @param options 開き方をカスタマイズするオプションオブジェクト（省略可能）。
   * @returns 実際にURLが開かれたタブのID（number）の配列を返す Promise。
   */
  function openURL(
    urls: string | string[],
    options?: OpenURLOptions,
  ): Promise<number[]>
  //-------------------------------------------------------------------------------------------

  //tabSpec------------------------------------------------------------------------------------
  /**
   * 3. Preset tab-selection
   * 文字列リテラルのユニオン型として定義
   */
  type PresetTabSelection =
    | "#targetTabs"
    | "#currentTab"
    | "#newestTab"
    | "#openerTab"
    | "#prevUsedTab"
    | "#prevUsedTabAnyWin"
    | "#nextUsedTab"
    | "#nextUsedTabAnyWin"
    | "#activeTabs"
    | "#selectedTabs"
    | "#hoveredTabs"
    | "#pinnedTabs"
    | "#audibleTabs"
    | "#nonMinimTabs"
    | "#leftTab"
    | "#leftTabWrap"
    | "#allLeftTabs"
    | "#leftmostTab"
    | "#rightTab"
    | "#rightTabWrap"
    | "#allRightTabs"
    | "#rightmostTab"
    | "#otherTabs"
    | "#otherTabsAllWins"
    | "#currWinTabs"
    | "#mruTabs"
    | "#mruTabsAllWins"
    | "#allTabs"

  /**
   * 2. Filter Object
   * not または sameWinAs のどちらか片方のみを持つオブジェクト
   */
  type FilterObject =
    | { not: TabSpec; sameWinAs?: never }
    | { sameWinAs: TabSpec; not?: never }

  /**
   * 1. Tab ID (number)
   * 4. Custom tab-selection (string)
   * 5. Array of TabSpec (TabSpec[])
   */
  export type TabSpec =
    | number // Tab ID
    | PresetTabSelection // Preset tab-selection
    // | (string & {}) // Custom tab-selection (補完を残しつつ任意の文字列を許容)
    | FilterObject // Filter Object
    | TabSpec[] // Array of TabSpec
  //--------------------------------------------------------------------------------------

  /**
   * 指定された場所からファイルを取得し、指定された形式で返します。
   * @param fileLocation URL、データURI、ローカルパス、またはUNCパス。`<desktop>` などのプレースホルダーを含めることができます。
   * @param returnType ファイルコンテンツの返し方（デフォルトは 'text'）
   * @throws {string} ファイルにアクセスできない場合、または指定された型に解釈できない場合のエラー説明。
   */
  function getFile<T extends ACtlGetFileReturnType = "text">(
    fileLocation: string,
    returnType?: T,
  ): Promise<ACtlGetFileReturnTypeMap[T]>

  /**
   * 指定したファイルパスにコンテンツを保存します。
   * * @param filePath 保存先ファイルのローカルパスまたはUNCパス。`<desktop>` などのプレースホルダーが使用可能。
   * @param content 保存するコンテンツ（文字列、Blob、Canvas、各種DOM要素、オブジェクトなど）。
   * @param options 保存時のオプション（追加書き込み、エンコーディング、画像クオリティなど）。
   * @returns 実際に保存されたファイルの絶対パスを返す Promise。
   */
  function saveFile(
    filePath: string,
    content: ACtlSaveFileContent,
    options?: ACtlSaveFileOptions,
  ): Promise<string>
}

// 戻り値のマッピング定義
interface ACtlGetFileReturnTypeMap {
  text: string
  json: any // 必要に応じて具体的な型、または unknown に変更してください
  html: DocumentFragment
  htmlDoc: Document
  xmlDoc: XMLDocument
  css: HTMLStyleElement
  module: any // JavaScriptモジュールオブジェクト（インポートされたオブジェクト）
  image: HTMLImageElement
  canvas: HTMLCanvasElement
  binary: string
  blob: Blob
  file: File
  objectUrl: string
  dataUri: string
  base64: string
}

// returnType のリテラル型
type ACtlGetFileReturnType = keyof ACtlGetFileReturnTypeMap

// --- 関連する型定義（ネームスペース内、または外に配置） ---

/** saveFile の content 引数に許容される型 */
type ACtlSaveFileContent =
  | string
  | Blob
  | File
  | ArrayBuffer
  | Element
  | DocumentFragment
  | HTMLImageElement
  | SVGImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | object
  | any // その他すべての型（自動的に文字列変換されるため）

/** saveFile の options 引数の型定義 */
interface ACtlSaveFileOptions {
  /** 既存のファイル内容を置き換えるのではなく、末尾に追記するかどうか（デフォルト: false） */
  append?: boolean
  /** * 出力フォーマット。
   * テキストの場合: 'UTF-8' | 'UTF-16LE' | 'UTF-16BE' (デフォルト: 'UTF-8')
   * 画像の場合: 'png' | 'jpg' | 'webp' (デフォルト: 'png')
   */
  format?: "UTF-8" | "UTF-16LE" | "UTF-16BE" | "png" | "jpg" | "webp" | string
  /** format が 'jpg' または 'webp' の場合の画質。0 から 1 の間の数値（デフォルト: 0.9） */
  quality?: number
}
