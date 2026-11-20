/** A document the reviewer can open beside the form. */
export interface DocumentDto {
  id: string
  fileName: string
  mimeType: string
  size: number
}

/** Where one extracted value came from: the file, the AI's reading of it, and the regions it was read off. */
export interface DocumentFieldSourceDto {
  fileId: string
  value?: unknown
  type?: string
  content?: string
  /** Extractor confidence, 0–1. */
  confidence?: number
  boundingBoxes: DocumentFieldBoundingBoxDto[]
}

export interface DocumentFieldBoundingBoxDto {
  /** 1-based page number. */
  pageNumber: number
  polygon: number[]
  /** Normalized to the page: 0–1 on both axes. */
  bbox: DocumentFieldRectDto
}

export type ConsistencyCheckStatus = 'passed' | 'failed' | 'skipped'

/**
 * One consistency rule as the server evaluated it on the AI's values. The rule itself (parts that must add up to the
 * total) comes along, so the form can evaluate it again against the reviewer's corrections.
 */
export interface ConsistencyCheckDto {
  id: string
  label: string
  parts: string[]
  total: string
  status: ConsistencyCheckStatus
  /** Null when the check was skipped, like `expected` and `difference`. */
  sum: number | null
  expected: number | null
  difference: number | null
}

export interface DocumentFieldRectDto {
  x: number
  y: number
  width: number
  height: number
}
