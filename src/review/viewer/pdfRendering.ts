import { useRef, useState, type RefObject } from 'react'
import { useExternalSync } from '../../hooks/useExternalSync'
import type { PixelSize } from './types'
import { availablePageWidth } from './viewport'
// `?url` so the bundler resolves the worker and emits it as an asset. `new URL(<bare specifier>, import.meta.url)`
// does not resolve through node_modules — the browser would join the specifier onto this module's own URL and
// 404, leaving pdf.js to fall back to main-thread parsing. Only the emitted URL string lands in this chunk.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** pdf.js ships no React-friendly types for its document, page, loading-task and render-task handles. */
type PdfHandle = any

const MIN_RENDER_SCALE = 0.2

interface LoadJob {
  cancelled: boolean
  task: PdfHandle
}

interface RenderJob {
  cancelled: boolean
  renderTask: PdfHandle
}

/**
 * Opens the PDF in `blob`, or resolves null when cancelled first. pdf.js is dynamically imported so it never
 * enters the main bundle. Anyone who can upload an attachment controls these bytes: scripting and XFA are off by
 * default and must stay off. (There is no eval opt-out to set — pdf.js dropped its eval-based paths entirely.)
 */
async function openPdf(blob: Blob, job: LoadJob): Promise<PdfHandle> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const data = await blob.arrayBuffer()
  if (job.cancelled) return null
  const task = pdfjs.getDocument({ data })
  job.task = task
  const pdf = await task.promise
  if (!job.cancelled) return pdf
  void task.destroy()
  return null
}

/**
 * The PDF in `blob`, loaded with pdf.js; `onLoaded` runs in the same update that publishes a newly loaded one.
 * The document is state, not a ref: the page render must re-run when the loaded document changes. Two documents
 * with the same page count leave every other input untouched, and a ref would leave the previous PDF on the
 * canvas while the file name, overlay and download action all refer to the new one.
 */
export function usePdfDocument({ blob, onLoaded }: { blob: Blob; onLoaded: () => void }) {
  const [pdfDoc, setPdfDoc] = useState<PdfHandle>(null)
  const [numPages, setNumPages] = useState(0)
  const [failed, setFailed] = useState(false)
  const onLoadedRef = useRef(onLoaded)
  useExternalSync(() => { onLoadedRef.current = onLoaded }, [onLoaded])

  useExternalSync(() => {
    const job: LoadJob = { cancelled: false, task: null }
    void openPdf(blob, job)
      .then((pdf) => {
        if (!pdf || job.cancelled) return
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
        setFailed(false)
        onLoadedRef.current()
      })
      .catch(() => {
        if (!job.cancelled) setFailed(true)
      })
    return () => {
      job.cancelled = true
      setPdfDoc(null)
      const task = job.task
      job.task = null
      if (task) void task.destroy()
    }
  }, [blob])

  return { pdfDoc, numPages, failed }
}

/**
 * Paints the page at device resolution and scales it back down in CSS — this UI exists to read small print off a
 * receipt, and a HiDPI screen would otherwise show a half-resolution page. Null when there is no 2D context.
 */
function paintCanvas({ page, viewport, canvas }: { page: PdfHandle; viewport: PdfHandle; canvas: HTMLCanvasElement }): PdfHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  return page.render({
    canvasContext: ctx,
    viewport,
    transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
  })
}

/**
 * Overlays pdf.js's text layer so the page's text can be selected. pdf.js sizes every text span through
 * `--total-scale-factor`, which its own stylesheet only defines inside the full viewer's `.pdfViewer .page`.
 * Rendering a bare text layer means setting it here, or each span's font-size is an invalid calc() and the
 * invisible selection layer no longer lines up with the glyphs on the canvas.
 */
async function renderTextLayer({ page, viewport, scale, container, job }: {
  page: PdfHandle
  viewport: PdfHandle
  scale: number
  container: HTMLDivElement
  job: RenderJob
}): Promise<void> {
  container.replaceChildren()
  container.style.width = `${viewport.width}px`
  container.style.height = `${viewport.height}px`
  container.style.setProperty('--total-scale-factor', String(scale))
  const textContent = await page.getTextContent()
  if (job.cancelled) return
  const { TextLayer } = await import('pdfjs-dist')
  await new TextLayer({ textContentSource: textContent, container, viewport }).render()
}

/** The text layer is a convenience for text selection; a failure must not blank the page. */
function keepPageWithoutTextLayer(): void {}

/** A render cancelled by a page change or unmount rejects; there is nothing to do. */
function ignoreCancelledRender(): void {}

interface PageRenderTargets {
  container: RefObject<HTMLDivElement | null>
  canvas: RefObject<HTMLCanvasElement | null>
  textLayer: RefObject<HTMLDivElement | null>
}

interface PageRenderInput {
  pdf: PdfHandle
  pageNumber: number
  zoom: number
  viewportWidth: number | null
  targets: PageRenderTargets
  job: RenderJob
  onPainted: (size: PixelSize) => void
}

/** Renders one page to the canvas, fit to the pane width times `zoom`, then its text layer over it. */
async function renderPage({ pdf, pageNumber, zoom, viewportWidth, targets, job, onPainted }: PageRenderInput): Promise<void> {
  const canvas = targets.canvas.current
  const page = await pdf.getPage(pageNumber)
  if (job.cancelled || !canvas) return
  const available = availablePageWidth(viewportWidth, targets.container.current?.clientWidth)
  const scale = Math.max(MIN_RENDER_SCALE, (available / page.getViewport({ scale: 1 }).width) * zoom)
  const viewport = page.getViewport({ scale })
  job.renderTask = paintCanvas({ page, viewport, canvas })
  if (!job.renderTask) return
  await job.renderTask.promise
  if (job.cancelled) return
  onPainted({ width: viewport.width, height: viewport.height })
  const container = targets.textLayer.current
  if (container) await renderTextLayer({ page, viewport, scale, container, job }).catch(keepPageWithoutTextLayer)
}

/**
 * Keeps the canvas showing `pageNumber` of the loaded PDF, re-rendered whenever the page, zoom or pane width
 * changes, and returns the rendered page's pixel size — what region boxes scale their coordinates against.
 */
export function usePdfPageRender({ pdfDoc, pageCount, pageNumber, zoom, viewportWidth, targets }: Omit<PageRenderInput, 'pdf' | 'job' | 'onPainted'> & {
  pdfDoc: PdfHandle
  pageCount: number
}): PixelSize | null {
  const [pageSize, setPageSize] = useState<PixelSize | null>(null)

  useExternalSync(() => {
    if (!pdfDoc || !targets.canvas.current || pageCount === 0) return
    const job: RenderJob = { cancelled: false, renderTask: null }
    void renderPage({ pdf: pdfDoc, pageNumber, zoom, viewportWidth, targets, job, onPainted: setPageSize })
      .catch(ignoreCancelledRender)
    return () => {
      job.cancelled = true
      if (job.renderTask) job.renderTask.cancel()
    }
  }, [pdfDoc, pageCount, pageNumber, zoom, viewportWidth])

  return pageSize
}
