import "dotenv/config"
import * as esbuild from "esbuild"
import { globSync } from "node:fs"

// // Tampermonkey 用のメタデータヘッダー
// const bannerText = `// ==UserScript==
// // @name         Global Custom IME & Link Memo
// // @namespace    http://tampermonkey.net/
// // @version      1.0.0
// // @description  全ドメイン対応のカスタムIMEとLinkMemo
// // @author       You
// // @match        *://*/*
// // @grant        GM_setValue
// // @grant        GM_getValue
// // @grant        GM_deleteValue
// // @grant        GM_addValueChangeListener
// // @run-at       document-end
// // ==/UserScript==
// `

const isWatch = process.argv.includes("--watch") // --watch オプションの有無
const dist = process.argv.includes("--dist") // --watch オプションの有無

// .envになければ ./dist
const distDir = dist ? "./dist" : process.env.SCRIPT_DIR || "./dist"

async function run() {
  const entryPoints = globSync("src/*.ts")

  // 1. 共通の設定オブジェクトを作成
  const options = {
    entryPoints,
    bundle: true,
    outdir: distDir,
    // format: "esm",
    format: "iife",
    // banner: { js: bannerText },
    platform: "browser", // ★1: ブラウザ環境向けであることを明示
    mainFields: ["browser", "module", "main"], // ★2: package.json の "browser" フィールドを優先
    define: {
      "process.env.NODE_ENV": '"production"', // ★3: ライブラリ内の process 参照エラーを防止
    },
    // plugins: [tsconfigPathsPlugin()],
  }

  if (isWatch) {
    // 2. ウォッチモードの場合は context を作成して watch() を実行
    console.log("⚡ Watch mode started...")
    const ctx = await esbuild.context({
      ...options,
    })
    await ctx.watch()
  } else {
    // 3. 通常ビルドの場合はそのまま build を実行
    await esbuild.build(options)
    console.log("✅ Build finished!")
  }
}

run().catch(err => {
  console.error("❌ Build failed with error:", err)
  process.exit(1)
})
