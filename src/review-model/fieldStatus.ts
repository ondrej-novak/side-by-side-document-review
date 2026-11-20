export type FieldKind = 'text' | 'number'

/**
 * Where one field stands in review. `pending` is not "correct": a value nobody looked at says nothing about the
 * AI, and counting it as correct would measure how often reviewers click through, not how often the AI is right.
 */
export type FieldStatus = 'pending' | 'confirmed' | 'corrected' | 'added'

const WHITESPACE = /\s+/g
const UNICODE_MINUS = /−/g

/** A number as typed, without spaces and with a plain minus: "−38 900" becomes "-38900". */
export function compactNumber(value: string): string {
  return value.replace(WHITESPACE, '').replace(UNICODE_MINUS, '-')
}

/**
 * A value as compared against the AI's: "38 900", "38900" and "+38900.0" are the same number, so retyping a value
 * in another format is not a correction. Text keeps its case but not its surrounding or repeated spaces.
 */
export function normalizeValue(value: string, kind: FieldKind): string {
  if (kind === 'text') return value.trim().replace(WHITESPACE, ' ')
  const compact = compactNumber(value)
  if (compact === '') return ''
  const number = Number(compact)
  return Number.isFinite(number) ? String(number) : compact
}

interface FieldReview {
  kind: FieldKind
  aiValue: string
  value: string
  confirmed: boolean
}

/** Decided by comparing values, not by whether the field was touched: a change reverted is no change. */
export function fieldStatus({ kind, aiValue, value, confirmed }: FieldReview): FieldStatus {
  const ai = normalizeValue(aiValue, kind)
  const current = normalizeValue(value, kind)
  if (current === ai) return confirmed ? 'confirmed' : 'pending'
  return ai === '' ? 'added' : 'corrected'
}
