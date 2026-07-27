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
  banned: "d   sleiruwo htcm ,zvxnya;qpb",
}

const siteShortcut = {
  "dlt.kitetu.com": "nr/&",
}

const vimiumcKeys = {
  dlt: "fgjk.mzo",
}

const autocontrolKeys = {
  dlt: "wv",
}

export const keyBlacklist =
  (blacklist: string) => (keySpec: keyof typeof KEYS) => {
    return KEYS[keySpec].split("").filter(c => !blacklist.includes(c))
  }

export const dltkeys = {
  // easy: KEYS.easiest,
  easy: keyBlacklist(vimiumcKeys.dlt + autocontrolKeys.dlt)("easiest"),
  easyL: keyBlacklist(vimiumcKeys.dlt + KEYS.r)("easiest"),
  easyR: keyBlacklist(vimiumcKeys.dlt + KEYS.l)("easiest"),
}
