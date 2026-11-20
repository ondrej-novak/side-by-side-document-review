import type { ConsistencyCheckDto, ConsistencyCheckStatus } from '../types'
import { compactNumber } from './fieldStatus'

/** What a check is without its verdict: the parts that must add up to the total. */
export type ConsistencyRule = Pick<ConsistencyCheckDto, 'id' | 'label' | 'parts' | 'total'>

export type CheckResult =
  | { status: 'skipped' }
  | { status: Exclude<ConsistencyCheckStatus, 'skipped'>; sum: number; expected: number; difference: number }

/** Digits with an optional sign and decimal point, as the server reads them. No thousands separators, no exponent. */
const AMOUNT = /^[+-]?(\d+\.?\d*|\.\d+)$/

function amount(value: string | undefined): number | undefined {
  const compact = compactNumber(value ?? '')
  return AMOUNT.test(compact) ? Number(compact) : undefined
}

export function rulesOf(checks: readonly ConsistencyCheckDto[]): ConsistencyRule[] {
  return checks.map(({ id, label, parts, total }) => ({ id, label, parts, total }))
}

/** Every printed figure, the total included, may be off by half a unit from rounding. */
function roundingTolerance(rule: ConsistencyRule): number {
  return (rule.parts.length + 1) / 2
}

/**
 * The same evaluation as the server's (ConsistencyRules.cs), on whatever values the form holds now. A missing or
 * unreadable value skips the check rather than counting as zero.
 */
export function evaluateRule(rule: ConsistencyRule, values: Readonly<Record<string, string>>): CheckResult {
  const parts = rule.parts.map((name) => amount(values[name]))
  const expected = amount(values[rule.total])
  if (expected === undefined || parts.some((part) => part === undefined)) return { status: 'skipped' }

  const sum = parts.reduce<number>((total, part) => total + (part ?? 0), 0)
  const difference = sum - expected
  return { status: Math.abs(difference) <= roundingTolerance(rule) ? 'passed' : 'failed', sum, expected, difference }
}
