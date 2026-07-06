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

  // 実装の実体（TypeScriptのコンパイラ用。呼び出し元からは隠蔽されます）
  function expand(
    template: string,
    tabSpec?: TabSpec,
    returnType?: "string" | "array",
  ): Promise<string | string[]>

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
}
