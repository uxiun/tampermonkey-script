import { removePrefix } from "@/pure/utils"
import { linkIdText, PostLink } from "./dlt-storage"
import { Cand } from "./ime"

export interface CandidateLinkOption {
  withId: boolean // default: true
  withFg: boolean // default: true
  fgFontSize: string
  titleFontSize: string
  wrapTitle: boolean // default: false
  fgLengthMax: number
}

export const candidateLink = (
  idToLinkMap: Map<string, PostLink>,
  cand: PostLink,
  isSelected = false,
  option?: Partial<CandidateLinkOption>,
) => {
  // const bg = isSelected ? "#313244" : "rgba(24, 24, 37, 0.88)"
  const bg = isSelected ? "rgb(204, 230, 255)" : "rgba(24, 24, 37, 0.88)"
  const border = isSelected
    ? "1px solid #89b4fa"
    : "1px solid rgba(69, 71, 90, 0.6)"
  const boxShadow = isSelected
    ? "0 4px 14px rgba(137, 180, 250, 0.35)"
    : "0 2px 6px rgba(0,0,0,0.3)"

  // 親（fg）タイトルの取得（重複排除）
  const rawFgTitles = (cand.fg || [])
    .map(fgId => idToLinkMap.get(fgId)?.title)
    .filter((title): title is string => Boolean(title))

  const fgTitles = Array.from(new Set(rawFgTitles)).slice(
    0,
    option?.fgLengthMax,
  )

  const fgHtml =
    option?.withFg === false || fgTitles.length === 0
      ? ""
      : `<div style="font-size: ${option?.fgFontSize ?? "14px"}; color: ${isSelected ? "rgb(33, 95, 175)" : "#89b4fa"}; margin-bottom: 2px; white-space: nowrap; ${isSelected ? "font-weight: bold;" : ""}">
                ${fgTitles.join("｜")}
               </div>`

  return `
    <div style="flex: 0 1 auto; min-width: 0; overflow: hidden; padding: 5px 7px; background: ${bg}; border: ${border}; border-radius: 6px; box-shadow: ${boxShadow}; backdrop-filter: blur(4px); transition: all 0.08s ease; max-width: 100%;">
      ${fgHtml}
      <div style="color: ${isSelected ? "rgb(19, 24, 41)" : "#cdd6f4"}; ${option?.wrapTitle ? "" : "white-space: nowrap; text-overflow: ellipsis; overflow: hidden;"} font-size: ${option?.titleFontSize ?? "17px"};">
      ${
        // 文字列埋め込みは危険&バグる
        option?.withId === false
          ? `<span>${cand.title}</span>`
          : `<span style="margin-right: 5px">${cand.title}</span>
        <span style="font-size: 10px; font-family: monospace; opacity: .5;">${linkIdText(cand)}</span>
        `
      }
      </div>
    </div>
        `
}

export interface CandidateOption {
  fontSize: {
    text?: string
    above?: string
    below?: string
    aside?: string
  }
  fontFamily: {
    text?: string
    above?: string
    below?: string
    aside?: string
  }

  // color: {
  //   text?: string
  //   above?: string
  //   below?: string
  // }

  // colorSelected: {
  //   text?: string
  //   above?: string
  //   below?: string
  // }
}

const pinyinDisplay = (cand: Cand, isSelected: boolean) => {
  const hans =
    cand.v.type === "zhcode"
      ? cand.v.hans
      : cand.v.type === "zhword"
        ? cand.v.v.hans
        : []

  const toneColors = [
    ["rgb(85, 81, 81)", "rgb(219, 219, 219)"],
    ["rgb(255, 56, 56)", "rgb(255, 139, 139)"],
    ["rgb(148, 0, 141)", "rgb(229, 124, 255)"],
    ["rgb(33, 95, 175)", "rgb(137, 180, 250)"],
    ["rgb(11, 141, 11)", "rgb(139, 255, 178)"],
  ]

  const pinyinSpan = (pinyin: string, isSelected: boolean) => {
    let tone = 0
    const n = pinyin.at(-1)
    if (n) {
      const t = parseInt(n, 10)
      if (!Number.isNaN(tone)) tone = t
    }

    const [selected, notselected] = toneColors.at(tone) ?? toneColors[0]

    const color = isSelected ? selected : notselected

    return `
      <span style="
        color: ${color};
      ">
        ${pinyin}
      </span>
    `
  }

  return hans.map(h => pinyinSpan(h.pinyins[0], isSelected))
}

