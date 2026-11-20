import { HiChevronLeft, HiChevronRight, HiMagnifyingGlassMinus, HiMagnifyingGlassPlus } from 'react-icons/hi2'
import { toPercent } from '../../utils/percent'
import styles from '../DocumentViewer.module.scss'
import type { PageControls } from './types'
import type { ZoomControls } from './viewport'

function PageNav({ page, pageCount, setPage }: PageControls) {
  return (
    <div className={styles.toolbarGroup}>
      <button
        type="button"
        className="iconButton"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
        title="Previous page"
      >
        <HiChevronLeft />
      </button>
      <span className={styles.pageIndicator}>Page {page} / {pageCount}</span>
      <button
        type="button"
        className="iconButton"
        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
        disabled={page >= pageCount}
        aria-label="Next page"
        title="Next page"
      >
        <HiChevronRight />
      </button>
    </div>
  )
}

function ZoomButtons({ zoom, zoomIn, zoomOut, reset, canZoomIn, canZoomOut, fitted }: ZoomControls) {
  return (
    <div className={styles.toolbarGroup}>
      <button type="button" className="iconButton" onClick={zoomOut} disabled={!canZoomOut} aria-label="Zoom out" title="Zoom out">
        <HiMagnifyingGlassMinus />
      </button>
      <button type="button" className={`iconButton ${styles.zoomLabel}`} onClick={reset} disabled={fitted} title="Reset zoom / Fit to page" aria-label="Fit to page">
        {Math.round(toPercent(zoom))}%
      </button>
      <button type="button" className="iconButton" onClick={zoomIn} disabled={!canZoomIn} aria-label="Zoom in" title="Zoom in">
        <HiMagnifyingGlassPlus />
      </button>
    </div>
  )
}

/**
 * Shared across image/pdf: page nav (a PDF with more than one page) on the left, zoom on the right. Kept as one
 * row so both document kinds offer the same way to check a value closely against the form beside it.
 */
export function ViewerToolbar({ pages, zoom }: { pages?: PageControls; zoom: ZoomControls }) {
  return (
    <div className={styles.toolbar}>
      {pages && pages.pageCount > 1 ? <PageNav {...pages} /> : <span />}
      <ZoomButtons {...zoom} />
    </div>
  )
}
