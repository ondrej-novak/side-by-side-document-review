import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useExternalSync } from '../hooks/useExternalSync'
import { createSourceAnchors, type SourceAnchors } from './sourceAnchors'
import {
  noClaim,
  releaseClaim,
  resolveClaim,
  type ActiveFieldSource,
  type Claim,
  type HighlightReason,
} from './sourceHighlightClaims'

export type { ActiveFieldSource, HighlightReason } from './sourceHighlightClaims'

interface SourceHighlightContextValue {
  /** Representative of the current claim — names the document and region the pane should show. */
  active: ActiveFieldSource | null
  /** Every field the current claim covers; more than one only for fields sharing a region. */
  activeFieldNames: ReadonlySet<string>
  /** Which claim `active` came from — lets the form field tell "I'm hovered" apart from "the document pane picked me". */
  activeReason: HighlightReason | null
  publish: (source: ActiveFieldSource | ActiveFieldSource[], reason: HighlightReason) => void
  /** Releases the claim this field is part of — a no-op if another field's claim now holds that slot. */
  clear: (fieldName: string, reason: HighlightReason) => void
  /** True only inside a real Provider with a document pane actually mounted alongside the form. */
  isActive: boolean
  /** Where the claim's two ends currently sit on screen, for the connector drawn between them. */
  anchors: SourceAnchors
}

const inertValue: SourceHighlightContextValue = {
  ...noClaim,
  publish: () => {},
  clear: () => {},
  isActive: false,
  anchors: createSourceAnchors(),
}

const SourceHighlightContext = createContext<SourceHighlightContextValue>(inertValue)

/**
 * A field renderer calls this to publish "show my source" and to check `isActive` before rendering an
 * indicator at all — with no document pane on this page the value stays inert, so a plain form elsewhere in
 * the app never shows a marker pointing at a pane that isn't there.
 */
export function useSourceHighlight(): SourceHighlightContextValue {
  return useContext(SourceHighlightContext)
}

/**
 * One claim slot per reason, with stable `publish` and `clear`, emptied whenever highlighting is disabled.
 * Closing the pane can leave a claim behind — the toggle takes the pointer away from a field without a
 * mouseleave, or is triggered from the keyboard while a field is hovered. A stranded `hover` claim outranks
 * focus, so it would still be holding the highlight when the pane is reopened.
 */
function useClaimSlots(enabled: boolean) {
  const [hovered, setHovered] = useState<Claim | null>(null)
  const [focused, setFocused] = useState<Claim | null>(null)
  const [fromDocument, setFromDocument] = useState<Claim | null>(null)

  useExternalSync(() => {
    if (enabled) return
    setHovered(null)
    setFocused(null)
    setFromDocument(null)
  }, [enabled])

  const actions = useMemo(() => {
    const setterFor = (reason: HighlightReason) =>
      reason === 'hover' ? setHovered : reason === 'document' ? setFromDocument : setFocused
    return {
      publish: (source: ActiveFieldSource | ActiveFieldSource[], reason: HighlightReason) => {
        const claim = Array.isArray(source) ? source : [source]
        if (claim.length > 0) setterFor(reason)(claim)
      },
      clear: (fieldName: string, reason: HighlightReason) =>
        setterFor(reason)((prev) => releaseClaim(prev, fieldName)),
    }
  }, [])

  return { hovered, focused, fromDocument, ...actions }
}

/**
 * Bridges a form field's source highlight to the sibling document pane, in both directions. Provided once by
 * `DocumentReviewLayout` — the component that composes the document and form panes together — so a field
 * arbitrarily deep in the form tree and the document pane can share one selection without prop-drilling
 * across the two sibling trees.
 *
 * Inert rather than absent while the document pane is closed: the caller keeps one stable tree (a conditional
 * Provider changes the element type at this position, which remounts both panes and the whole form), and
 * `isActive: false` still keeps fields from showing an indicator with nothing to point at.
 */
export function SourceHighlightProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const { hovered, focused, fromDocument, publish, clear } = useClaimSlots(enabled)
  const anchorsRef = useRef<SourceAnchors | null>(null)
  anchorsRef.current ??= createSourceAnchors()

  const value = useMemo<SourceHighlightContextValue>(
    () => enabled
      ? { ...resolveClaim({ hovered, fromDocument, focused }), publish, clear, isActive: true, anchors: anchorsRef.current! }
      : inertValue,
    [enabled, hovered, focused, fromDocument, publish, clear],
  )

  return <SourceHighlightContext.Provider value={value}>{children}</SourceHighlightContext.Provider>
}
