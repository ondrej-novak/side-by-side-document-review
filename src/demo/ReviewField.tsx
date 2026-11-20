import type { KeyboardEvent } from 'react'
import { HiCheckCircle, HiExclamationTriangle, HiOutlineCheckCircle } from 'react-icons/hi2'
import { useSourceHighlight } from '../highlight/SourceHighlightContext'
import type { FieldKind, FieldStatus } from '../review-model/fieldStatus'
import { LOW_CONFIDENCE, type ConfirmMethod } from '../review-model/reviewState'
import type { DocumentFieldSourceDto } from '../types'
import { toPercent } from '../utils/percent'
import styles from './ReviewForm.module.css'

export interface FieldDef {
  name: string
  label: string
  kind: FieldKind
}

interface ReviewFieldProps {
  field: FieldDef
  source: DocumentFieldSourceDto | undefined
  value: string
  status: FieldStatus
  confirmation: ConfirmMethod | undefined
  /** Element ids of the checks this field is in that do not add up now; they describe the input. */
  failedCheckIds: string[]
  locked: boolean
  onChange: (value: string) => void
  onToggleConfirm: () => void
  /** Enter in the input: confirm if pending, then move on. */
  onEnter: () => void
}

interface MetaInput {
  status: FieldStatus
  confirmation: ConfirmMethod | undefined
  source: DocumentFieldSourceDto
}

function metaText({ status, confirmation, source }: MetaInput): string {
  const confidence = Math.round(toPercent(source.confidence ?? 0))
  if (status === 'confirmed') return `Confirmed${confirmation === 'bulk' ? ' in bulk' : ''} · AI ${confidence} %`
  if (status === 'corrected') return `Corrected by you · AI read ${source.value == null ? 'nothing' : String(source.value)}`
  if (status === 'added') return 'Added by you · AI found nothing'
  const low = (source.confidence ?? 0) < LOW_CONFIDENCE
  return `AI ${confidence} %${low ? ', please check' : ''}`
}

/** The warning sign stays outside the label, so it does not become part of the input's name. */
function FieldLabel({ htmlFor, label, inFailedCheck }: { htmlFor: string; label: string; inFailedCheck: boolean }) {
  return (
    <span className={styles.labelCell}>
      <label htmlFor={htmlFor}>{label}</label>
      {inFailedCheck && (
        <span className={styles.checkMarker} title="In a consistency check that does not add up">
          <HiExclamationTriangle aria-hidden="true" />
        </span>
      )}
    </span>
  )
}

function enterPressed(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing
}

/**
 * One reviewed value. Changing it is itself the reviewer's decision; an unchanged value needs the check button
 * (or Enter), so a field nobody looked at never counts as correct.
 */
export function ReviewField({ field, source, value, status, confirmation, failedCheckIds, locked, onChange, onToggleConfirm, onEnter }: ReviewFieldProps) {
  const { publish, clear, activeFieldNames, isActive, anchors } = useSourceHighlight()
  const id = `field-${field.name}`
  const flagged = status === 'pending' && source?.confidence !== undefined && source.confidence < LOW_CONFIDENCE
  const claim = source && { ...source, fieldName: field.name }
  const showMeta = isActive && source?.confidence !== undefined
  const describedBy = [...(showMeta ? [`${id}-meta`] : []), ...failedCheckIds].join(' ')

  return (
    <div
      ref={(el) => anchors.setField(field.name, el)}
      className={`${styles.field} ${activeFieldNames.has(field.name) ? styles.highlighted : ''}`}
      onMouseEnter={() => claim && publish(claim, 'hover')}
      onMouseLeave={() => clear(field.name, 'hover')}
    >
      <FieldLabel htmlFor={id} label={field.label} inFailedCheck={failedCheckIds.length > 0} />
      <input
        id={id}
        name={field.name}
        className={`${styles.input} ${flagged ? styles.lowInput : ''} ${status === 'confirmed' ? styles.confirmedInput : ''}`}
        inputMode={field.kind === 'number' ? 'numeric' : undefined}
        value={value}
        readOnly={locked}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!enterPressed(e)) return
          e.preventDefault()
          onEnter()
        }}
        onFocus={() => claim && publish(claim, 'focus')}
        onBlur={() => clear(field.name, 'focus')}
        aria-describedby={describedBy || undefined}
      />
      <button
        type="button"
        className={`iconButton ${styles.confirm} ${status === 'confirmed' ? styles.confirmed : ''}`}
        aria-label={`Confirm ${field.label}`}
        aria-pressed={status === 'confirmed'}
        title={status === 'corrected' || status === 'added' ? 'Your change already counts as reviewed' : 'Confirm (Enter)'}
        disabled={locked || status === 'corrected' || status === 'added'}
        onClick={onToggleConfirm}
      >
        {status === 'confirmed' ? <HiCheckCircle /> : <HiOutlineCheckCircle />}
      </button>
      {showMeta && source && (
        <span id={`${id}-meta`} className={`${styles.meta} ${flagged ? styles.low : ''}`}>{metaText({ status, confirmation, source })}</span>
      )}
    </div>
  )
}
