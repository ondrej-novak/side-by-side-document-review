import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentFieldBoundingBoxDto } from '../../types'
import type { DocumentSourceRegion } from '../documentRegions'
import { PageView, usePageView } from './PageView'
import type { PageControls, PixelSize, RegionHighlightProps } from './types'

function box(pageNumber: number, bbox = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }): DocumentFieldBoundingBoxDto {
  const { x, y, width, height } = bbox
  return { pageNumber, polygon: [x, y, x + width, y, x + width, y + height, x, y + height], bbox }
}

function region(fieldName: string, pageNumber: number): DocumentSourceRegion {
  return { fieldNames: [fieldName], boundingBoxes: [box(pageNumber)] }
}

function highlightOf(overrides: Partial<RegionHighlightProps> = {}): RegionHighlightProps {
  return { regions: [region('total', 1), region('vendor', 2)], followActive: true, ...overrides }
}

interface HarnessProps {
  highlight: RegionHighlightProps
  pages?: PageControls
  size: PixelSize | null
  mounted?: boolean
}

/** A caller of the module, as PdfDocument and ImageDocument are: the hook, then the view only once there is a page. */
function Harness({ highlight, pages, size, mounted = true }: HarnessProps) {
  const view = usePageView({ highlight, pages })
  return (
    <>
      <output data-testid="width">{String(view.width)}</output>
      {mounted && <PageView view={view} size={size}><canvas /></PageView>}
    </>
  )
}

const drawnRegions = () => screen.queryAllByRole('button', { name: /^Source of/ })
const width = () => screen.getByTestId('width').textContent

describe('PageView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('draws only the current page’s regions, scaled to the page, and none before the page has a size', () => {
    const { rerender } = render(<Harness highlight={highlightOf()} size={null} />)

    expect(drawnRegions()).toHaveLength(0)

    rerender(<Harness highlight={highlightOf()} size={{ width: 200, height: 100 }} />)

    expect(drawnRegions()).toHaveLength(1)
    expect(drawnRegions()[0].getAttribute('aria-label')).toBe('Source of total')
    expect(drawnRegions()[0].style).toMatchObject({ left: '20px', top: '20px', width: '60px', height: '10px' })
  })

  it('hands the active region to onActiveRegionRef once, without a null in between on re-render', () => {
    const onActiveRegionRef = vi.fn()
    const activeFieldNames = new Set(['total'])
    const props = () => ({ highlight: highlightOf({ activeFieldNames, onActiveRegionRef }), size: { width: 200, height: 100 } })
    const { rerender } = render(<Harness {...props()} />)

    rerender(<Harness {...props()} />)
    rerender(<Harness {...props()} />)

    expect(onActiveRegionRef).toHaveBeenCalledTimes(1)
    expect(onActiveRegionRef).toHaveBeenCalledWith(drawnRegions()[0])
  })

  it('pages to the active region’s page when following it', () => {
    const setPage = vi.fn()
    const highlight = highlightOf({ activeFieldNames: new Set(['vendor']) })

    render(<Harness highlight={highlight} pages={{ page: 1, pageCount: 3, setPage }} size={null} />)

    expect(setPage).toHaveBeenCalledWith(2)
  })

  it('stays on the page when not following, or when the active region’s page does not exist', () => {
    const setPage = vi.fn()
    const activeFieldNames = new Set(['vendor'])

    render(<Harness highlight={highlightOf({ activeFieldNames, followActive: false })} pages={{ page: 1, pageCount: 3, setPage }} size={null} />)
    render(<Harness highlight={highlightOf({ activeFieldNames })} pages={{ page: 1, pageCount: 1, setPage }} size={null} />)

    expect(setPage).not.toHaveBeenCalled()
  })

  it('measures a scroll area that mounts after the first render, and again after it remounts', () => {
    const observers: { observed: Element[]; report: (width: number) => void }[] = []
    vi.stubGlobal('ResizeObserver', class {
      observed: Element[] = []
      constructor(callback: ResizeObserverCallback) {
        observers.push(this as unknown as (typeof observers)[number])
        Object.assign(this, { report: (width: number) => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver) })
      }
      observe(el: Element) { this.observed.push(el) }
      disconnect() { this.observed = [] }
    })
    const props = { highlight: highlightOf(), size: null }
    const { rerender } = render(<Harness {...props} mounted={false} />)

    rerender(<Harness {...props} />)
    act(() => observers.at(-1)?.report(500))

    expect(width()).toBe('504')

    rerender(<Harness {...props} mounted={false} />)
    rerender(<Harness {...props} />)
    act(() => observers.at(-1)?.report(260))

    expect(observers).toHaveLength(2)
    expect(observers[0].observed).toEqual([])
    expect(width()).toBe('264')
  })
})
