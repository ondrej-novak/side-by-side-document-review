import 'pdfjs-dist/web/pdf_viewer.css'
import { useMemo } from 'react'
import type { DocumentSourceRegion } from './documentRegions'
import { LoadingDocument, UnsupportedDocument } from './viewer/DocumentFallbacks'
import { ImageDocument } from './viewer/ImageDocument'
import { PdfDocument } from './viewer/PdfDocument'

type DocumentKind = 'pdf' | 'image' | 'other'

interface DocumentViewerProps {
  /** File bytes; undefined while loading. */
  blob: Blob | undefined
  fileName: string
  mimeType: string
  /** Every field's source regions on this document, drawn as rectangles scaled from their normalized
   * bbox to the rendered page's pixel size. Regions on other pages are simply not drawn. */
  regions?: DocumentSourceRegion[]
  /** Fields under review; the first region covering one of them is emphasized, opened, and scrolled to. */
  activeFieldNames?: ReadonlySet<string>
  /** Whether to page/scroll to the active region. False when the claim originates here (a hovered region),
   * since moving the page would slide that region out from under the pointer. Defaults to true. */
  followActive?: boolean
  /** Pointer entered/left a region — drives the reverse highlight (document region picks the form fields). */
  onRegionEnter?: (region: DocumentSourceRegion) => void
  onRegionLeave?: (region: DocumentSourceRegion) => void
  /** The emphasized rectangle's element, or null when none is drawn on the visible page — lets a caller anchor
   * a connector to it. Called again whenever it moves to another region, page, or document. */
  onActiveRegionRef?: (el: HTMLElement | null) => void
}

function resolveKind(mimeType: string, fileName: string): DocumentKind {
  const name = fileName.toLowerCase()
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image'
  return 'other'
}

/**
 * Renders a document inline for side-by-side review: PDFs via pdf.js (lazy-loaded, one fit-to-width page at a
 * time with prev/next), images via an object URL, and everything else as a download fallback. The pdf.js text
 * layer is rendered over the canvas for text selection. `regions` are drawn as rectangles scaled from
 * their normalized coordinates to the rendered page's (or, for a single-page image, the rendered image's)
 * pixel size — the `activeFieldNames` one emphasized, the rest quiet but hoverable so the reviewer can go
 * from a region back to the form fields it filled.
 */
export function DocumentViewer({ blob, fileName, mimeType, followActive = true, ...regionProps }: DocumentViewerProps) {
  const kind = useMemo(() => resolveKind(mimeType, fileName), [mimeType, fileName])

  if (!blob) return <LoadingDocument />

  const highlight = { ...regionProps, followActive }
  if (kind === 'image') return <ImageDocument blob={blob} fileName={fileName} highlight={highlight} />
  if (kind === 'pdf') return <PdfDocument blob={blob} fileName={fileName} highlight={highlight} />
  return <UnsupportedDocument blob={blob} fileName={fileName} />
}

export default DocumentViewer
