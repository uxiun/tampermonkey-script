import { Cand } from "./ime"

export const KEYS = {
  l: "qwertasdfgzxc.b",
  r: "yuiophjkl;,mnv",
  l09: "fdsrewcxz",
  l10: "fdsrewcxzg",
  l11: "gfdsrewcxza",
  r09: "jkluiomnv",
  r10: "jkluiomnvh",
  r11: "hjkluiomnv;",
  easiest: "dkfjsleiruwoghtcm.,zvxnya;qpb",
  easiestCqkm: "dkfjsleiruwoghtcm.,zvxnyb",
  banned: "d   sleiruwo htcm ,zvxnya;qpb",
  fingers: [" ", "frtgc.bjuyh,m", "dexkin", "swzlov", "a;qp"],
}

const siteShortcut = {
  "dlt.kitetu.com": "nr/&",
}

const vimiumcKeys = {
  dlt: "dfgjk.mzo",
}

const autocontrolKeys = {
  dlt: "wv",
}

export const keyBlacklist =
  (blacklist: string) => (keySpec: keyof typeof KEYS) => {
    return typeof KEYS[keySpec] === "string"
      ? KEYS[keySpec].split("").filter(c => !blacklist.includes(c))
      : []
  }

export const dltkeys = {
  // easy: KEYS.easiest,
  easy: keyBlacklist(vimiumcKeys.dlt + autocontrolKeys.dlt)("easiest"),
  easyL: keyBlacklist(vimiumcKeys.dlt + KEYS.r)("easiest"),
  easyR: keyBlacklist(vimiumcKeys.dlt + KEYS.l)("easiest"),
}

const generateNkeys = (enoughCount: number, n: number, suffixes: string[]) => {
  let i = 0
  let count = 0
  while (i < n) {
    for (const suffix of suffixes) {
      for (const key of KEYS.easiest.split("")) {
        suffixes.push(suffix + key)
        count += 1
      }
    }
  }
}

const findRemainedSuffixes = (
  cands: Cand[],
  currentBuffer: string,
  minCount: number,
  srcKeys: string,
  n: number,
  suffixes: string[],
): string[] => {
  console.log({ minCount, suffixes })

  if (n > 4) return suffixes
  const used = new Set(
    cands.map(c => c.code.slice(currentBuffer.length).slice(0, n)),
  )
  const newSuffixes = []
  const suffixesToAdd = []
  for (const suffix of suffixes) {
    for (const key of srcKeys.split("")) {
      const s = suffix + key
      if (!used.has(s)) {
        newSuffixes.push(s)
        if (n >= 2 && newSuffixes.length >= minCount) return newSuffixes
      } else {
        suffixesToAdd.push(s)
      }
    }
  }

  if (newSuffixes.length < minCount)
    return findRemainedSuffixes(
      cands,
      currentBuffer,
      minCount,
      KEYS.easiestCqkm,
      n + 1,
      [...newSuffixes, ...suffixesToAdd],
    )
  else return newSuffixes
}

export const getSuffixes = (
  currentBuffer: string,
  notSuffixedCandidates: Cand[],
  suffixMinCount: number,
): string[] => {
  const l = currentBuffer.slice(currentBuffer.length - 1)
  const block = ([KEYS.l, KEYS.r] as string[]).find(keys => keys.includes(l))
  const l2 = currentBuffer.slice(
    currentBuffer.length - 2,
    currentBuffer.length - 1,
  )
  let fingerBlock = KEYS.fingers
    .find(group => group.includes(l2))
    ?.split("")
    .filter(key => !block?.includes(key))

  if (!(fingerBlock ?? []).includes(l2)) fingerBlock = []

  const remainedSuffixes = findRemainedSuffixes(
    notSuffixedCandidates,
    currentBuffer,
    suffixMinCount,
    KEYS.easiestCqkm,
    1,
    [""],
  )

  const ok = []
  const lrNG = []
  const fingerNG = []

  for (const s of remainedSuffixes) {
    const key = s[0]
    if (block?.includes(key)) {
      lrNG.push(s)
    } else if (fingerBlock?.includes(key)) {
      fingerNG.push(s)
    } else ok.push(s)
  }

  console.log({
    ok,
    fingerNG,
    lrNG,
    remainedSuffixes,
  })

  return [...ok, ...fingerNG, ...lrNG]
}
