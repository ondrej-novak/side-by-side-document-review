import { describe, expect, it } from 'vitest'
import { normalizeValue } from './fieldStatus'
import type { ConsistencyRule } from './consistency'
import {
  checksOutcome,
  confirmationOf,
  failedChecksByField,
  firstPendingFrom,
  nextPending,
  reviewChecks,
  reviewReducer,
  reviewSummary,
  startReview,
  statusOf,
  type ReviewAction,
  type ReviewState,
} from './reviewState'

function review(...actions: ReviewAction[]): ReviewState {
  const start = startReview([
    { name: 'revenue', kind: 'number', aiValue: '184250', aiConfidence: 0.97 },
    { name: 'depreciation', kind: 'number', aiValue: '-6140', aiConfidence: 0.64 },
    { name: 'bankLoans', kind: 'number', aiValue: '' },
    { name: 'companyName', kind: 'text', aiValue: 'Northwind Components s.r.o.', aiConfidence: 0.98 },
  ])
  return actions.reduce(reviewReducer, start)
}

const edit = (field: string, value: string): ReviewAction => ({ type: 'edit', field, value })
const confirm = (field: string): ReviewAction => ({ type: 'toggleConfirm', field })
const confirmSection = (...fields: string[]): ReviewAction => ({ type: 'confirmSection', fields })
const wholeForm = confirmSection('revenue', 'depreciation', 'bankLoans', 'companyName')
const approve: ReviewAction = { type: 'approve' }

describe('normalizeValue', () => {
  it('reads a number however it is spaced or signed', () => {
    expect(normalizeValue('38 900', 'number')).toBe('38900')
    expect(normalizeValue('−6 140', 'number')).toBe('-6140')
    expect(normalizeValue('+6140.0', 'number')).toBe('6140')
    expect(normalizeValue('  ', 'number')).toBe('')
  })

  it('keeps text but ignores spacing around and between words', () => {
    expect(normalizeValue('  Northwind   Components ', 'text')).toBe('Northwind Components')
  })
})

describe('field status', () => {
  it('is pending until the reviewer confirms the AI value', () => {
    expect(statusOf(review(), 'revenue')).toBe('pending')
    expect(statusOf(review(confirm('revenue')), 'revenue')).toBe('confirmed')
  })

  it('toggles back to pending when confirmed twice', () => {
    expect(statusOf(review(confirm('revenue'), confirm('revenue')), 'revenue')).toBe('pending')
  })

  it('is corrected once the value differs from the AI value', () => {
    expect(statusOf(review(edit('depreciation', '-6410')), 'depreciation')).toBe('corrected')
    expect(statusOf(review(edit('depreciation', '')), 'depreciation')).toBe('corrected')
  })

  it('is not corrected when only the formatting changed', () => {
    expect(statusOf(review(edit('depreciation', '-6 140')), 'depreciation')).toBe('pending')
  })

  it('is pending again after a change is reverted, even if it was confirmed before', () => {
    const reverted = review(confirm('revenue'), edit('revenue', '184205'), edit('revenue', '184250'))
    expect(statusOf(reverted, 'revenue')).toBe('pending')
  })

  it('is added when the reviewer fills a field the AI left empty', () => {
    expect(statusOf(review(edit('bankLoans', '38900')), 'bankLoans')).toBe('added')
  })

  it('can confirm that a field the AI left empty really is empty', () => {
    expect(statusOf(review(confirm('bankLoans')), 'bankLoans')).toBe('confirmed')
  })

  it('cannot be confirmed while corrected', () => {
    const state = review(edit('revenue', '1'), confirm('revenue'), edit('revenue', '184250'))
    expect(statusOf(state, 'revenue')).toBe('pending')
  })
})

describe('confirming a section', () => {
  it('confirms every pending field of the section the AI was confident about, and records that it was in bulk', () => {
    const state = review(wholeForm)

    expect(statusOf(state, 'revenue')).toBe('confirmed')
    expect(confirmationOf(state, 'revenue')).toBe('bulk')
  })

  it('leaves fields outside the section alone, however confident the AI was', () => {
    const state = review(confirmSection('revenue', 'depreciation'))

    expect(statusOf(state, 'revenue')).toBe('confirmed')
    expect(statusOf(state, 'companyName')).toBe('pending')
  })

  it('leaves low-confidence fields, and fields without a confidence, for the reviewer to check one by one', () => {
    const state = review(wholeForm)

    expect(statusOf(state, 'depreciation')).toBe('pending')
    expect(statusOf(state, 'bankLoans')).toBe('pending')
  })

  it('leaves corrected fields and earlier single confirmations as they are', () => {
    const state = review(confirm('companyName'), edit('revenue', '1'), wholeForm)

    expect(confirmationOf(state, 'companyName')).toBe('single')
    expect(statusOf(state, 'revenue')).toBe('corrected')
  })

  it('records a confirmation by hand as single', () => {
    expect(confirmationOf(review(confirm('depreciation')), 'depreciation')).toBe('single')
    expect(confirmationOf(review(), 'depreciation')).toBeUndefined()
  })
})

