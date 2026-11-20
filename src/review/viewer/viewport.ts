import { useCallback, useState } from 'react'
import type { PixelSize } from './types'

// Horizontal breathing room so the rendered page never touches the pane edges / scrollbar.
const PAGE_HORIZONTAL_PADDING = 24
// Fallback pane width used before the viewport's real size has been measured.
const DEFAULT_VIEWPORT_WIDTH = 800
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25
const FIT_TO_WIDTH = 1

/** The width a page can fill: the measured pane width (else `fallback`, else a default) minus padding. */
export function availablePageWidth(measured: number | null, fallback?: number): number {
  return (measured ?? fallback ?? DEFAULT_VIEWPORT_WIDTH) - PAGE_HORIZONTAL_PADDING
}

/** `natural` scaled to `width`, keeping its aspect ratio; null until the natural size is known. */
export function scaledToWidth(natural: PixelSize | null, width: number): PixelSize | null {
  if (!natural) return null
  return { width, height: Math.round(width * (natural.height / natural.width)) }
}

/** Zoom relative to the fit-to-width size, stepped and clamped. */
export function useZoom() {
  const [zoom, setZoom] = useState(FIT_TO_WIDTH)
  const reset = useCallback(() => setZoom(FIT_TO_WIDTH), [])
  return {
    zoom,
    reset,
    zoomIn: () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2))),
    zoomOut: () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))),
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
    fitted: zoom === FIT_TO_WIDTH,
  }
}

export type ZoomControls = ReturnType<typeof useZoom>
