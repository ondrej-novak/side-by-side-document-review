import { useRef, useState } from 'react'
import styles from '../DocumentViewer.module.scss'
import { UnsupportedDocument } from './DocumentFallbacks'
import { PageView, usePageView } from './PageView'
import { usePdfDocument, usePdfPageRender } from './pdfRendering'
import type { RegionHighlightProps } from './types'
import { ViewerToolbar } from './ViewerToolbar'
import { useZoom } from './viewport'

/**
 * A PDF rendered with pdf.js, one fit-to-width page at a time with prev/next, and pdf.js's text layer over the
 * canvas for text selection. A PDF pdf.js cannot open falls back to the download view.
 */
export function PdfDocument({ blob, fileName, highlight }: { blob: Blob; fileName: string; highlight: RegionHighlightProps }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const zoom = useZoom()
  const [page, setPage] = useState(1)
  const pdf = usePdfDocument({
    blob,
    onLoaded: () => {
      setPage(1)
      zoom.reset()
    },
  })
  const pages = { page, pageCount: pdf.numPages, setPage }
  const view = usePageView({ highlight, pages })
  const pageSize = usePdfPageRender({
    pdfDoc: pdf.pdfDoc,
    pageCount: pdf.numPages,
    pageNumber: page,
    zoom: zoom.zoom,
    viewportWidth: view.width,
    targets: { container: containerRef, canvas: canvasRef, textLayer: textLayerRef },
  })

  if (pdf.failed) return <UnsupportedDocument blob={blob} fileName={fileName} />

  return (
    <div className={styles.viewer} ref={containerRef}>
      <ViewerToolbar pages={pages} zoom={zoom} />
      <PageView view={view} size={pageSize}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div ref={textLayerRef} className={`textLayer ${styles.textLayer}`} />
      </PageView>
    </div>
  )
}
