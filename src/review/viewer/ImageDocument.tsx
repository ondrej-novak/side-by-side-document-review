import { useRef, useState } from 'react'
import { useExternalSync } from '../../hooks/useExternalSync'
import styles from '../DocumentViewer.module.scss'
import { LoadingDocument } from './DocumentFallbacks'
import { PageView, usePageView } from './PageView'
import type { PixelSize, RegionHighlightProps } from './types'
import { ViewerToolbar } from './ViewerToolbar'
import { availablePageWidth, scaledToWidth, useZoom } from './viewport'

/** An object URL for `blob`, revoked on change/unmount; `onNewImage` runs in the same update that creates one. */
function useObjectUrl(blob: Blob, onNewImage: () => void): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const onNewImageRef = useRef(onNewImage)
  useExternalSync(() => { onNewImageRef.current = onNewImage }, [onNewImage])
  useExternalSync(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    onNewImageRef.current()
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url
}

/**
 * An image document, fit to the pane width by default like a PDF page — a tall image then only needs vertical
 * scroll. Contain-fitting both axes made a narrow, tall photo (a receipt) double-scroll in a cramped column
 * instead of just scrolling down.
 *
 * Shows the loading state until the object URL exists: it is created in an effect, so it is null for the commit
 * the bytes arrive in, and falling through to the unsupported-type fallback flashed "This file type can't be
 * previewed" for a frame on every image and every document switch.
 */
export function ImageDocument({ blob, fileName, highlight }: { blob: Blob; fileName: string; highlight: RegionHighlightProps }) {
  const zoom = useZoom()
  const [naturalSize, setNaturalSize] = useState<PixelSize | null>(null)
  const url = useObjectUrl(blob, () => {
    zoom.reset()
    setNaturalSize(null)
  })
  const view = usePageView({ highlight })

  if (!url) return <LoadingDocument />

  const displayWidth = Math.round(availablePageWidth(view.width) * zoom.zoom)
  return (
    <div className={styles.viewer}>
      <ViewerToolbar zoom={zoom} />
      <PageView view={view} size={scaledToWidth(naturalSize, displayWidth)}>
        <img
          src={url}
          alt={fileName}
          className={styles.image}
          style={{ width: `${displayWidth}px` }}
          onLoad={(e) => setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        />
      </PageView>
    </div>
  )
}
