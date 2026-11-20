import { describe, expect, it } from 'vitest'
import { createSourceAnchors } from './sourceAnchors'

function attached(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('createSourceAnchors', () => {
  it('has no endpoints before anything registers', () => {
    const anchors = createSourceAnchors()

    expect(anchors.region()).toBeNull()
    expect(anchors.field(new Set(['amount']))).toBeNull()
  })

  it('returns the registered region and field', () => {
    const anchors = createSourceAnchors()
    const region = attached()
    const field = attached()

    anchors.setRegion(region)
    anchors.setField('amount', field)

    expect(anchors.region()).toBe(region)
    expect(anchors.field(new Set(['amount']))).toBe(field)
  })

  it('releases an endpoint set to null', () => {
    const anchors = createSourceAnchors()
    anchors.setRegion(attached())
    anchors.setField('amount', attached())

    anchors.setRegion(null)
    anchors.setField('amount', null)

    expect(anchors.region()).toBeNull()
    expect(anchors.field(new Set(['amount']))).toBeNull()
  })

  it('drops an endpoint whose element left the document, instead of anchoring to its zeroed rect', () => {
    const anchors = createSourceAnchors()
    const region = attached()
    const field = attached()
    anchors.setRegion(region)
    anchors.setField('amount', field)

    region.remove()
    field.remove()

    expect(anchors.region()).toBeNull()
    expect(anchors.field(new Set(['amount']))).toBeNull()
  })

  it('takes the first registered field among the names sharing a region', () => {
    const anchors = createSourceAnchors()
    const currency = attached()
    anchors.setField('currency', currency)

    expect(anchors.field(new Set(['amount', 'currency']))).toBe(currency)
  })

  it('skips a named field that is no longer attached in favour of one that is', () => {
    const anchors = createSourceAnchors()
    const amount = attached()
    const currency = attached()
    anchors.setField('amount', amount)
    anchors.setField('currency', currency)

    amount.remove()

    expect(anchors.field(new Set(['amount', 'currency']))).toBe(currency)
  })

  it('has no field for a name nothing registered', () => {
    const anchors = createSourceAnchors()
    anchors.setField('amount', attached())

    expect(anchors.field(new Set(['expenseDate']))).toBeNull()
  })
})
