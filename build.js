import "dotenv/config"
import * as esbuild from "esbuild"
import { globSync } from "node:fs"
import { tsconfigPathsPlugin } from "esbuild-plugin-tsconfig-paths"

const isWatch = process.argv.includes("--watch") // --watch オプションの有無
const dist = process.argv.includes("--dist") // --watch オプションの有無

// .envになければ ./dist
const distDir = dist ? "./dist" : process.env.AC_DIST_DIR || "./dist"

async function run() {
  const entryPoints = globSync("src/*.ts")

  // 1. 共通の設定オブジェクトを作成
  const options = {
    entryPoints,
    bundle: true,
    outdir: distDir,
    format: "esm",
    plugins: [tsconfigPathsPlugin()],
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
