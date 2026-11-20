import { useReducer, useRef, type RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { LuCheckCheck } from 'react-icons/lu'
import { rulesOf } from '../review-model/consistency'
import type { FieldStatus } from '../review-model/fieldStatus'
import {
  bulkConfirmable,
  confirmationOf,
  failedChecksByField,
  firstPendingFrom,
  LOW_CONFIDENCE,
  nextPending,
  reviewChecks,
  reviewReducer,
  reviewSummary,
  startReview,
  statusOf,
  type FieldUnderReview,
  type ReviewAction,
} from '../review-model/reviewState'
import type { ConsistencyCheckDto, DocumentFieldSourceDto } from '../types'
import { toPercent } from '../utils/percent'
import { checkElementId, ConsistencyIndicator } from './ConsistencyChecks'
import { ReviewField, type FieldDef } from './ReviewField'
import styles from './ReviewForm.module.css'

const sectionDefs: { title: string; fields: FieldDef[] }[] = [
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

const sections = sectionDefs.map((section) => ({ ...section, names: section.fields.map((field) => field.name) }))

function fieldsUnderReview(fieldSources: Record<string, DocumentFieldSourceDto>): FieldUnderReview[] {
  return sections.flatMap((section) => section.fields).map(({ name, kind }) => {
    const source = fieldSources[name]
    return { name, kind, aiValue: source?.value == null ? '' : String(source.value), aiConfidence: source?.confidence }
  })
}

/**
 * The review state, and the two moves that also shift focus: Enter (confirm, then the next field to check) and
 * Confirm section (then the first field it left for the reviewer, from that section on, or Approve when none is left).
 * Focus moves after a synchronous commit, because Approve is still disabled until the render that clears the last
 * pending field.
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
    confirmSection: (fields: readonly string[]) =>
      dispatchThenFocus({ type: 'confirmSection', fields }, (next) => firstPendingFrom(next, fields[0])),
  }
}

interface SectionProgress {
  /** Values in the section nobody has confirmed, corrected or added yet. */
  pending: number
  /** Of those, the ones confirming the section would confirm. */
  confirmable: number
}

const values = (count: number) => `${count} value${count === 1 ? '' : 's'}`

function sectionHint({ pending, confirmable }: SectionProgress): string {
  if (pending === 0) return 'Every value in this section is checked'
  if (confirmable === 0) {
    return `${values(pending)} left to check one by one: the AI was unsure, or they are in a check that does not add up`
  }
  const rest = pending - confirmable
  const confident = `Confirm the ${values(confirmable)} the AI was at least ${toPercent(LOW_CONFIDENCE)} % sure of`
  return rest === 0 ? confident : `${confident}; ${values(rest)} more to check one by one`
}

interface SectionConfirmProps extends SectionProgress {
  title: string
  onConfirm: () => void
}

/**
 * Confirms the section's confident values at once, from the head of the column of field check buttons. Its tooltip
 * says what it would confirm, or why there is nothing for it to do; aria-disabled rather than disabled keeps that
 * tooltip reachable by hover and focus.
 */
function SectionConfirm({ title, pending, confirmable, onConfirm }: SectionConfirmProps) {
  const inactive = confirmable === 0
  return (
    <button
      type="button"
      className={`iconButton ${styles.sectionConfirm} ${pending === 0 ? styles.sectionDone : ''}`}
      aria-label={`Confirm section: ${title}`}
      title={sectionHint({ pending, confirmable })}
      aria-disabled={inactive}
      onClick={() => {
        if (!inactive) onConfirm()
      }}
    >
      <LuCheckCheck strokeWidth={1.5} aria-hidden="true" />
    </button>
  )
}

interface ReviewFooterProps {
  summary: Record<FieldStatus, number>
  approved: boolean
  approveRef: RefObject<HTMLButtonElement | null>
}

function ReviewFooter({ summary, approved, approveRef }: ReviewFooterProps) {
  const total = summary.pending + summary.confirmed + summary.corrected + summary.added
  const progress = approved
    ? `Approved: ${summary.confirmed} confirmed, ${summary.corrected} corrected, ${summary.added} added`
    : `${total - summary.pending} of ${total} checked`
  return (
    <div className={styles.footer}>
      <span aria-live="polite">{progress}</span>
      <button ref={approveRef} type="submit" className="btnPrimary" disabled={approved || summary.pending > 0}>
        Approve document
      </button>
    </div>
  )
}

interface ReviewFormProps {
  fieldSources: Record<string, DocumentFieldSourceDto>
  checks?: readonly ConsistencyCheckDto[]
  /** Where the consistency checks indicator goes, outside the form; without one it is not shown. */
  checksSlot?: Element | null
}

/**
 * The extracted values to review. Each one is confirmed, corrected or added by the reviewer before the document can
 * be approved; Enter confirms the focused value and moves to the next one still to check. The checks indicator is
 * rendered into the host's slot but stays part of this review, so it follows the values as they are edited.
 */
export function ReviewForm({ fieldSources, checks = [], checksSlot }: ReviewFormProps) {
  const { review, dispatch, formRef, approveRef, confirmAndAdvance, confirmSection } = useReview(fieldSources, checks)
  const failedChecks = failedChecksByField(review)

  return (
    <form ref={formRef} className={styles.form} onSubmit={(e) => {
      e.preventDefault()
      dispatch({ type: 'approve' })
    }}>
      {checksSlot && createPortal(<ConsistencyIndicator checks={reviewChecks(review)} />, checksSlot)}
      {sections.map((section) => (
        <fieldset key={section.title} className={styles.section}>
          <legend className={styles.legend}>{section.title}</legend>
          <SectionConfirm
            title={section.title}
            pending={section.names.filter((name) => statusOf(review, name) === 'pending').length}
            confirmable={review.approved ? 0 : bulkConfirmable(review, section.names).length}
            onConfirm={() => confirmSection(section.names)}
          />
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
      <ReviewFooter summary={reviewSummary(review)} approved={review.approved} approveRef={approveRef} />
    </form>
  )
}
