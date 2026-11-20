import { type ReactNode, type RefObject, useRef, useState } from 'react'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2'
import { useSubscription } from '../hooks/useSubscription'
import { SourceHighlightProvider } from '../highlight/SourceHighlightContext'
import { toPercent } from '../utils/percent'
import { SourceTether } from './SourceTether'
import styles from './DocumentReviewLayout.module.scss'

interface DocumentReviewLayoutProps {
  /** The document side (left on desktop, below the form on mobile). */
  document: ReactNode
  /** The form / content side (right on desktop, first on mobile). */
  children: ReactNode
  /**
   * Whether the document side is shown. Defaults to true. Set to false to animate it closed (width
   * and opacity) rather than unmounting — callers that toggle visibility should keep this component
   * mounted and flip this prop instead of conditionally rendering it, or the transition has no DOM to
   * animate between. A pane that starts closed renders its `document` only once first opened.
   */
  showDocument?: boolean
}

const MIN_PCT = 25
const MAX_PCT = 75
const INITIAL_PCT = 50
const KEYBOARD_STEP_PCT = 5

function clampPct(pct: number): number {
  return Math.min(MAX_PCT, Math.max(MIN_PCT, pct))
}

/**
 * A separator that advertises itself to assistive tech has to be operable without a pointer: arrows nudge,
 * Home/End go to the extremes, matching the pointer drag's own clamp. Null for keys the separator ignores.
 */
function keyboardResize(key: string, pct: number): number | null {
  switch (key) {
    case 'ArrowLeft': return clampPct(pct - KEYBOARD_STEP_PCT)
    case 'ArrowRight': return clampPct(pct + KEYBOARD_STEP_PCT)
    case 'Home': return MIN_PCT
    case 'End': return MAX_PCT
    default: return null
  }
}

/**
 * Whether the document side has ever been shown. A pane that starts collapsed must not fetch and render its
 * document (nor pull in the PDF renderer) until it is first revealed; once revealed it stays mounted, so
 * collapsing doesn't refetch. State rather than a ref written during render, which a concurrent re-render could
 * throw away.
 */
function useRevealedOnce(showDocument: boolean): boolean {
  const [revealed, setRevealed] = useState(showDocument)
  if (showDocument && !revealed) setRevealed(true)
  return revealed
}

/** The document side's width, in percent of the layout, and the pointer drag that changes it. */
function useSplitWidth(containerRef: RefObject<HTMLDivElement | null>) {
  const [widthPct, setWidthPct] = useState(INITIAL_PCT)
  const [dragging, setDragging] = useState(false)

  useSubscription(() => {
    if (!dragging) return () => {}
    const onMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      setWidthPct(clampPct(toPercent((e.clientX - rect.left) / rect.width)))
    }
    const onUp = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

  return { widthPct, setWidthPct, dragging, startDragging: () => setDragging(true) }
}

/**
 * The document pane's slot. `inert` while collapsed: the pane is only faded and zero-width, so without it every
 * control inside a once-opened pane (picker, zoom, page nav, one focusable region per extracted field) stays in
 * the tab order and in the accessibility tree, invisible. `data-source-pane` marks the scroll viewport the
 * connector clamps its endpoints to, so an end scrolled out of its pane stops at that pane's edge.
 */
function DocumentSide({ showDocument, widthPct, children }: { showDocument: boolean; widthPct: number; children: ReactNode }) {
  return (
    <div
      className={`${styles.docPane} ${!showDocument ? styles.hiddenPane : ''}`}
      style={{ flexBasis: showDocument ? `${widthPct}%` : '0%' }}
      inert={!showDocument}
      data-source-pane="document"
    >
      {children}
    </div>
  )
}

interface SplitHandleProps {
  showDocument: boolean
  widthPct: number
  onDragStart: () => void
  onResize: (pct: number) => void
}

/** The resize handle, exposed through ARIA's window-splitter pattern: a focusable `separator` carrying aria-value*. */
function SplitHandle({ showDocument, widthPct, onDragStart, onResize }: SplitHandleProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showDocument) return
    const next = keyboardResize(e.key, widthPct)
    if (next === null) return
    onResize(next)
    e.preventDefault()
  }

  return (
    <div
      className={`${styles.handle} ${!showDocument ? styles.hiddenPane : ''}`}
      style={{ flexBasis: showDocument ? '17px' : '0px' }}
      onPointerDown={() => showDocument && onDragStart()}
      onKeyDown={handleKeyDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize document panel"
      aria-hidden={!showDocument}
      aria-valuenow={Math.round(widthPct)}
      aria-valuemin={MIN_PCT}
      aria-valuemax={MAX_PCT}
      tabIndex={showDocument ? 0 : -1}
    >
      <span className={styles.seam} />
      <span className={styles.chevrons} aria-hidden="true">
        <HiChevronLeft />
        <HiChevronRight />
      </span>
    </div>
  )
}

/**
 * A resizable two-pane layout for reviewing a document beside a form. The document side is a prop, the content
 * side is children, so it composes with any form. Stacks form-first on narrow viewports.
 *
 * The outer wrapper is the query container the stacking rule measures (see the module's @container block): the
 * layout may sit anywhere from a full page to a narrow side panel, so whether two panes fit is a question about
 * the space this layout was given, not about the viewport.
 *
 * The field-source indicators are live only while the document is actually on screen — a collapsed pane has
 * nothing to highlight — but the Provider stays mounted and goes inert instead of being conditionally rendered:
 * swapping the element type at this position would remount both panes and the whole form on every toggle,
 * defeating the collapse transition and discarding the reviewer's focus and scroll position.
 */
export function DocumentReviewLayout({ document, children, showDocument = true }: DocumentReviewLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { widthPct, setWidthPct, dragging, startDragging } = useSplitWidth(containerRef)
  const revealed = useRevealedOnce(showDocument)

  return (
    <SourceHighlightProvider enabled={showDocument}>
      <div className={`${styles.container} ${!showDocument ? styles.containerCollapsed : ''}`}>
        <div
          ref={containerRef}
          className={`${styles.layout} ${dragging ? styles.dragging : ''} ${!showDocument ? styles.collapsed : ''}`}
        >
          <DocumentSide showDocument={showDocument} widthPct={widthPct}>
            {revealed ? document : null}
          </DocumentSide>
          <SplitHandle showDocument={showDocument} widthPct={widthPct} onDragStart={startDragging} onResize={setWidthPct} />
          <div className={styles.contentPane} data-source-pane="content">
            {children}
          </div>
          <SourceTether containerRef={containerRef} />
        </div>
      </div>
    </SourceHighlightProvider>
  )
}

export default DocumentReviewLayout
