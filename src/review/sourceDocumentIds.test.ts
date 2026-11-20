import { describe, expect, it } from 'vitest'
import type { DocumentFieldSourceDto } from '../types'
import { getSourceDocumentIds } from './sourceDocumentIds'

function source(fileId: string): DocumentFieldSourceDto {
  return { fileId, boundingBoxes: [] }
}

describe('getSourceDocumentIds', () => {
  it('is undefined without provenance, so the picker badges nothing', () => {
    expect(getSourceDocumentIds(undefined)).toBeUndefined()
    expect(getSourceDocumentIds({})).toBeUndefined()
  })

  it('collects each referenced document once', () => {
    const ids = getSourceDocumentIds({
      amount: source('doc-1'),
      currency: source('doc-1'),
      contract: source('doc-2'),
    })

    expect(ids && [...ids]).toEqual(['doc-1', 'doc-2'])
  })

  it('ignores an entry with no file', () => {
    expect(getSourceDocumentIds({ amount: source('') })).toBeUndefined()
  })
})
