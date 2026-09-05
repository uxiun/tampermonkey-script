declare global {
  interface Array<T> {
    sum(this: number[]): number
    last(this: T[]): T | undefined
    // filterMap(this: T | undefined | null[]): T[]
  }
}

if (!Array.prototype.sum) {
  Array.prototype.sum = function (this: number[]) {
    return this.reduce((acc, current) => acc + current, 0)
  }

  Array.prototype.last = function <T>(this: T[]) {
    return this.at(-1)
  }
}

export {}
