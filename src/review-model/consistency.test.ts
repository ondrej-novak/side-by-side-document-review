import { describe, expect, it } from 'vitest'
import { evaluateRule, type ConsistencyRule } from './consistency'

const liabilities: ConsistencyRule = {
  id: 'liabilitiesAddUp',
  label: 'Equity + bank loans + other liabilities = total liabilities and equity',
  parts: ['equity', 'bankLoans', 'otherLiabilities'],
  total: 'totalLiabilities',
}

const printed = { equity: '64200', bankLoans: '38900', otherLiabilities: '26650', totalLiabilities: '129750' }

describe('evaluateRule', () => {
  it('fails with the difference when the parts do not add up to the total', () => {
    expect(evaluateRule(liabilities, { ...printed, bankLoans: '39800' })).toEqual({
      status: 'failed',
      sum: 130650,
      expected: 129750,
      difference: 900,
    })
  })

  it('passes on the printed values', () => {
    expect(evaluateRule(liabilities, printed)).toMatchObject({ status: 'passed', difference: 0 })
  })

  it('reads numbers however they are spaced or signed', () => {
    const typed = { equity: '64 200', bankLoans: '38 900', otherLiabilities: '−26650', totalLiabilities: '+76450.0' }
    expect(evaluateRule(liabilities, typed)).toMatchObject({ status: 'passed' })
  })

  it('skips instead of counting a missing value as zero', () => {
    expect(evaluateRule(liabilities, { ...printed, otherLiabilities: '' })).toEqual({ status: 'skipped' })
    const { equity: _, ...withoutEquity } = printed
    expect(evaluateRule(liabilities, withoutEquity)).toEqual({ status: 'skipped' })
  })

  it.each(['n/a', '38,900', '1e3', '0x10'])('skips %s, which is not a plain number', (bankLoans) => {
    expect(evaluateRule(liabilities, { ...printed, bankLoans })).toEqual({ status: 'skipped' })
  })

  it('allows half a unit of rounding for every figure in the sum', () => {
    expect(evaluateRule(liabilities, { ...printed, totalLiabilities: '129752' }).status).toBe('passed')
    expect(evaluateRule(liabilities, { ...printed, totalLiabilities: '129753' }).status).toBe('failed')
  })
})
