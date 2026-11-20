import { describe, expect, it } from 'vitest'
import { releaseClaim, resolveClaim, type ActiveFieldSource } from './sourceHighlightClaims'

function claimFor(...fieldNames: string[]): ActiveFieldSource[] {
  return fieldNames.map((fieldName) => ({ fieldName, fileId: 'doc-1', boundingBoxes: [] }))
}

describe('resolveClaim', () => {
  it('has no active field when nothing claims the highlight', () => {
    const resolved = resolveClaim({ hovered: null, fromDocument: null, focused: null })

    expect(resolved.active).toBeNull()
    expect(resolved.activeReason).toBeNull()
    expect(resolved.activeFieldNames.size).toBe(0)
  })

  it('keeps the focused field highlighted once the pointer leaves it', () => {
    const resolved = resolveClaim({ hovered: null, fromDocument: null, focused: claimFor('amount') })

    expect(resolved.active?.fieldName).toBe('amount')
    expect(resolved.activeReason).toBe('focus')
  })

  it('lets a hovered field outrank the focused one', () => {
    const resolved = resolveClaim({ hovered: claimFor('currency'), fromDocument: null, focused: claimFor('amount') })

    expect(resolved.active?.fieldName).toBe('currency')
    expect(resolved.activeReason).toBe('hover')
  })

  it('lets a hovered document region outrank focus but not a hovered field', () => {
    const focused = claimFor('amount')

    expect(resolveClaim({ hovered: null, fromDocument: claimFor('expenseDate'), focused }).activeReason).toBe('document')
    expect(resolveClaim({ hovered: claimFor('currency'), fromDocument: claimFor('expenseDate'), focused }).activeReason).toBe('hover')
  })

  it('reports every field a shared region covers, with the first as the representative', () => {
    const resolved = resolveClaim({ hovered: null, fromDocument: claimFor('amount', 'currency'), focused: null })

    expect(resolved.active?.fieldName).toBe('amount')
    expect([...resolved.activeFieldNames]).toEqual(['amount', 'currency'])
  })
})

describe('releaseClaim', () => {
  it('releases the slot when the claim covers the field', () => {
    expect(releaseClaim(claimFor('amount'), 'amount')).toBeNull()
  })

  it('releases a shared claim from any of its fields', () => {
    expect(releaseClaim(claimFor('amount', 'currency'), 'currency')).toBeNull()
  })

  it('leaves a slot another field has since taken alone', () => {
    const current = claimFor('currency')

    expect(releaseClaim(current, 'amount')).toBe(current)
  })

  it('is a no-op on an empty slot', () => {
    expect(releaseClaim(null, 'amount')).toBeNull()
  })
})
