import { useCallback, useRef, useState, type ReactNode, type RefCallback, type RefObject } from 'react'
import styles from '../DocumentViewer.module.scss'
import { RegionBoxes } from './RegionBoxes'
import { useJumpToActivePage, useRegionHighlight } from './regionHighlight'
import { enablePanning, observeWidth } from './scrollArea'
import type { PageControls, PixelSize, RegionHighlightProps } from './types'

interface PageViewWiring {
  highlight: RegionHighlightProps
  pageNumber: number
  scrollArea: RefObject<HTMLDivElement | null>
  attachScrollArea: RefCallback<HTMLDivElement>
}

/** What `usePageView` returns, to pass to exactly one `<PageView>`. */
export interface PageViewHandle {
  /** The scroll area's width, quantized; null until measured, and always null without ResizeObserver. */
  width: number | null
  /** How the hook reaches its `<PageView>`; callers never read it. */
  wiring: PageViewWiring
}

/**
 * The scroll area's measured width, and one stable ref that starts measuring and panning when the element mounts
 * and stops both when it unmounts. Tied to the element rather than to an effect's dependencies, so a scroll area
 * that appears late (bytes still loading, a failed document replaced) is measured like any other.
 */
function useScrollArea() {
  const [width, setWidth] = useState<number | null>(null)
  const scrollArea = useRef<HTMLDivElement | null>(null)
  const attachScrollArea = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    scrollArea.current = el
    const stopObserving = observeWidth(el, setWidth)
    const stopPanning = enablePanning(el)
    return () => {
      stopObserving()
      stopPanning()
      scrollArea.current = null
    }
  }, [])
  return { width, scrollArea, attachScrollArea }
}

/**
 * A page of a document in a pannable scroll area with field-source regions over it. Call it before any early
 * return, read `width` to size the page, then render `<PageView>` with the handle once there is a page to show.
 * Pass `pages` for a paged document: the view then pages to the active region while following it.
 */
export function usePageView({ highlight, pages }: { highlight: RegionHighlightProps; pages?: PageControls }): PageViewHandle {
  const { width, scrollArea, attachScrollArea } = useScrollArea()
  useJumpToActivePage(highlight, pages)
  return { width, wiring: { highlight, pageNumber: pages?.page ?? 1, scrollArea, attachScrollArea } }
}

interface PageViewProps {
  view: PageViewHandle
  /** The rendered page's pixel size, which regions are scaled to; none are drawn until it is known. */
  size: PixelSize | null
  children: ReactNode
}

/** The scroll area, the page content, and the regions drawn over it. */
export function PageView({ view, size, children }: PageViewProps) {
  const { highlight, pageNumber, scrollArea, attachScrollArea } = view.wiring
  const regions = useRegionHighlight({ highlight, pageNumber, scrollArea, size })
  return (
    <div className={styles.scrollArea} ref={attachScrollArea}>
      <div className={styles.pageWrap}>
        {children}
        {size && (
          <RegionBoxes
            boxes={regions.pageBoxes}
            size={size}
            activeIndex={regions.activeIndex}
            setActiveBox={regions.setActiveBox}
            highlight={highlight}
          />
        )}
      </div>
    </div>
  )
}
