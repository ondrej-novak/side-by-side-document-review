import { useCallback, useMemo, useRef, type RefObject } from 'react'
import type { DocumentFieldBoundingBoxDto } from '../../types'
import { useExternalSync } from '../../hooks/useExternalSync'
import type { DocumentSourceRegion } from '../documentRegions'
import type { PageControls, PixelSize, RegionHighlightProps } from './types'

/** One drawn rectangle, with the region it belongs to so a hovered rectangle can name its fields to the form. */
export interface PageBox {
  region: DocumentSourceRegion
  box: DocumentFieldBoundingBoxDto
}

export function isRegionActive(region: DocumentSourceRegion, activeFieldNames: ReadonlySet<string> | undefined): boolean {
  return region.fieldNames.some((name) => activeFieldNames?.has(name))
}

/**
 * False for a degenerate box: the extractor reports a zero rect when a page's dimensions are unusable, which
 * would draw an invisible 0×0 target pinned at the page's top-left that the bring-into-view scroll would chase.
 */
function isDrawable(box: DocumentFieldBoundingBoxDto): boolean {
  return box.bbox.width > 0 && box.bbox.height > 0
}

/** The regions flattened to one entry per rectangle drawn on `pageNumber`. */
function boxesOnPage(regions: DocumentSourceRegion[] | undefined, pageNumber: number): PageBox[] {
  return (regions ?? []).flatMap((region) =>
    region.boundingBoxes
      .filter((box) => box.pageNumber === pageNumber && isDrawable(box))
      .map((box) => ({ region, box })),
  )
}

/**
 * The active region's boxes. Filtered like `boxesOnPage`: a zero-size region is never drawn, so paging to its
 * page would land the reviewer on a page with no highlight on it.
 */
function activeRegionBoxes(regions: DocumentSourceRegion[] | undefined, activeFieldNames: ReadonlySet<string> | undefined) {
  return regions?.find((region) => isRegionActive(region, activeFieldNames))?.boundingBoxes.filter(isDrawable)
}

function isFullyVisible(inner: DOMRect, outer: DOMRect): boolean {
  return inner.top >= outer.top && inner.bottom <= outer.bottom && inner.left >= outer.left && inner.right <= outer.right
}

/**
 * Centres `box` in the document pane's own viewport, unless it is already fully visible. Scrolls only that
 * viewport: `scrollIntoView` would also scroll every ancestor, yanking the whole page down every time the
 * reviewer hovers a field.
 */
function centerInViewport(viewport: HTMLElement, box: HTMLElement): void {
  const boxRect = box.getBoundingClientRect()
  const viewRect = viewport.getBoundingClientRect()
  if (isFullyVisible(boxRect, viewRect)) return
  viewport.scrollTo({
    top: viewport.scrollTop + (boxRect.top + boxRect.height / 2) - (viewRect.top + viewRect.height / 2),
    left: viewport.scrollLeft + (boxRect.left + boxRect.width / 2) - (viewRect.left + viewRect.width / 2),
    behavior: 'smooth',
  })
}

/**
 * One stable ref callback for the emphasized rectangle, feeding both the bring-into-view scroll and the caller's
 * anchor. Stable on purpose: an inline callback is a new function each render, so React would detach and
 * re-attach the ref every time — reporting null in between and blanking whatever tracks it.
 */
function useActiveBoxRef(onActiveRegionRef: RegionHighlightProps['onActiveRegionRef']) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const callbackRef = useRef(onActiveRegionRef)
  useExternalSync(() => { callbackRef.current = onActiveRegionRef }, [onActiveRegionRef])
  const setActiveBox = useCallback((el: HTMLDivElement | null) => {
    boxRef.current = el
    callbackRef.current?.(el)
  }, [])
  return { boxRef, setActiveBox }
}

interface RegionHighlightOptions {
  highlight: RegionHighlightProps
  pageNumber: number
  scrollArea: RefObject<HTMLDivElement | null>
  /** The drawn page's size. The active rectangle only exists once it is set, so the scroll waits on it. */
  size: PixelSize | null
}

/**
 * The rectangles to draw on the current page, which of them is active, and the ref the active one attaches to.
 * Brings the active rectangle into view once it is actually rendered, and again when the page is resized or
 * zoomed — but not when the claim came from this pane. `size` is compared by value, so a caller may build it
 * fresh every render.
 */
export function useRegionHighlight({ highlight, pageNumber, scrollArea, size }: RegionHighlightOptions) {
  const { regions, activeFieldNames, followActive, onActiveRegionRef } = highlight
  const pageBoxes = useMemo(() => boxesOnPage(regions, pageNumber), [regions, pageNumber])
  const activeIndex = pageBoxes.findIndex((entry) => isRegionActive(entry.region, activeFieldNames))
  const { boxRef, setActiveBox } = useActiveBoxRef(onActiveRegionRef)

  useExternalSync(() => {
    const viewport = scrollArea.current
    const box = boxRef.current
    if (followActive && activeIndex >= 0 && viewport && box) centerInViewport(viewport, box)
  }, [followActive, activeFieldNames, activeIndex, pageNumber, size?.width, size?.height])

  return { pageBoxes, activeIndex, setActiveBox }
}

/**
 * Pages to the active region's first box when a field's source is published — but never when the claim came from
 * this pane (`followActive` false): the reviewer's pointer is already resting on that region, and paging would
 * slide it out from under the cursor, which fires mouseleave and makes the highlight flicker. Keyed on the box
 * list rather than its page number, so a newly published field re-pages even when it shares the previous one's page.
 */
export function useJumpToActivePage(highlight: RegionHighlightProps, pages: PageControls | undefined) {
  const { regions, activeFieldNames, followActive } = highlight
  const activeBoxes = useMemo(() => activeRegionBoxes(regions, activeFieldNames), [regions, activeFieldNames])
  const pageCount = pages?.pageCount ?? 0
  const setPage = pages?.setPage

  useExternalSync(() => {
    const targetPage = activeBoxes?.[0]?.pageNumber
    if (followActive && setPage && targetPage && targetPage >= 1 && targetPage <= pageCount) setPage(targetPage)
  }, [followActive, activeBoxes, pageCount, setPage])
}
