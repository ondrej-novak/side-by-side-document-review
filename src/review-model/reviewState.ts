import { evaluateRule, type CheckResult, type ConsistencyRule } from './consistency'
import { fieldStatus, type FieldKind, type FieldStatus } from './fieldStatus'

/** Below this the reviewer is asked to look twice, and the field can only be confirmed on its own. */
export const LOW_CONFIDENCE = 0.75

/** One form field and what the AI extracted for it; the AI value is never changed by the review. */
export interface FieldUnderReview {
  name: string
  kind: FieldKind
  aiValue: string
  /** 0–1; a field without one is treated as low confidence. */
  aiConfidence?: number
}

/**
 * How a value was confirmed: on its own, or with the rest of its section. A bulk confirmation is weaker evidence that
 * the value was looked at, so it is kept apart for whoever later measures the AI's accuracy from these decisions.
 */
export type ConfirmMethod = 'single' | 'bulk'

export interface ReviewState {
  /** In form order, which is the order Enter walks through. */
  fields: readonly FieldUnderReview[]
  values: Readonly<Record<string, string>>
  confirmed: ReadonlyMap<string, ConfirmMethod>
  approved: boolean
  rules: readonly ConsistencyRule[]
}

/** A consistency check as it stands now, and whether the AI's values already failed it. */
export interface ReviewedCheck {
  rule: ConsistencyRule
  result: CheckResult
  /** A check that passes now but failed on the AI's values was put right by the reviewer. */
  failedOnAiValues: boolean
}

export type ReviewAction =
  | { type: 'edit'; field: string; value: string }
  | { type: 'toggleConfirm'; field: string }
  | { type: 'confirmSection'; fields: readonly string[] }
  | { type: 'approve' }

export function startReview(fields: readonly FieldUnderReview[], rules: readonly ConsistencyRule[] = []): ReviewState {
  const values = Object.fromEntries(fields.map((field) => [field.name, field.aiValue]))
  return { fields, values, confirmed: new Map(), approved: false, rules }
}

export function reviewChecks(state: ReviewState): ReviewedCheck[] {
  const aiValues = Object.fromEntries(state.fields.map((field) => [field.name, field.aiValue]))
  return state.rules.map((rule) => ({
    rule,
    result: evaluateRule(rule, state.values),
    failedOnAiValues: evaluateRule(rule, aiValues).status === 'failed',
  }))
}

/** All the checks taken together; any check that could not run withholds the all-clear. */
export type ChecksOutcome = 'failing' | 'incomplete' | 'consistent'

export function checksOutcome(checks: readonly ReviewedCheck[]): ChecksOutcome {
  if (checks.some((check) => check.result.status === 'failed')) return 'failing'
  if (checks.some((check) => check.result.status === 'skipped')) return 'incomplete'
  return 'consistent'
}

/** For each field in a check that does not add up now, the ids of those checks: the groups to go through. */
export function failedChecksByField(state: ReviewState): ReadonlyMap<string, string[]> {
  const byField = new Map<string, string[]>()
  for (const { rule, result } of reviewChecks(state)) {
    if (result.status !== 'failed') continue
    for (const name of [...rule.parts, rule.total]) byField.set(name, [...(byField.get(name) ?? []), rule.id])
  }
  return byField
}

export function statusOf(state: ReviewState, name: string): FieldStatus {
  const field = state.fields.find((candidate) => candidate.name === name)
  if (!field) throw new Error(`No field named ${name} is under review`)
  return fieldStatus({
    kind: field.kind,
    aiValue: field.aiValue,
    value: state.values[name] ?? '',
    confirmed: state.confirmed.has(name),
  })
}

/** How the field's current value was confirmed; undefined unless its status is `confirmed`. */
export function confirmationOf(state: ReviewState, name: string): ConfirmMethod | undefined {
  return statusOf(state, name) === 'confirmed' ? state.confirmed.get(name) : undefined
}

export function reviewSummary(state: ReviewState): Record<FieldStatus, number> {
  const counts: Record<FieldStatus, number> = { pending: 0, confirmed: 0, corrected: 0, added: 0 }
  for (const field of state.fields) counts[statusOf(state, field.name)] += 1
  return counts
}

/**
 * The pending fields of a section that confirming the section would confirm: those the AI was confident about,
 * outside any check that does not add up. A confident value in a failing sum is exactly where a bulk confirmation
 * would wave a mistake through. There is no confirming the whole document at once: one section at a time keeps the
 * reviewer looking at the values being confirmed.
 */
export function bulkConfirmable(state: ReviewState, section: readonly string[]): string[] {
  const inFailedCheck = failedChecksByField(state)
  return state.fields
    .filter((field) => section.includes(field.name) && (field.aiConfidence ?? 0) >= LOW_CONFIDENCE)
    .filter((field) => !inFailedCheck.has(field.name) && statusOf(state, field.name) === 'pending')
    .map((field) => field.name)
}

/** Field names in form order starting at `index`, wrapping around to the ones above it. */
function namesFrom(state: ReviewState, index: number): string[] {
  const names = state.fields.map((field) => field.name)
  return [...names.slice(index), ...names.slice(0, index)]
}

/** The first pending field from `from` on in form order, `from` included, wrapping around; undefined when none is. */
export function firstPendingFrom(state: ReviewState, from: string): string | undefined {
  const index = Math.max(state.fields.findIndex((field) => field.name === from), 0)
  return namesFrom(state, index).find((name) => statusOf(state, name) === 'pending')
}

/** The first pending field after `after` in form order, wrapping around; undefined when no other is pending. */
export function nextPending(state: ReviewState, after: string): string | undefined {
  const index = state.fields.findIndex((field) => field.name === after)
  return namesFrom(state, index + 1).find((name) => name !== after && statusOf(state, name) === 'pending')
}

/** Editing withdraws a confirmation: what was confirmed is the earlier value, not whatever the field holds now. */
function edit(state: ReviewState, { field, value }: Extract<ReviewAction, { type: 'edit' }>): ReviewState {
  const confirmed = new Map(state.confirmed)
  confirmed.delete(field)
  return { ...state, values: { ...state.values, [field]: value }, confirmed }
}

/** Only a value that matches the AI's can be confirmed; a changed value is already the reviewer's decision. */
function toggleConfirm(state: ReviewState, field: string): ReviewState {
  const status = statusOf(state, field)
  if (status !== 'pending' && status !== 'confirmed') return state
  const confirmed = new Map(state.confirmed)
  if (status === 'confirmed') confirmed.delete(field)
  else confirmed.set(field, 'single')
  return { ...state, confirmed }
}

function confirmSection(state: ReviewState, section: readonly string[]): ReviewState {
  const confirmed = new Map(state.confirmed)
  for (const name of bulkConfirmable(state, section)) confirmed.set(name, 'bulk')
  return { ...state, confirmed }
}

/** An approved review is final, and approval is refused while any field is still pending. */
export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  if (state.approved) return state
  switch (action.type) {
    case 'edit':
      return edit(state, action)
    case 'toggleConfirm':
      return toggleConfirm(state, action.field)
    case 'confirmSection':
      return confirmSection(state, action.fields)
    case 'approve':
      return reviewSummary(state).pending === 0 ? { ...state, approved: true } : state
  }
}
