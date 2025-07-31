function delay (n: number) {
  return new Promise<void>(ok => setTimeout(ok, n))
}

function formatString(s: string, ...args: string[]): string {
  let result = s
  for (let arg of args) {
    result = result.replace(/{\d+}/, arg)
  }
  return result
}

export {
  delay,
  formatString
}