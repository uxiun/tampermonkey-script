const SHUANGPIN_TABLE: [string, string[], string[]][] = [
  // [key, initials, tails]
  ["q", ["q"], ["iu"]],
  ["w", ["w"], ["ei"]],
  ["e", ["e"], ["e"]],
  ["r", ["r"], ["uan"]],
  ["t", ["t"], ["ue", "ve"]],
  ["y", ["y"], ["un"]],
  ["u", ["sh"], ["u"]],
  ["i", ["zh"], ["i"]], // swapped
  ["o", ["ch", "o"], ["o", "uo"]], // swapped
  ["p", ["p"], ["ie"]],
  ["a", ["a"], ["a"]],
  ["s", ["s"], ["ong", "iong"]],
  ["d", ["d"], ["ai"]],
  ["f", ["f"], ["en"]],
  ["g", ["g"], ["eng"]],
  ["h", ["h"], ["ang"]],
  ["j", ["j"], ["an"]],
  ["k", ["k"], ["uai", "ing"]],
  ["l", ["l"], ["iang", "uang"]],
  ["z", ["z"], ["ou"]],
  ["x", ["x"], ["ia", "ua"]],
  ["c", ["c"], ["ao"]],
  ["v", [], ["ui", "v"]], // [v] consonant empty
  ["b", ["b"], ["in"]],
  ["n", ["n"], ["iao"]],
  ["m", ["m"], ["ian"]],
]

export const shuangpin = (quanpin: string): string => {
  const initial = quanpin[1] === "h" ? quanpin.slice(0, 2) : quanpin[0]
  const rem = quanpin[1] === "h" ? quanpin.slice(2) : quanpin.slice(1)
  const regex = /(?<tail>[a-z]+)(?<tone>\d)/
  const found = rem.match(regex)
  const tail = found?.groups ? found.groups.tail : rem
  const tone = found?.groups ? found.groups.tone : ""

  const x = SHUANGPIN_TABLE.find(([key, i, _]) => i.includes(initial))
  const y = SHUANGPIN_TABLE.find(([key, _, t]) => t.includes(tail))
  return (x ? x[0] : "?") + (y ? y[0] : "?") + tone
}

// export const multiShuangpin = (quanpins: string[]): string
