import { sleep } from "@/pure/utils"
import { dltkeys } from "./keys"
import { applyAll, defineTerminalTarget, HintMap, linkHint } from "./link-hint"
import {
  nextVisValue,
  Visibility,
  VISIBILITY_JP,
  VISIBILITY_MAP,
} from "./dlt-storage"
import { showToast } from "@/pure/component"

export default async function togglePublicityDrw() {
  const btns = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#drw .upub button"),
  )
  const i = btns.findIndex(btn => btn.classList.contains("seld"))
  btns[i].classList.remove("seld")
  btns[(i + 1) % btns.length].classList.add("seld")

  // upub.click()
  // await sleep(200)

  // const mini = document.querySelector("#drw .upub.mini")
  // selectPubButton(nextVisValue(upub.value), mini)
  // document.querySelector<HTMLInputElement>("#drw input.knm")?.focus()
}

export function togglePublicity() {
  const hm: HintMap<null> = {
    targetElements: [
      defineTerminalTarget({
        type: "terminal",
        keys: dltkeys.easy,
        elements: () =>
          document.querySelectorAll<HTMLButtonElement>(".upub button"),
        action: async (el, state) => {
          el.click()
          await sleep(200)
          selectPubButton(
            nextVisValue(el.value),
            document.querySelector(".upub.mini"),
          )
        },
      }),
    ],
  }

  linkHint(hm, null)
}

export function setVisibilityAll(visibility: Visibility) {
  const value = VISIBILITY_MAP[visibility]
  const n = applyAll(
    {
      elements: () => [
        ...Array.from(document.querySelectorAll<HTMLDivElement>(".bln.hng")),
        ...Array.from(document.querySelectorAll<HTMLDivElement>(".pg > .bln")),
      ],
      action(el, count) {
        const btn = el.querySelector<HTMLButtonElement>(".upub button")
        if (!btn || btn.value === value) return
        btn.click()
        selectPubButton(value, el.querySelector(".upub.mini"))
        return count + 1
      },
    },
    0,
  )

  showToast(`${n}個の輪郭を${VISIBILITY_JP[visibility]}状態にしました`)
}

const selectPubButton = (value: string, mini: Element | null) => {
  if (!mini) return
  const buttons: HTMLButtonElement[] = Array.from(
    mini.querySelectorAll(":scope > button"),
  )
  const i = buttons.findIndex(b => b.value === value)

  buttons[i].click()
}
