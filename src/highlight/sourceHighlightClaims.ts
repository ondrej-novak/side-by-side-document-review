import type { DocumentFieldSourceDto } from '../types'

export interface ActiveFieldSource extends DocumentFieldSourceDto {
  fieldName: string
}

/**
 * What is claiming the highlight. Each reason owns its own slot so they can't cancel each other out —
 * a blur arriving while the pointer still rests on the field must not drop the highlight, and neither
 * must the mouseleave that fires when the pointer travels over to the document pane.
 * `document` is the reverse direction: the pointer is on a region drawn over the document.
 */
export type HighlightReason = 'hover' | 'focus' | 'document'

/** A claim covers more than one field when several form fields were read off the same extracted field —
 * an amount and its currency code, say, share one region and one confidence score. */
export type Claim = ActiveFieldSource[]

export interface ResolvedClaim {
  /** Representative of the winning claim — names the document and region the pane should show. */
  active: ActiveFieldSource | null
  /** Every field the winning claim covers; more than one only for fields sharing a region. */
  activeFieldNames: ReadonlySet<string>
  activeReason: HighlightReason | null
}

const noFields: ReadonlySet<string> = new Set()

export const noClaim: ResolvedClaim = { active: null, activeFieldNames: noFields, activeReason: null }

/**
 * Whatever the pointer is on wins — a form field, else a document region; when the pointer leaves both, the
 * highlight falls back to whatever still has keyboard focus instead of disappearing.
 */
export function resolveClaim(slots: {
  hovered: Claim | null
  fromDocument: Claim | null
  focused: Claim | null
}): ResolvedClaim {
  const { hovered, fromDocument, focused } = slots
  const winner = hovered ?? fromDocument ?? focused
  if (!winner || winner.length === 0) return noClaim
  return {
    active: winner[0],
    activeFieldNames: new Set(winner.map((s) => s.fieldName)),
    activeReason: hovered ? 'hover' : fromDocument ? 'document' : 'focus',
  }
}

/**
 * Releases a slot only if the claim in it covers this field — a mouseleave or blur arriving after another
 * field has taken the slot must not wipe out that other field's highlight.
 */
export function releaseClaim(current: Claim | null, fieldName: string): Claim | null {
  return current?.some((s) => s.fieldName === fieldName) ? null : current
}
