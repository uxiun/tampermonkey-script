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
  private isModifierLRDown: Record<ModifierLR, boolean> = modifierLRboolDefault
  isModifierLRPressed: Record<ModifierLR, boolean> = modifierLRboolDefault

  private chordWindowMs: number
  private pressedKeys: Map<string, number> = new Map()
  private chord: Key[] = []
  private chords: Key[][] = []

  constructor(chordWindowMs: number) {
    this.chordWindowMs = chordWindowMs
  }

  onkeyup(e: KeyboardEvent) {
    this.modifierLRUp(e)
  }

  onkeydown(e: KeyboardEvent) {
    this.modifierLRDown(e)
    const now = performance.now()
    this.pressedKeys.set(e.key, now)

    setTimeout(() => {
      this.checkChords(now)
    }, this.chordWindowMs)
  }

  private checkChords(triggerTime: number): void {
    // 最初のキーが押された時間から windowMs 以内に押されたキーを抽出
    for (const [key, time] of this.pressedKeys.entries()) {
      if (Math.abs(time - triggerTime) <= this.chordWindowMs) {
        this.chord.push(key as Key)
      }
    }

    // 2つ以上のキーが同時に押されていた場合
    if (this.chord.length >= 2) {
      this.chords.push(this.chord)

      // 判定済みのキーをクリアしたい場合はここで削除（用途に合わせて調整）
      this.chord.forEach(key => this.pressedKeys.delete(key))
    }
  }

  private resetIsModifierLRDown() {
    this.isModifierLRDown = modifierLRboolDefault
  }

  private modifierLRUp(e: KeyboardEvent) {
    if (e.code === "AltLeft") {
      if (this.isModifierLRDown.AltLeft) this.isModifierLRPressed.AltLeft = true
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
      this.resetIsModifierLRDown()
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
      this.resetIsModifierLRDown()
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
