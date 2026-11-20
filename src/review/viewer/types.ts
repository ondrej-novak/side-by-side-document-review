import type { Dispatch, SetStateAction } from 'react'
import type { DocumentSourceRegion } from '../documentRegions'

export interface PixelSize {
  width: number
  height: number
}

export interface PageControls {
  page: number
  pageCount: number
  setPage: Dispatch<SetStateAction<number>>
}

/** What the pane tells the viewer about field sources, and how the viewer answers back. */
export interface RegionHighlightProps {
  regions?: DocumentSourceRegion[]
  activeFieldNames?: ReadonlySet<string>
  followActive: boolean
  onRegionEnter?: (region: DocumentSourceRegion) => void
  onRegionLeave?: (region: DocumentSourceRegion) => void
  onActiveRegionRef?: (el: HTMLElement | null) => void
}