export const candidateTip = (
  // text: string,
  // aboveTexts: string[],
  // belowTexts: string[],
  cand: Cand,
  isSelected = false,
  buffer?: string,
  option?: Partial<CandidateOption>,
  aside?: string,
) => {
  const remCode = cand.suffix
    ? `(${cand.suffix})`
    : removePrefix(buffer ?? "", cand.code)

  const belowTexts =
    cand.v.type === "zhcode" || cand.v.type === "zhword"
      ? [
          (cand.v.type === "zhcode" ? cand.v.hans : cand.v.v.hans)
            .map(h => h.pinyins.at(0))
            .join(" "),
        ]
      : []

  const aboveTexts = [remCode]

  const defaultOption: CandidateOption = {
    fontSize: {
      text: "17px",
      above: "17px",
      below: "14px",
    },
    fontFamily: {
      above: "Iosevka NF Regular, monospace",
    },
  }

  const bg = isSelected ? "rgb(204, 230, 255)" : "rgba(24, 24, 37, 0.88)"
  const border = isSelected
    ? "1px solid #89b4fa"
    : "1px solid rgba(69, 71, 90, 0.6)"
  const boxShadow = isSelected
    ? "0 4px 14px rgba(137, 180, 250, 0.35)"
    : "0 2px 6px rgba(0,0,0,0.3)"

  const mergedOption = {
    ...defaultOption,
    ...option,
  }

  const aboveHtml =
    aboveTexts.length === 0
      ? ""
      : `<div style="
      ${mergedOption.fontSize?.above ? `fontSize: ${mergedOption.fontSize.above};` : ""}
      ${mergedOption?.fontFamily?.above ? `font-family: ${mergedOption.fontFamily.above};` : ""}
      color: ${isSelected ? "rgb(33, 95, 175)" : "#89b4fa"};
      margin-bottom: 2px;
      white-space: nowrap;
      ${isSelected ? "font-weight: bold;" : ""}">
                ${aboveTexts.join("｜")}
               </div>`

  const belowContent =
    cand.v.type === "zhcode" || cand.v.type === "zhword"
      ? pinyinDisplay(cand, isSelected)
      : []

  const belowHtml =
    belowContent.length === 0
      ? ""
      : `<div style="
      ${mergedOption.fontSize?.below ? `font-size: ${mergedOption.fontSize.below};` : ""}
      ${mergedOption?.fontFamily?.below ? `font-family: ${mergedOption.fontFamily.below};` : ""}
      color: ${isSelected ? "rgb(33, 95, 175)" : "#89b4fa"};
      margin-bottom: 2px;
      white-space: nowrap;
      ${isSelected ? "font-weight: bold;" : ""}">
                ${belowContent.join("")}
          </div>`

  return `
    <div style="flex: 0 1 auto; min-width: 0; overflow: hidden; padding: 5px 7px; background: ${bg}; border: ${border}; border-radius: 6px; box-shadow: ${boxShadow}; backdrop-filter: blur(4px); transition: all 0.08s ease; max-width: 100%;">
      ${aboveHtml}
      <div style="color: ${isSelected ? "rgb(19, 24, 41)" : "#cdd6f4"}; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;

      ">
        <span style="
          margin-right: 5px;
          ${mergedOption?.fontSize.text ? `font-size: ${mergedOption.fontSize.text};` : ""}
          ${mergedOption?.fontFamily.text ? `font-family: ${mergedOption.fontFamily.text};` : ""}
        ">
          ${cand.text}
        </span>
        ${
          aside
            ? `
          <span style="
        font-size: ${option?.fontSize?.aside ?? defaultOption.fontSize.aside};
        ${defaultOption?.fontFamily?.aside ? `font-family: ${defaultOption.fontFamily.aside};` : ""}
        opacity: .8;
        ">${aside}</span>
          `
            : ""
        }
      </div>
      ${belowHtml}
    </div>
  `
}
