import { linkIdText, PostLink } from "./dlt-storage"

export interface CandidateTipOption {
  withId: boolean // default: true
  withFg: boolean // default: true
  fgFontSize: string
  titleFontSize: string
  wrapTitle: boolean // default: false
  fgLengthMax: number
}

export const candidateTip = (
  idToLinkMap: Map<string, PostLink>,
  cand: PostLink,
  isSelected = false,
  option?: Partial<CandidateTipOption>,
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
