import { describe, expect, it } from 'vitest'
import type { DocumentFieldBoundingBoxDto, DocumentFieldSourceDto } from '../types'
import { buildDocumentRegions } from './documentRegions'

function box(overrides: Partial<{ page: number; x: number; y: number; width: number; height: number }> = {}): DocumentFieldBoundingBoxDto {
  const { page = 1, x = 0.55, y = 0.88, width = 0.16, height = 0.03 } = overrides
  return {
    pageNumber: page,
    polygon: [x, y, x + width, y, x + width, y + height, x, y + height],
    bbox: { x, y, width, height },
  }
}

function source(overrides: Partial<DocumentFieldSourceDto> = {}): DocumentFieldSourceDto {
  return { fileId: 'doc-1', boundingBoxes: [box()], ...overrides }
}

describe('buildDocumentRegions', () => {
  it('returns nothing when there are no sources or no document', () => {
    expect(buildDocumentRegions(undefined, 'doc-1')).toEqual([])
    expect(buildDocumentRegions({ amount: source() }, undefined)).toEqual([])
  })

  it('keeps only sources belonging to the shown document', () => {
    const regions = buildDocumentRegions(
      { amount: source(), other: source({ fileId: 'doc-2' }) },
      'doc-1',
    )

    expect(regions).toHaveLength(1)
    expect(regions[0].fieldNames).toEqual(['amount'])
  })

  it('skips a source with no geometry to draw', () => {
    expect(buildDocumentRegions({ amount: source({ boundingBoxes: [] }) }, 'doc-1')).toEqual([])
  })

  it('groups fields sharing identical geometry, like an amount and its currency, into one region', () => {
    const regions = buildDocumentRegions({ amount: source(), currency: source() }, 'doc-1')

    expect(regions).toHaveLength(1)
    expect(regions[0].fieldNames).toEqual(['amount', 'currency'])
  })

  it('keeps fields with different geometry as separate regions', () => {
    const regions = buildDocumentRegions(
      { amount: source(), expenseDate: source({ boundingBoxes: [box({ y: 0.2 })] }) },
      'doc-1',
    )

    expect(regions.map((r) => r.fieldNames)).toEqual([['amount'], ['expenseDate']])
  })

  it('treats geometry on different pages as different regions', () => {
    const regions = buildDocumentRegions(
      { amount: source(), total: source({ boundingBoxes: [box({ page: 2 })] }) },
      'doc-1',
    )

    expect(regions).toHaveLength(2)
  })
})
