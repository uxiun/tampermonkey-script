import { isInput, removePrefix } from "@/pure/utils"
import { getPopupPosition } from "@/pure/dom"
import { KeyManager } from "@/pure/key"
import { showToast, showToastAt } from "@/pure/component"
import { kana, KANA_TABLE, katakana } from "@/pure/table"
import { getSuffixes } from "./keys"

import {
  Cand,
  candIsEqual,
  getGlobalImeState,
  Hanzi,
  // getHans,
  // globalImeState,
  hanziInfo,
  imeInitializeGM,
  InlineSuggestPopup,
  multiZaociPrompt,
  // putWordsIDB,
  Schema,
  zaoci,
  ZhCode,
  ZhWord,
} from "@/features/ime"
import { exportWordsBackup } from "./ime-storage"
import { closeLinkMemo } from "./dlt-link-memo"

type InputElement = HTMLInputElement | HTMLTextAreaElement

export const onTabLoadIME = async () => {
  if ((window as any).__ac_ime__) return
  ;(window as any).__ac_ime__ = true
  // ;(window as any).__ime_state__ = globalImeState

  console.log("onTabLoadIME")
  // const state = globalImeState
  const state = getGlobalImeState()

  console.log("renamed globalImeState as state")
  const inlinePopup = new InlineSuggestPopup()
  await state.cache.init()
  console.log("just after state.cache.init()")

  const keyManager = new KeyManager(40, committedChord => {
    if (!state.active && isInput()) {
      if (committedChord[0] === " " && committedChord[1] === "j") {
        setText("", state.startPos - 2, state.startPos)
        setState.activate()
        showToast("IME ON")
        return
      }
    }

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

  const lastZhSchema = () =>
    state.schemaHistory.findLast(s => s !== "hiragana" && s !== "katakana")

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
        await state.cache.updateWord({
          ...z.word,
          zh: z.word.zh.replaceAll(/\$space/g, " "),
          schema: state.schema,
          code,
        })

        if (a && else_code && code === z?.word.code) {
          await state.cache.updateWord({
            ...z.word,
            zh: z.word.zh,
            schema: a,
            code: else_code,
          })
        }
      }
    } else {
      zaociPrompt(i)
    }
  }

  window.addEventListener("focusout", e => {
    setState.resetBuffer()
  })

  window.addEventListener(
    "keyup",
    e => {
      keyManager.onkeyup(e)

      // if (!state.active) {
      //   if (keyManager.isModifierLRPressed.ShiftLeft) {

      //   }
      // }

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
          setState.resetBuffer()
          return
        }
      }

      if (keyManager.isModifierLRPressed.ShiftRight) {
        if (state.candidates.length > 0) {
          const select = state.candidates[state.selectedIndex]
          if (select.v.type === "zhcode") {
            showToast("単漢字は編集できません")
            return
          } else if (select.v.type === "zhword") {
            const code = prompt("修正綴", select.code)
            if (!code) return
            state.cache.updateWord({ ...select.v.v, code })
          }
        } else if (state.buffer.length === 0) {
          zaociPrompt(2)
        }
      }
    },
    true,
  ) // capture phase じゃないと stopPropagation で潰されて届かない

  console.log("set keyup listener")

  window.addEventListener(
    "keydown",
    async e => {
      keyManager.onkeydown(e)

      const target = e.target as InputElement

      if (!state.active) {
        const value = getText(e.target as HTMLElement)
        // console.log(value?.at(state.startPos))
        // console.log(`"${value?.slice(0, state.startPos)}`)
        const doubleSpaced =
          typeof value === "string" &&
          (value.length === 0 ||
            value.endsWith(" ") ||
            value.endsWith(" \n")) &&
          e.key === " "

        if ((isInput() && e.ctrlKey && e.key === "j") || doubleSpaced) {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (doubleSpaced) {
            console.log("doubleSpaced!")
            e.target?.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Backspace",
                code: "Backspace",
                bubbles: true,
                cancelable: true,
              }),
            )
            // if (value.endsWith(" ")) setText("", value.length - 1, value.length)
            // else setText("", value.length - 2, value.length)
          }
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

      if (e.ctrlKey && e.key === "k") {
        e.preventDefault()
        e.stopImmediatePropagation()
        runCommandPrompt()
      }

      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        if (state.buffer.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setState.resetBuffer()
        }
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
          } else if (select.v.type === "zhword") {
            const code = prompt("修正綴", select.code)
            if (!code) return
            state.cache.updateWord({
              ...select.v.v,
              code,
            })
          }
        } else if (state.buffer.length === 0) {
        }
        return
      }

      if (e.ctrlKey && (e.key === " " || e.key === "i")) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSchema("hiragana")
        return
      }

      if (e.ctrlKey && e.key === "Backspace") {
        if (state.candidates.length > 0) {
          setState.resetBuffer()
        } else if (isAfterIMEInput(target)) {
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
        return
      }

      if (e.ctrlKey && e.key === "o") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const selected = state.candidates.at(state.selectedIndex)
          showToast(JSON.stringify(selected))
          console.log(selected)
        }
        return
      }

      if (e.ctrlKey && e.shiftKey && e.key === "o") {
        e.preventDefault()
        e.stopImmediatePropagation()
        await exportWordsBackup()
        return
      }

      if (e.ctrlKey && e.key === ";") {
        e.preventDefault()
        e.stopImmediatePropagation()
        multiZaociPrompt()
        return
      }
      if (e.ctrlKey && e.key === "d") {
        if (state.buffer.length === 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          multiZaociPrompt("set user true", lastNInputText(2))
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
      if (e.ctrlKey && e.shiftKey && e.key === "f") {
        e.preventDefault()
        e.stopImmediatePropagation()
        await addCodeHanziPrompt()
        return
      }

      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      // 以下は全て単打

      if (e.key === ";") {
        e.preventDefault()
        e.stopImmediatePropagation()
        await zaociPrompt(2)
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
            state.selectedIndex =
              i % Math.min(state.selectedIndexMax, state.candidates.length)
          }
          if (e.key === "ArrowUp") {
            const i = state.selectedIndex - 1
            state.selectedIndex =
              i % Math.min(state.selectedIndexMax, state.candidates.length)
          }
          renderWidget()
        }
        return
      }

      if (e.key === "Tab") {
        if (state.buffer.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          // setState.resetBuffer()
          setState.diactivate()
          showToast("IME OFF")
        }
        return
      }
      if (e.key === "Escape" && state.buffer.length > 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setState.resetBuffer()
        // ;(e.target as HTMLElement).focus()
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

  console.log("set keydown listener")

  function renderWidget() {
    if (!state.active || !state.target || state.candidates.length === 0) {
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
      // 同じ入力コード（code）を持つ候補だけを抽出
      const sameCodeCands = state.candidates.filter(c => c.code === cand.code)
      const selectedCand = state.candidates[state.selectedIndex]

      if (selectedCand && selectedCand.code === cand.code) {
        // 選択された候補を先頭にし、それ以外を後ろに並べ替える
        const reordered = [
          selectedCand,
          ...sameCodeCands.filter(c => c.text !== selectedCand.text),
        ]

        // 新しい順序に基づいて nth (0, 1, 2...) を割り当てる
        const updatedItems: (ZhCode | ZhWord)[] = []

        reordered.forEach((c, index) => {
          if (c.v.type === "zhcode" || c.v.type === "zhword") {
            c.v.v.nth = index // ★ 先頭が 0、次が 1, 2... と一意な連番になる
            updatedItems.push(c.v.v)
          }
        })

        // キャッシュ・ストレージの更新
        for (const item of updatedItems) {
          if ("schema" in item) {
            // 型判定に応じて適切な更新関数を呼ぶ
            state.cache.updateWord(item as ZhWord)
          } else {
            state.cache.updateCode(item as ZhCode)
          }
        }
        state.cache.resort(state.buffer)
      }
    }

    setState.resetBuffer()

    // if (
    //   state.schema === "cj5" ||
    //   state.schema === "cqkm" ||
    //   state.schema === "cqkmxy"
    // ) {
    //   const hans = state.cache.getHans(cand.text)
    //   coords.top -= coords.lineHeight + 32
    //   coords.left -= 5

    //   showToastAt(hans.map(hanziInfo).join("  "), coords, 3000, 299999)
    // }
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

  function isHTMLInputElement(
    el: HTMLElement,
  ): el is HTMLInputElement | HTMLTextAreaElement {
    return (
      "setRangeText" in el && typeof (el as any).setRangeText === "function"
    )
  }

  function getText(target: HTMLElement) {
    if (isHTMLInputElement(target)) {
      return target.value
    } else if (target.isContentEditable) {
      return target.textContent
    }
  }

  function setText(text: string, start?: number, end?: number) {
    const target = state.target
    if (!target) return

    // 1. 標準の input / textarea の場合
    if (isHTMLInputElement(target)) {
      target.setRangeText(
        text,
        start ?? state.startPos,
        end ?? state.endPos,
        "end",
      )
      target.dispatchEvent(new Event("input", { bubbles: true }))
      state.startPos = target.selectionStart ?? 0
      state.endPos = target.selectionEnd ?? 0
      return
    }

    // 2. Dynalist 等の ContentEditable 要素の場合
    if (target.isContentEditable) {
      target.focus()

      // ブラウザの Selection API で選択範囲を取得・操作する
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        // 選択されている（または変換対象の）テキストを削除して挿入
        // ※ execCommand("insertText") を使うと Undo (Ctrl+Z) 履歴が壊れず安全です
        const success = document.execCommand("insertText", false, text)

        // execCommand が非推奨で動かない環境向けのフォールバック (Range API)
        if (!success) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          const textNode = document.createTextNode(text)
          range.insertNode(textNode)

          // カーソルを挿入したテキストの直後に移動
          range.setStartAfter(textNode)
          range.setEndAfter(textNode)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      } else {
        // キャレットがない場合は末尾に追加
        target.textContent += text
      }

      // 変更イベントを通知（Dynalist 側に文字入力を認識させる）
      target.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      )
    }
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

    // const lastCandidates: Cand[] = []

    const filtered: Cand[] = []
    const needSuffix: Cand[] = []
    const remained: Cand[] = []
    state.candidates
      .filter(c => c.suffix?.text.length !== 0)
      .forEach(cand => {
        const bufferSuffix = state.buffer.slice(cand.suffix?.start ?? 0)
        const rem = removePrefix(bufferSuffix, cand.suffix?.text ?? cand.code)
        if (rem.length === 0) needSuffix.push(cand)
        else if (cand.suffix && rem.length < cand.suffix.text.length)
          filtered.push(cand)
        // else if (cand.suffix?.text.length === 0) {
        // return
        // }
        else remained.push(cand)
      })

    console.log("buffer:", state.buffer)
    console.log({
      filtered,
      needSuffix,
      remained,
    })
    const searched = await state.cache.prefixSearch(state.schema, state.buffer)
    let candidates: Cand[] = []

    if (needSuffix.length < 2) {
      candidates = [...filtered, ...needSuffix]
    } else {
      const suffixes = getSuffixes(
        state.buffer ?? "",
        [...filtered, ...remained],
        needSuffix.length - 1,
      )
      console.log({ suffixes })

      const suffixed = applySuffixes(needSuffix, suffixes)
      console.log({ suffixed })
      candidates = [...filtered, ...suffixed]
    }

    for (const c of searched) {
      if (candidates.every(cand => !candIsEqual(cand, c))) candidates.push(c)
    }

    console.log("candidates", candidates)
    state.selectedIndex = 0

    if (candidates.length === 0) {
      if (state.candidates.length === 0) {
        setState.resetBuffer()
      } else {
        // 1. 最後の打鍵（最後の1文字）を退避
        const lastChar = state.buffer.slice(-1)

        // 2. 現在の候補をコミット（※ commit() 内部で resetBuffer されても OK なようにする）
        commit()

        // 3. 退避しておいた1文字を新しいバッファとしてセット
        state.buffer = lastChar
        state.candidates = [] // 古い候補をリセット

        // 4. 新しいバッファで再検索＆レンダリングを再行
        await updateCandidateRender()
        return
      }
    } else if (candidates.length === 1) {
      state.candidates = candidates
      commit()
    } else {
      state.candidates = candidates
    }
    renderWidget()
  }

  const applySuffixes = (candidates: Cand[], suffixes: string[]): Cand[] =>
    candidates.map((cand, i) => {
      const suffix =
        i === 0
          ? cand.v.type === "zhword" && !cand.suffix
            ? state.schema === "cqkm"
              ? state.cache
                  .getHans(cand.text)
                  .map(h => h.cqkmForm?.slice(2))
                  .join("")
              : state.schema === "cqkmxy"
                ? state.cache
                    .getHans(cand.text)
                    .map(h => h.cqkmForm?.slice(3))
                    .join("")
                : suffixes.pop()
            : ""
          : cand.v.type === "zhword"
            ? !cand.suffix
              ? state.schema === "cqkm"
                ? state.cache
                    .getHans(cand.text)
                    .map(h => h.cqkmForm?.slice(2))
                    .join("")
                : state.schema === "cqkmxy"
                  ? state.cache
                      .getHans(cand.text)
                      .map(h => h.cqkmForm?.slice(3))
                      .join("")
                  : suffixes.pop()
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

  const addCodeHanziPrompt = async () => {
    const isCode = confirm("あなたが登録したいのは Code？ それとも漢字？")
    const zh = prompt(isCode ? "Codeの表記漢字" : "追加したい漢字")
    if (!zh) return

    if (isCode) {
      const code = prompt("入力コード")
      if (!code) return
      const c: ZhCode = {
        code,
        date: new Date(),
        nth: 0,
        on: true,
        schema: state.schema,
        user: true,
        zh,
      }
      state.cache.updateCode(c)
    } else {
      const pinyins = prompt("pin1yin1s 空白区切り")
      const cj5Text = prompt("cj5 codes 空白区切り")
      const cqkmForm = prompt("cqkmForm 3文字")
      const cqkmInitials = prompt("cqkmInitials 空白区切り")

      const h: Hanzi = {
        zh,
        date: new Date(),
        on: true,
        user: true,
        cj5: cj5Text?.split("/\s/+") ?? [],
        cqkmForm,
        pinyins: pinyins?.split("\s+") ?? [],
        cqkmInitials: cqkmInitials?.split("\s+") ?? [],
      }

      state.cache.updateHanzi(h)
    }
  }
}

export const runCommandPrompt = async () => {
  const command = prompt("command:")
  if (!command) return
  runCommand(command)
}

export const runCommand = async (command: string) => {
  switch (command) {
    case "zaoci": {
      const zh = prompt("追加する際の綴を確認したい単語")
      if (!zh) return
      const word = await zaoci("cqkm", zh)
      console.log("zaoci result:", word)
      break
    }
    case "init ime": {
      let ok = confirm("IMEに必要な情報の初期化を始めます")
      if (!ok) return
      await imeInitializeGM("hans")
      ok = confirm("先程の処理は成功した？")
      if (!ok) return
      await imeInitializeGM("codes")
      ok = confirm("先程の処理は成功した？")
      if (!ok) return
      await imeInitializeGM("words")
      break
    }

    case "init ime word": {
      await imeInitializeGM("words")
      break
    }

    case "delete chunks": {
      console.log("削除を開始します...")

      // 0〜100 までの chunk を削除（十分な数を指定）
      for (let i = 0; i < 100; i++) {
        await GM_deleteValue(`words_chunk_${i}`)
      }
      // 単語数管理用のキーも削除
      await GM_deleteValue("words_chunk_count")
      await GM_deleteValue("gm_ime_words")

      console.log("削除完了。確認を行います:")
      for (let i = 0; i < 5; i++) {
        const key = `words_chunk_${i}`
        const res = await GM_getValue(key)
        console.log(`[CHECK] ${key}:`, res ?? "undefined (正常に削除済み)")
      }
      break
    }

    case "check deleted": {
      for (let i = 0; i < 10; i++) {
        const key = `words_chunk_${i}`
        const res = await GM_getValue(key)
        console.log(`[CHECK] ${key}:`, res)
      }
      break
    }

    case "delete key": {
      const text = prompt("消したい GM keyを（カンマ区切りで）")
      if (!text) return
      const keys = text.split(",").map(key => key.trim())
      console.log("消す GM keys:", keys)

      for (const key of keys) {
        await GM_deleteValue(key)
      }

      console.log("消せたか確認")
      for (const key of keys) {
        const res = await GM_getValue(key)
        console.log(`GM_getValue("${key}"):`, res ?? "undefined (削除済み)")
      }
      break
    }
  }
}
