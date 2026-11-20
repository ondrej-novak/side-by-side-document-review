import { useReducer, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { HiCheckCircle, HiExclamationTriangle, HiMinusCircle } from 'react-icons/hi2'
import { rulesOf } from '../review-model/consistency'
import type { FieldStatus } from '../review-model/fieldStatus'
import {
  bulkConfirmable,
  confirmationOf,
  failedChecksByField,
  firstPending,
  nextPending,
  reviewChecks,
  reviewReducer,
  reviewSummary,
  startReview,
  statusOf,
  type FieldUnderReview,
  type ReviewAction,
  type ReviewedCheck,
} from '../review-model/reviewState'
import type { ConsistencyCheckDto, DocumentFieldSourceDto } from '../types'
import { ReviewField, type FieldDef } from './ReviewField'
import styles from './ReviewForm.module.css'

const sections: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Company',
    fields: [
      { name: 'companyName', label: 'Company name', kind: 'text' },
      { name: 'registrationNumber', label: 'Registration no.', kind: 'text' },
      { name: 'periodStart', label: 'Period start', kind: 'text' },
      { name: 'periodEnd', label: 'Period end', kind: 'text' },
      { name: 'currency', label: 'Currency', kind: 'text' },
    ],
  },
  {
    title: 'Profit and loss (thousands)',
    fields: [
      { name: 'revenue', label: 'Revenue', kind: 'number' },
      { name: 'costOfSales', label: 'Cost of sales', kind: 'number' },
      { name: 'personnelCosts', label: 'Personnel costs', kind: 'number' },
      { name: 'depreciation', label: 'Depreciation', kind: 'number' },
      { name: 'operatingProfit', label: 'Operating profit (EBIT)', kind: 'number' },
      { name: 'interestExpense', label: 'Interest expense', kind: 'number' },
      { name: 'incomeTax', label: 'Income tax', kind: 'number' },
      { name: 'netProfit', label: 'Net profit', kind: 'number' },
    ],
  },
  {
    title: 'Balance sheet (thousands)',
    fields: [
      { name: 'fixedAssets', label: 'Fixed assets', kind: 'number' },
      { name: 'currentAssets', label: 'Current assets', kind: 'number' },
      { name: 'totalAssets', label: 'Total assets', kind: 'number' },
      { name: 'equity', label: 'Equity', kind: 'number' },
      { name: 'bankLoans', label: 'Bank loans', kind: 'number' },
      { name: 'otherLiabilities', label: 'Other liabilities', kind: 'number' },
      { name: 'totalLiabilities', label: 'Total liabilities and equity', kind: 'number' },
    ],
  },
]

function fieldsUnderReview(fieldSources: Record<string, DocumentFieldSourceDto>): FieldUnderReview[] {
  return sections.flatMap((section) => section.fields).map(({ name, kind }) => {
    const source = fieldSources[name]
    return { name, kind, aiValue: source?.value == null ? '' : String(source.value), aiConfidence: source?.confidence }
  })
}

/**
 * The review state, and the two moves that also shift focus: Enter (confirm, then the next field to check) and
 * Confirm all (then the first field it left for the reviewer, or Approve when none is left). Focus moves after a
 * synchronous commit, because Approve is still disabled until the render that clears the last pending field.
 */
function useReview(fieldSources: Record<string, DocumentFieldSourceDto>, checks: readonly ConsistencyCheckDto[]) {
  const [review, dispatch] = useReducer(reviewReducer, null, () =>
    startReview(fieldsUnderReview(fieldSources), rulesOf(checks)),
  )
  const formRef = useRef<HTMLFormElement>(null)
  const approveRef = useRef<HTMLButtonElement>(null)

  function focusField(name: string | undefined) {
    const target = name ? formRef.current?.elements.namedItem(name) : approveRef.current
    if (target instanceof HTMLElement) target.focus()
  }

  function dispatchThenFocus(action: ReviewAction, focusAfter: (next: typeof review) => string | undefined) {
    const next = reviewReducer(review, action)
    flushSync(() => dispatch(action))
    focusField(focusAfter(next))
  }

  return {
    review,
    dispatch,
    formRef,
    approveRef,
    confirmAndAdvance: (name: string) => {
      if (statusOf(review, name) !== 'pending') return focusField(nextPending(review, name))
      dispatchThenFocus({ type: 'toggleConfirm', field: name }, (next) => nextPending(next, name))
    },
    confirmAll: () => dispatchThenFocus({ type: 'confirmAll' }, firstPending),
  }
}

const checkElementId = (ruleId: string) => `check-${ruleId}`
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function checkNote({ result, failedOnAiValues }: ReviewedCheck): string {
  switch (result.status) {
    case 'failed':
      return `Off by ${amount.format(Math.abs(result.difference))}: the parts add up to ${amount.format(result.sum)}, the total is ${amount.format(result.expected)}`
    case 'passed':
      return failedOnAiValues ? 'Adds up after your corrections' : 'Adds up'
    case 'skipped':
      return 'Not checked: a value is missing or not a plain number'
  }
}

