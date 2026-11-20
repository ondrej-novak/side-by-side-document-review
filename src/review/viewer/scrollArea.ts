import styles from '../DocumentViewer.module.scss'

/** Widths are snapped to this before they reach the renderer, so a drag re-renders a handful of times, not per pixel. */
const RESIZE_QUANTUM_PX = 24

interface PanStart {
  x: number
  y: number
  scrollLeft: number
  scrollTop: number
}

/**
 * Reports `el`'s width whenever it changes (mount, splitter drag, window resize); returns the stop function.
 *
 * The width is quantized and a collapsed pane (width 0) ignored, because it feeds the page render: setting
 * `canvas.width` clears the canvas, so a raw per-pixel stream would blank the page for the whole splitter drag
 * and, at width 0, re-render the page at the minimum scale. Without ResizeObserver it reports nothing, and the
 * caller keeps its fallback width.
 */
export function observeWidth(el: HTMLElement, onWidth: (width: number) => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}
  const observer = new ResizeObserver((entries) => {
    const quantized = Math.round(entries[0].contentRect.width / RESIZE_QUANTUM_PX) * RESIZE_QUANTUM_PX
    if (quantized > 0) onWidth(quantized)
  })
  observer.observe(el)
  return () => observer.disconnect()
}

function overflows(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight
}

/**
 * Click-and-drag panning of `el`; returns the stop function. Only engages when `el` actually overflows, so a plain
 * click on content that fits is never hijacked. Scroll position is written straight to the DOM and the "panning"
 * class toggled imperatively — no React state, so a drag never re-renders.
 */
export function enablePanning(el: HTMLElement): () => void {
  let start: PanStart | null = null
  const begin = (e: MouseEvent) => {
    if (e.button !== 0 || !overflows(el)) return
    start = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    el.classList.add(styles.panning)
    e.preventDefault()
  }
  const move = (e: MouseEvent) => {
    if (!start) return
    el.scrollLeft = start.scrollLeft - (e.clientX - start.x)
    el.scrollTop = start.scrollTop - (e.clientY - start.y)
  }
  const end = () => {
    if (!start) return
    start = null
    el.classList.remove(styles.panning)
  }
  el.addEventListener('mousedown', begin)
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', end)
  return () => {
    el.removeEventListener('mousedown', begin)
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', end)
  }
}
