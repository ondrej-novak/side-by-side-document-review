import { formatSourceFieldLabel } from '../formFieldSources'
import styles from '../DocumentViewer.module.scss'
import { isRegionActive, type PageBox } from './regionHighlight'
import type { PixelSize, RegionHighlightProps } from './types'

interface RegionBoxesProps {
  boxes: PageBox[]
  /** The rendered page's (or image's) pixel size, which the boxes' normalized coordinates are scaled to. */
  size: PixelSize
  activeIndex: number
  setActiveBox: (el: HTMLDivElement | null) => void
  highlight: RegionHighlightProps
}

/**
 * The regions' rectangles over a page or image — the active one emphasized, the rest quiet but hoverable. Each is
 * focusable and labelled with the fields it filled, so the document→field direction is reachable by keyboard
 * (focus publishes the same claim hovering does) and not just by pointer. A `div` rather than a `<button>`
 * because a button would need its browser chrome reset — and the region reveals a relationship rather than
 * performing an action. Focusing already highlights; Enter/Space are
 * wired anyway because anything announced as a button is expected to answer them.
 */
export function RegionBoxes({ boxes, size, activeIndex, setActiveBox, highlight }: RegionBoxesProps) {
  const { activeFieldNames, onRegionEnter, onRegionLeave } = highlight
  return (
    <>
      {boxes.map(({ region, box }, i) => (
        <div
          key={`${region.fieldNames.join(',')}-${i}`}
          ref={i === activeIndex ? setActiveBox : undefined}
          className={`${styles.boundingBoxHighlight} ${isRegionActive(region, activeFieldNames) ? styles.boundingBoxActive : ''}`}
          style={{
            left: box.bbox.x * size.width,
            top: box.bbox.y * size.height,
            width: box.bbox.width * size.width,
            height: box.bbox.height * size.height,
          }}
          role="button"
          tabIndex={0}
          aria-label={`Source of ${region.fieldNames.map(formatSourceFieldLabel).join(', ')}`}
          onMouseEnter={() => onRegionEnter?.(region)}
          onMouseLeave={() => onRegionLeave?.(region)}
          onFocus={() => onRegionEnter?.(region)}
          onBlur={() => onRegionLeave?.(region)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onRegionEnter?.(region)
            }
          }}
        />
      ))}
    </>
  )
}
