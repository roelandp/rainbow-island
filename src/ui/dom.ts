type Child = Node | string | null | undefined | false
type Props = Record<string, unknown>

/** Tiny element helper: el('div.card', { onclick }, 'text'). */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: string,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.')
  const node = document.createElement(tag || 'div')
  if (classes.length) node.className = classes.join(' ')
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = `${node.className} ${value}`.trim()
    else if (key === 'style') Object.assign(node.style, value as object)
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value as EventListener)
    } else if (key === 'text') node.textContent = String(value)
    else if (key === 'html') node.innerHTML = String(value)
    else node.setAttribute(key, String(value))
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node as HTMLElementTagNameMap[K]
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}

export function topbar(title: string, onBack: () => void, extra?: HTMLElement): HTMLElement {
  return el('div.topbar', {}, el('button.btn.small.ghost', { onclick: onBack }, 'Terug'), el('h1', { text: title }), extra ?? null)
}

/** 12,4 instead of 12.4, and no decimals once it gets big. */
export function metres(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded >= 100) return `${Math.round(rounded)}`
  return String(rounded).replace('.', ',')
}

export function seconds(value: number | null): string {
  if (value === null) return '-'
  return `${(Math.round(value * 10) / 10).toString().replace('.', ',')} s`
}
