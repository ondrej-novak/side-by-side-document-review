import { useId, useRef, useState } from 'react'
import { HiCheckCircle, HiExclamationTriangle, HiMinusCircle } from 'react-icons/hi2'
import { useSubscription } from '../hooks/useSubscription'
import { checksOutcome, type ChecksOutcome, type ReviewedCheck } from '../review-model/reviewState'
import styles from './ConsistencyChecks.module.css'

/** The element describing a check; a field in a check that does not add up points its description at it. */
export const checkElementId = (ruleId: string) => `check-${ruleId}`

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
  if (check.result.status === 'failed') return <HiExclamationTriangle className={styles.iconFailed} aria-hidden="true" />
  if (check.result.status === 'passed') return <HiCheckCircle className={styles.iconPassed} aria-hidden="true" />
  return <HiMinusCircle className={styles.iconSkipped} aria-hidden="true" />
}

function OutcomeIcon({ outcome }: { outcome: ChecksOutcome }) {
  if (outcome === 'failing') return <HiExclamationTriangle aria-hidden="true" />
  if (outcome === 'consistent') return <HiCheckCircle aria-hidden="true" />
  return <HiMinusCircle aria-hidden="true" />
}

function outcomeLabel({ outcome, failing, total }: { outcome: ChecksOutcome; failing: number; total: number }): string {
  switch (outcome) {
    case 'failing':
      return `Consistency checks: ${failing} of ${total} do not add up`
    case 'incomplete':
      return 'Consistency checks: none fails, but some could not run'
    case 'consistent':
      return 'Consistency checks: all add up'
  }
}

/** Open while the reviewer looks; a press outside or Escape closes it, and Escape from inside returns to the button. */
function useDropdown() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useSubscription(() => {
    if (!open) return () => {}
    const inside = (node: EventTarget | null) => node instanceof Node && !!rootRef.current?.contains(node)
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (inside(document.activeElement)) buttonRef.current?.focus()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, toggle: () => setOpen((wasOpen) => !wasOpen), rootRef, buttonRef }
}

/**
 * The sums a correct statement always satisfies, on the values as they stand, behind one button that says how they
 * stand. A failed check cannot say which value is wrong, only which group to go through, so it warns and marks the
 * fields instead of blocking approval. The list stays in the DOM while closed: the marked fields are described by it.
 * The panel is placed against the nearest positioned ancestor, which the host provides.
 */
export function ConsistencyIndicator({ checks }: { checks: ReviewedCheck[] }) {
  const { open, toggle, rootRef, buttonRef } = useDropdown()
  const panelId = useId()
  const titleId = useId()
  if (checks.length === 0) return null

  const outcome = checksOutcome(checks)
  const failing = checks.filter((check) => check.result.status === 'failed').length
  const label = outcomeLabel({ outcome, failing, total: checks.length })

  return (
    <div ref={rootRef} className={styles.indicator}>
      <button
        ref={buttonRef}
        type="button"
        className={`btnSecondary ${styles.button} ${styles[outcome]}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <OutcomeIcon outcome={outcome} />
        {failing > 0 && <span className={styles.badge} aria-hidden="true">{failing}</span>}
      </button>
      <section id={panelId} className={styles.panel} aria-labelledby={titleId} hidden={!open}>
        <h2 id={titleId} className={styles.title}>Consistency checks</h2>
        <p className={styles.summary}>
          {failing === 0
            ? 'Every check that could run adds up.'
            : `${failing} of ${checks.length} do not add up. Their fields are marked, and confirming a section leaves them to you.`}
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
              <span className={styles.note}>{checkNote(check)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