describe('consistency checks', () => {
  const liabilities: ConsistencyRule = {
    id: 'liabilitiesAddUp',
    label: 'Equity + bank loans + other liabilities = total liabilities and equity',
    parts: ['equity', 'bankLoans', 'otherLiabilities'],
    total: 'totalLiabilities',
  }

  function balanceSheet(...actions: ReviewAction[]): ReviewState {
    const start = startReview(
      [
        { name: 'totalAssets', kind: 'number', aiValue: '129750', aiConfidence: 0.96 },
        { name: 'equity', kind: 'number', aiValue: '64200', aiConfidence: 0.93 },
        { name: 'bankLoans', kind: 'number', aiValue: '39800', aiConfidence: 0.71 },
        { name: 'otherLiabilities', kind: 'number', aiValue: '26650', aiConfidence: 0.83 },
        { name: 'totalLiabilities', kind: 'number', aiValue: '129750', aiConfidence: 0.96 },
      ],
      [liabilities],
    )
    return actions.reduce(reviewReducer, start)
  }

  it('are evaluated on the values as they stand, remembering that the AI values failed', () => {
    expect(reviewChecks(balanceSheet())).toMatchObject([{ result: { status: 'failed', difference: 900 }, failedOnAiValues: true }])
    expect(reviewChecks(balanceSheet(edit('bankLoans', '38900')))).toMatchObject([
      { result: { status: 'passed' }, failedOnAiValues: true },
    ])
  })

  it('are failing while any does not add up, and consistent only once every one runs and adds up', () => {
    const corrected = edit('bankLoans', '38900')

    expect(checksOutcome(reviewChecks(balanceSheet()))).toBe('failing')
    expect(checksOutcome(reviewChecks(balanceSheet(corrected)))).toBe('consistent')
    expect(checksOutcome(reviewChecks(balanceSheet(corrected, edit('equity', ''))))).toBe('incomplete')
  })

  it('mark every field of a failing check, the total included', () => {
    const marked = failedChecksByField(balanceSheet())

    expect([...marked.keys()]).toEqual(['equity', 'bankLoans', 'otherLiabilities', 'totalLiabilities'])
    expect(marked.get('equity')).toEqual(['liabilitiesAddUp'])
  })

  const balanceSheetSection = confirmSection('totalAssets', 'equity', 'bankLoans', 'otherLiabilities', 'totalLiabilities')

  it('keep their fields out of a section confirmation, however confident the AI was', () => {
    const state = balanceSheet(balanceSheetSection)

    expect(statusOf(state, 'totalAssets')).toBe('confirmed')
    expect(statusOf(state, 'equity')).toBe('pending')
    expect(statusOf(state, 'totalLiabilities')).toBe('pending')
  })

  it('give their fields back to the section confirmation once the sum adds up', () => {
    expect(statusOf(balanceSheet(edit('bankLoans', '38900'), balanceSheetSection), 'equity')).toBe('confirmed')
  })
})

describe('approving the document', () => {
  const allReviewed = [confirm('revenue'), edit('depreciation', '-6410'), edit('bankLoans', '38900'), confirm('companyName')]

  it('is refused while any field is pending', () => {
    expect(review(confirm('revenue'), approve).approved).toBe(false)
  })

  it('succeeds once every field is reviewed, and then freezes the values', () => {
    const approved = review(...allReviewed, approve, edit('revenue', '1'), confirm('companyName'))

    expect(approved.approved).toBe(true)
    expect(approved.values.revenue).toBe('184250')
    expect(statusOf(approved, 'companyName')).toBe('confirmed')
  })

  it('counts each status', () => {
    expect(reviewSummary(review(...allReviewed))).toEqual({ pending: 0, confirmed: 2, corrected: 1, added: 1 })
  })
})

describe('nextPending', () => {
  it('is the next pending field in form order, skipping reviewed ones', () => {
    expect(nextPending(review(confirm('depreciation')), 'revenue')).toBe('bankLoans')
  })

  it('wraps around to pending fields above', () => {
    expect(nextPending(review(), 'companyName')).toBe('revenue')
  })

  it('starts at the given field itself for firstPendingFrom, wrapping around', () => {
    expect(firstPendingFrom(review(), 'bankLoans')).toBe('bankLoans')
    expect(firstPendingFrom(review(confirm('revenue')), 'revenue')).toBe('depreciation')
    expect(firstPendingFrom(review(confirm('bankLoans'), confirm('companyName')), 'bankLoans')).toBe('revenue')
    expect(firstPendingFrom(review(wholeForm, confirm('depreciation'), confirm('bankLoans')), 'revenue')).toBeUndefined()
  })

  it('is undefined when nothing else is pending', () => {
    expect(nextPending(review(confirm('revenue'), confirm('depreciation'), confirm('bankLoans')), 'companyName')).toBeUndefined()
  })
})
