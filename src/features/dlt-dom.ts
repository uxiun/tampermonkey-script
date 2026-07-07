import { linkSync } from "node:fs"
import { IdTitleMap, PostLink, removeDuplicateOrEmpty } from "./dlt-storage"
import { dbg } from "@/pure/utils"

const DLT_MY_ID = "7779"

type GetLinkOption = {
  limitOwn: boolean
}

type GetLinkElement = {
  type: "article" | "fg/bg"
  el: Element | undefined | null
}

export const getLinkAuto = (el: Element | undefined | null): PostLink[] => {
  if (!el) return []

  if (el.nodeName === "ARTICLE" && el.classList.contains("oln")) {
    const id = el?.getAttribute("data-kno")?.slice(2)
    const title = el
      ?.querySelector(":scope > .ikon > .knm")
      ?.getAttribute("data-src")

    return id && title ? [{ id, title }] : []
  } else if (el.nodeName === "A") {
    const id = el?.getAttribute("href")?.split("KNo.")[1]
    const title = el?.getAttribute("data-src")
    return id && title ? [{ id, title }] : []
  } else if (el.classList.contains("oln") && el.classList.contains("ikon")) {
    return getLinkAuto(el.querySelector(":scope > a.knm"))
  } else {
    return getLinkAuto(el.closest("article.oln"))
  }
}

const getLink = ({ type, el }: GetLinkElement): PostLink[] => {
  if (type === "article") {
    const id = el?.getAttribute("data-kno")?.slice(2)
    const title = el
      ?.querySelector(":scope > .ikon > .knm")
      ?.getAttribute("data-src")

    return id && title ? [{ id, title }] : []
  } else {
    const id = el?.getAttribute("href")?.split("KNo.")[1]
    const title = el?.getAttribute("data-src")
    return id && title ? [{ id, title }] : []
  }
}

type GetLinkTargetMainPage = "list" | "listsFg" | "listsBg"

type GetLinkTarget = GetLinkTargetMainPage | "opening" | "openingOtherSide"

export const getAllMyLinkFromPage = () => {
  const params = new URLSearchParams(window.location.search)
  const links =
    params.has("fg") || params.has("bg")
      ? getLinkOnFgBgPage()([
          "opening",
          "openingOtherSide",
          "list",
          "listsFg",
          "listsBg",
        ])
      : getLinkMainPage()(["list", "listsFg", "listsBg"])

  return links
}

export const getLinkMainPage =
  (option = { limitOwn: true } as GetLinkOption) =>
  (targets = ["list", "listsFg"] as GetLinkTarget[]) => {
    if (targets.includes("list")) {
      const links: PostLink[] = Array.from(
        document.querySelectorAll(
          `.pg > .bln${option.limitOwn ? ".I" : ""} > article`,
        ),
      ).flatMap(el => {
        let fgbg: PostLink[] = []
        if (targets.includes("listsFg")) {
          fgbg = [
            ...fgbg,
            ...Array.from(
              el
                .closest(".bln")
                ?.querySelectorAll(
                  `:scope > .oln.ikon${option.limitOwn ? ".I" : ""} > a.knm`,
                ) || [],
            ).flatMap(el => getLink({ type: "fg/bg", el })),
          ]
        }
        if (targets.includes("listsBg")) {
          fgbg = [
            ...fgbg,
            ...Array.from(
              el.querySelectorAll(
                `:scope > .bg > .oln${option.limitOwn ? ".I" : ""} > a.knm`,
              ),
            ).flatMap(el => getLink({ type: "fg/bg", el })),
          ]
        }

        return [...getLink({ type: "article", el }), ...fgbg]
      })

      return removeDuplicateOrEmpty(links)
    }

    return []
  }

// Element to data
export const getLinkOnFgBgPage =
  (option = { limitOwn: true } as GetLinkOption) =>
  (targets = ["opening", "list", "listsFg", "listsBg"] as GetLinkTarget[]) => {
    let links: PostLink[] = []

    if (targets.includes("opening")) {
      const el = document.querySelector(
        `.bln.hng${option.limitOwn ? ".I" : ""} > article`,
      )
      links = [...links, ...getLink({ type: "article", el })]
    }
    if (targets.includes("openingOtherSide")) {
      const ls = Array.from(
        document.querySelectorAll(
          `.bln.hng${option.limitOwn ? ".I" : ""} > .oln${option.limitOwn ? ".I" : ""} > .knm`,
        ),
      ).flatMap(el => getLink({ type: "fg/bg", el }))

      links = [...links, ...ls]
    }

    links = [...links, ...getLinkMainPage(option)(targets)]

    return removeDuplicateOrEmpty(links)
  }

export const getLinkFromFgBg = (limitOwn = true) => {
  const links: PostLink[] = Array.from(
    document.querySelectorAll("a.knm[href][data-src]"),
  ).flatMap(el =>
    getLink({
      type: "fg/bg",
      el,
    }),
  )

  return limitOwn ? links.filter(({ id }) => id.startsWith(DLT_MY_ID)) : links
}

export const getLinkFromArticle = (limitOwn = true): PostLink[] =>
  Array.from(
    document.querySelectorAll(
      `.pg > .bln${limitOwn ? ".I" : ""} > article.mg.oln`,
    ),
  ).flatMap(el => getLink({ el, type: "article" }))

// DOM to Element

const getArticles = () => {
  return document.querySelectorAll(".pg > .bln article.mg.oln")
}
