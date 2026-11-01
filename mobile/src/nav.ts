// Android back button support: every opened layer (editor, sheet) registers a closer.
const stack: (() => void)[] = []

window.addEventListener('popstate', () => {
  const close = stack.pop()
  close?.()
})

/** Register a layer; the system back button (or `back()`) will run `onBack`. */
export function pushLayer(onBack: () => void): void {
  stack.push(onBack)
  history.pushState({ depth: stack.length }, '')
}

/** Close the top layer the same way the back button would. */
export function back(): void {
  if (stack.length) history.back()
}

export function depth(): number {
  return stack.length
}
