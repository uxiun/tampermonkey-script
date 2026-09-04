import {
  getAllCodesFromIDB,
  getAllHansFromIDB,
  ZhCode,
  ZhWord,
} from "@/features/ime"

export type Key =
  | "q"
  | "w"
  | "e"
  | "r"
  | "t"
  | "y"
  | "u"
  | "i"
  | "o"
  | "p"
  | "a"
  | "s"
  | "d"
  | "f"
  | "g"
  | "h"
  | "j"
  | "k"
  | "l"
  | ";"
  | "z"
  | "x"
  | "c"
  | "."
  | "b"
  | ","
  | "m"
  | "n"
  | "v"
  | " "
  | "-"
  | "Enter"
  | "Escape"
  | "Tab"
  | "Backspace"
  | "ZenkakuHankaku"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"

export type Modifier = "Ctrl" | "Alt" | "Shift"

type ModifierLR =
  | "CtrlLeft"
  | "CtrlRight"
  | "AltLeft"
  | "AltRight"
  | "ShiftLeft"
  | "ShiftRight"

interface ModifiedKey {
  modifiers: ModifierLR[]
  key: Key
}

export type Single = Key | Key[] | ModifiedKey

export const isModifiedKey = (e: KeyboardEvent, m: ModifiedKey) =>
  m.modifiers.every(m => isModifier(e, m as Modifier)) && m.key === e.key

const modifierLRboolDefault: Record<ModifierLR, boolean> = {
  AltLeft: false,
  AltRight: false,
  CtrlLeft: false,
  CtrlRight: false,
  ShiftLeft: false,
  ShiftRight: false,
}

export class KeyManager {
  isModifierLRPressed: Record<ModifierLR, boolean> = {
    ...modifierLRboolDefault,
  }
  private isModifierLRDown: Record<ModifierLR, boolean> = {
    ...modifierLRboolDefault,
  }
  private isModifierOnlyCandidate = false
  private maxTapIntervalMsec = 300 // 単打とみなす上限ミリ秒
  private lastKeyDownTime = 0

  chord: Key[] = []
  private chordWindowMs: number
  private timer: number | null = null
  private onCommitChord: (chord: Key[]) => void

  // private pressedKeys: Map<string, number> = new Map()

  // chords: Key[][] = []

  constructor(chordWindowMs: number, onCommitChord: (chord: Key[]) => void) {
    this.chordWindowMs = chordWindowMs
    this.onCommitChord = onCommitChord
  }

  onkeyup(e: KeyboardEvent) {
    this.modifierLRUp(e)
  }

  onkeydown(e: KeyboardEvent) {
    if (e.repeat) {
      this.resetIsModifier()
      return
    }

    this.modifierLRDown(e)
    this.lastKeyDownTime = performance.now()
  }

  onkeydownChord(e: KeyboardEvent) {
    if (e.repeat) return
    const key = e.key as Key

    // 既存のタイマーをクリアして打鍵を追加
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.chord.push(key)

    // 2打鍵に達した場合は即時確定（例: 2打鍵まで simultaneous の場合）
    if (this.chord.length >= 2) {
      this.flush()
      return
    }

    // 1打鍵目の場合は、chordWindowMs だけ待ってから単打として確定
    this.timer = window.setTimeout(() => {
      this.flush()
    }, this.chordWindowMs)
  }

  private flush() {
    if (this.chord.length > 0) {
      const currentChord = [...this.chord]
      this.chord = []
      if (this.timer !== null) {
        clearTimeout(this.timer)
        this.timer = null
      }
      // 確定した chord を IME 側のコールバックに通知！
      this.onCommitChord(currentChord)
    }
  }

  // IMEがオフになった時などのリセット用
  reset() {
    this.chord = []
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // private checkChords(triggerTime: number): void {
  //   // 最初のキーが押された時間から windowMs 以内に押されたキーを抽出
  //   for (const [key, time] of this.pressedKeys.entries()) {
  //     if (Math.abs(time - triggerTime) <= this.chordWindowMs) {
  //       this.chord.push(key as Key)
  //     }
  //   }

  //   // 2つ以上のキーが同時に押されていた場合
  //   if (this.chord.length >= 2) {
  //     console.log("同時打鍵:", this.chord)
  //     this.chords.push(this.chord)

  //     // 判定済みのキーをクリアしたい場合はここで削除（用途に合わせて調整）
  //     this.chord.forEach(key => this.pressedKeys.delete(key))
  //     this.chord = []
  //   }
  // }

  private resetIsModifier() {
    this.isModifierLRDown = { ...modifierLRboolDefault }
    this.isModifierLRPressed = { ...modifierLRboolDefault }
  }

  private modifierLRUp(e: KeyboardEvent) {
    const duration = performance.now() - this.lastKeyDownTime

    if (this.isModifierOnlyCandidate && duration < this.maxTapIntervalMsec) {
      if (e.code === "AltLeft") {
        if (this.isModifierLRDown.AltLeft)
          this.isModifierLRPressed.AltLeft = true
      } else if (e.code === "AltRight") {
        if (this.isModifierLRDown.AltRight)
          this.isModifierLRPressed.AltRight = true
      } else if (e.code === "CtrlLeft") {
        if (this.isModifierLRDown.CtrlLeft)
          this.isModifierLRPressed.CtrlLeft = true
      } else if (e.code === "CtrlRight") {
        if (this.isModifierLRDown.CtrlRight)
          this.isModifierLRPressed.CtrlRight = true
      } else if (e.code === "ShiftLeft") {
        if (this.isModifierLRDown.ShiftLeft)
          this.isModifierLRPressed.ShiftLeft = true
      } else if (e.code === "ShiftRight") {
        if (this.isModifierLRDown.ShiftRight)
          this.isModifierLRPressed.ShiftRight = true
      } else {
        this.resetIsModifier()
      }
    }
  }

  private modifierLRDown(e: KeyboardEvent) {
    if (e.code === "AltLeft") {
      this.isModifierLRDown.AltLeft = true
    } else if (e.code === "AltRight") {
      this.isModifierLRDown.AltRight = true
    } else if (e.code === "CtrlLeft") {
      this.isModifierLRDown.CtrlLeft = true
    } else if (e.code === "CtrlRight") {
      this.isModifierLRDown.CtrlRight = true
    } else if (e.code === "ShiftLeft") {
      this.isModifierLRDown.ShiftLeft = true
    } else if (e.code === "ShiftRight") {
      this.isModifierLRDown.ShiftRight = true
    } else {
      this.resetIsModifier()
    }
  }
}

const isModifier = (e: KeyboardEvent, modifier: Modifier): boolean =>
  modifier === "Alt"
    ? e.altKey
    : modifier === "Ctrl"
      ? e.ctrlKey
      : modifier === "Shift"
        ? e.shiftKey
        : false