function CheckIcon({ check }: { check: ReviewedCheck }) {
  if (check.result.status === 'failed') return <HiExclamationTriangle className={styles.checkIconFailed} aria-hidden="true" />
  if (check.result.status === 'passed') return <HiCheckCircle className={styles.checkIconPassed} aria-hidden="true" />
  return <HiMinusCircle className={styles.checkIconSkipped} aria-hidden="true" />
}

/**
 * The sums a correct statement always satisfies, on the values as they stand. A failed check cannot say which value
 * is wrong, only which group to go through, so it warns and marks the fields instead of blocking approval.
 */
function ConsistencyChecks({ checks }: { checks: ReviewedCheck[] }) {
  if (checks.length === 0) return null
  const failing = checks.filter((check) => check.result.status === 'failed').length
  return (
    <section className={styles.section} aria-labelledby="consistency-checks-title">
      <h2 id="consistency-checks-title" className={styles.checksTitle}>Consistency checks</h2>
      <p className={styles.checksSummary}>
        {failing === 0
          ? 'Every check that could run adds up.'
          : `${failing} of ${checks.length} do not add up. Their fields are marked, and Confirm all leaves them to you.`}
      </p>
      <ul className={styles.checks}>
        {checks.map((check) => (
          <li
            key={check.rule.id}
            id={checkElementId(check.rule.id)}
            className={`${styles.check} ${check.result.status === 'failed' ? styles.checkFailing : ''}`}
          >
            <CheckIcon check={check} />
            <span>{check.rule.label}</span>
            <span className={styles.checkNote}>{checkNote(check)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface ReviewFooterProps {
  summary: Record<FieldStatus, number>
  approved: boolean
  canConfirmAll: boolean
  onConfirmAll: () => void
  approveRef: RefObject<HTMLButtonElement | null>
}

function ReviewFooter({ summary, approved, canConfirmAll, onConfirmAll, approveRef }: ReviewFooterProps) {
  const total = summary.pending + summary.confirmed + summary.corrected + summary.added
  const progress = approved
    ? `Approved: ${summary.confirmed} confirmed, ${summary.corrected} corrected, ${summary.added} added`
    : `${total - summary.pending} of ${total} checked`
  return (
    <div className={styles.footer}>
      <span aria-live="polite">{progress}</span>
      <div className={styles.footerActions}>
        <button
          type="button"
          className="btnSecondary"
          disabled={approved || !canConfirmAll}
          title="Confirms every unchecked field the AI was at least 75 % sure of, outside checks that do not add up; the rest you check one by one"
          onClick={onConfirmAll}
        >
          Confirm all
        </button>
        <button ref={approveRef} type="submit" className="btnPrimary" disabled={approved || summary.pending > 0}>
          Approve document
        </button>
      </div>
    </div>
  )
}

interface ReviewFormProps {
  fieldSources: Record<string, DocumentFieldSourceDto>
  checks?: readonly ConsistencyCheckDto[]
}

/**
 * The extracted values to review. Each one is confirmed, corrected or added by the reviewer before the document can
 * be approved; Enter confirms the focused value and moves to the next one still to check.
 */
export function ReviewForm({ fieldSources, checks = [] }: ReviewFormProps) {
  const { review, dispatch, formRef, approveRef, confirmAndAdvance, confirmAll } = useReview(fieldSources, checks)
  const failedChecks = failedChecksByField(review)

  return (
    <form ref={formRef} className={styles.form} onSubmit={(e) => {
      e.preventDefault()
      dispatch({ type: 'approve' })
    }}>
      <ConsistencyChecks checks={reviewChecks(review)} />
      {sections.map((section) => (
        <fieldset key={section.title} className={styles.section}>
          <legend className={styles.legend}>{section.title}</legend>
          {section.fields.map((field) => (
            <ReviewField
              key={field.name}
              field={field}
              source={fieldSources[field.name]}
              value={review.values[field.name] ?? ''}
              status={statusOf(review, field.name)}
              confirmation={confirmationOf(review, field.name)}
              failedCheckIds={(failedChecks.get(field.name) ?? []).map(checkElementId)}
              locked={review.approved}
              onChange={(value) => dispatch({ type: 'edit', field: field.name, value })}
              onToggleConfirm={() => dispatch({ type: 'toggleConfirm', field: field.name })}
              onEnter={() => confirmAndAdvance(field.name)}
            />
          ))}
        </fieldset>
      ))}
      <ReviewFooter
        summary={reviewSummary(review)}
        approved={review.approved}
        canConfirmAll={bulkConfirmable(review).length > 0}
        onConfirmAll={confirmAll}
        approveRef={approveRef}
      />
    </form>
  )
}
