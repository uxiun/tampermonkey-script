export type Trigger = "doubleSpace" | "spaceOnLineStart"

export const imeConfigByHostname = {
  enabledByDefault: ["dlt.kitetu.com", "scrapbox.io", "dynalist.io"],
}

const disableRulesByHostname: Record<Trigger, string[]> = {
  doubleSpace: ["scrapbox.io"],
  spaceOnLineStart: ["scrapbox.io"],
}

export const triggerDef: Record<Trigger, (e: KeyboardEvent) => boolean> = {
  doubleSpace: e => {
    const value = getText(e.target as HTMLElement)
    if (typeof value !== "string") return false
    return (
      (value.endsWith(" ") || value.endsWith(" \n")) &&
      e.key === " " &&
      noModifiers(e)
    )
  },

  spaceOnLineStart: e => {
    if (e.key !== " ") return false
    const target = e.target as InputElement
    if (isEditableElement(target as HTMLElement)) {
      return target.selectionStart === 0 && noModifiers(e)
    }
    return false
  },
}

type InputElement = HTMLInputElement | HTMLTextAreaElement

export const triggerBlocked = (e: KeyboardEvent, trigger: Trigger) =>
  triggerDef[trigger](e) &&
  disableRulesByHostname[trigger].includes(window.location.hostname)

export const triggered = (e: KeyboardEvent, ...triggers: Trigger[]): boolean =>
  triggers.some(
    trigger =>
      !disableRulesByHostname[trigger].includes(window.location.hostname) &&
      triggerDef[trigger](e),
  )

// 1. 修飾キーがすべて false であること
export const noModifiers = (e: KeyboardEvent) =>
  !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey

export function getText(target: HTMLElement) {
  if (isHTMLInputElement(target)) {
    return target.value
  } else if (target.isContentEditable) {
    return target.textContent
  }
}

export const isEditableElement = (el: HTMLElement) =>
  el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable

export function isHTMLInputElement(el: HTMLElement): el is InputElement {
  return "setRangeText" in el && typeof (el as any).setRangeText === "function"
}
