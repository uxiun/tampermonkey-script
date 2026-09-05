import { isInput, removePrefix } from "@/pure/utils"
import { getPopupPosition } from "@/pure/dom"
import { KeyManager } from "@/pure/key"
import { showToast, showToastAt } from "@/pure/component"
import { kana, KANA_TABLE, katakana } from "@/pure/table"
import { getSuffixes } from "./keys"

import {
  Cand,
  getHans,
  globalImeState,
  hanziInfo,
  InlineSuggestPopup,
  multiZaociPrompt,
  putWordsIDB,
  Schema,
  zaoci,
} from "@/features/ime"

type InputElement = HTMLInputElement | HTMLTextAreaElement

export const onTabLoadIME = async () => {
  if ((window as any).__ac_ime__) return
  ;(window as any).__ac_ime__ = true
  console.log("IME on tab load")

  const state = globalImeState
  const inlinePopup = new InlineSuggestPopup()
  state.cache.init()

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
        state.cache.updateWord({
          ...z.word,
          zh: z.word.zh.replaceAll(/\$space/, " "),
          schema: state.schema,
          code,
        })

        if (a && else_code && code === z?.word.code) {
          state.cache.updateWord({
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

  window.addEventListener("focusout", e => {})

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

      if (e.ctrlKey && e.key === "o") {
        if (state.candidates.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const selected = state.candidates.at(state.selectedIndex)
          showToast(JSON.stringify(selected))
          console.log(selected)
        }
      }

      if (e.ctrlKey && e.key === ";") {
        e.preventDefault()
        e.stopImmediatePropagation()
        multiZaociPrompt()
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
            if (c.v.type === "zhcode" || c.v.type === "zhword") c.v.v.nth = nth
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

    // console.log("state.candidates", state.candidates)
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
          : cand.v.type === "zhword"
            ? !cand.suffix
              ? state.schema === "cqkm"
                ? cand.v.v.hans.map(h => h.cqkmForm.slice(2)).join("")
                : state.schema === "cqkmxy"
                  ? cand.v.v.hans.map(h => h.cqkmForm.slice(3)).join("")
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
}
