import { useRef, type RefObject } from 'react'
import { useSourceHighlight } from '../highlight/SourceHighlightContext'
import { useExternalSync } from '../hooks/useExternalSync'
import { useSubscription } from '../hooks/useSubscription'
import styles from './SourceTether.module.scss'

interface SourceTetherProps {
  /** The split layout holding both panes — every coordinate is measured relative to it. */
  containerRef: RefObject<HTMLDivElement | null>
}

interface Point { x: number; y: number }

interface Endpoints { from: Point; to: Point }

interface TetherElements {
  svg: SVGSVGElement
  path: RefObject<SVGPathElement | null>
  from: RefObject<SVGCircleElement | null>
  to: RefObject<SVGCircleElement | null>
}

// Mirrors the stacking breakpoint in DocumentReviewLayout.module.scss: stacked, the two ends sit one above the
// other with the whole form between them, and a line spanning that says less than it clutters.
const MIN_SPLIT_WIDTH = 760
// Endpoints are pulled this far inside their pane so a clamped one reads as "off this edge" rather than
// sitting on the border itself.
const PANE_INSET = 3
const ENDPOINT_GAP = 2
const MIN_CURVE_REACH = 28
const CURVE_REACH_RATIO = 0.45

/** The endpoint on `el`'s named edge, in viewport coordinates. */
function edgePoint(el: HTMLElement, edge: 'left' | 'right'): Point {
  const rect = el.getBoundingClientRect()
  return {
    x: edge === 'right' ? rect.right + ENDPOINT_GAP : rect.left - ENDPOINT_GAP,
    y: rect.top + rect.height / 2,
  }
}

/**
 * Holds an endpoint inside the pane that owns it. Either end can be scrolled out of view — the region while the
 * reviewer scrolls the document, the field while they scroll the form — and an unclamped line would then be
 * drawn to a point outside the layout entirely. Clamped, it ends at the pane edge and still points the way.
 */
function clampToPane(el: HTMLElement, point: Point): Point {
  const pane = el.closest('[data-source-pane]')
  if (!pane) return point
  const rect = pane.getBoundingClientRect()
  return {
    x: Math.min(Math.max(point.x, rect.left + PANE_INSET), rect.right - PANE_INSET),
    y: Math.min(Math.max(point.y, rect.top + PANE_INSET), rect.bottom - PANE_INSET),
  }
}

function relativeTo(point: Point, base: DOMRect): Point {
  return { x: point.x - base.left, y: point.y - base.top }
}

/** Where the line runs, in the container's coordinates, or null when the panes are stacked. */
function measureEndpoints({ container, region, field }: Record<'container' | 'region' | 'field', HTMLElement>): Endpoints | null {
  const base = container.getBoundingClientRect()
  if (base.width < MIN_SPLIT_WIDTH) return null
  return {
    from: relativeTo(clampToPane(region, edgePoint(region, 'right')), base),
    to: relativeTo(clampToPane(field, edgePoint(field, 'left')), base),
  }
}

function curve({ from, to }: Endpoints): string {
  const reach = Math.max(MIN_CURVE_REACH, (to.x - from.x) * CURVE_REACH_RATIO)
  return `M ${from.x} ${from.y} C ${from.x + reach} ${from.y}, ${to.x - reach} ${to.y}, ${to.x} ${to.y}`
}

/** Writes the line and its end dots straight to the DOM, skipping the write when the path has not moved. */
function createTetherPainter({ svg, path, from, to }: TetherElements) {
  let lastPath = ''
  const hide = () => {
    svg.classList.remove(styles.visible)
    lastPath = ''
  }
  const paint = (ends: Endpoints | null) => {
    if (!ends || !path.current) return hide()
    const d = curve(ends)
    if (d === lastPath) return
    lastPath = d
    path.current.setAttribute('d', d)
    from.current?.setAttribute('cx', String(ends.from.x))
    from.current?.setAttribute('cy', String(ends.from.y))
    to.current?.setAttribute('cx', String(ends.to.x))
    to.current?.setAttribute('cy', String(ends.to.y))
    svg.classList.add(styles.visible)
  }
  return { paint, hide }
}

/** Calls `draw` on every animation frame until the returned stop function is called. */
function everyFrame(draw: () => void): () => void {
  let frame = requestAnimationFrame(function tick() {
    draw()
    frame = requestAnimationFrame(tick)
  })
  return () => cancelAnimationFrame(frame)
}

/**
 * Draws the line between the emphasized region on the document and the form field it filled — the relationship
 * the highlight exists to communicate, which two separately-highlighted boxes can only imply.
 *
 * Both ends move without rendering (document scroll, zoom, page change, form scroll, splitter drag), so rather
 * than trying to subscribe to each of those, the geometry is recomputed per animation frame for as long as a
 * claim is live and written straight to the DOM. Nothing here sets React state.
 */
export function SourceTether({ containerRef }: SourceTetherProps) {
  const { anchors, activeFieldNames, isActive } = useSourceHighlight()
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const fromRef = useRef<SVGCircleElement>(null)
  const toRef = useRef<SVGCircleElement>(null)
  const fieldNamesRef = useRef(activeFieldNames)

  useExternalSync(() => { fieldNamesRef.current = activeFieldNames }, [activeFieldNames])

  const live = isActive && activeFieldNames.size > 0

  useSubscription(() => {
    const svg = svgRef.current
    if (!live || !svg) return () => {}

    const painter = createTetherPainter({ svg, path: pathRef, from: fromRef, to: toRef })
    const stop = everyFrame(() => {
      const container = containerRef.current
      const region = anchors.region()
      const field = anchors.field(fieldNamesRef.current)
      painter.paint(container && region && field ? measureEndpoints({ container, region, field }) : null)
    })
    return () => {
      stop()
      painter.hide()
    }
  }, [live, anchors, containerRef])

  return (
    <svg ref={svgRef} className={styles.tether} aria-hidden="true">
      <path ref={pathRef} className={styles.line} />
      <circle ref={fromRef} className={styles.node} r="3" />
      <circle ref={toRef} className={styles.node} r="4" />
    </svg>
  )
}

export default SourceTether
