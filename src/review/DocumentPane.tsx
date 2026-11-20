import type { ReactNode } from 'react'
import { Suspense, lazy, useMemo, useRef } from 'react'
import { HiOutlineDocumentText } from 'react-icons/hi2'
import type { QueryKey } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import type { DocumentDto, DocumentFieldSourceDto } from '../types'
import { useSourceHighlight, type ActiveFieldSource, type HighlightReason } from '../highlight/SourceHighlightContext'
import { useExternalSync } from '../hooks/useExternalSync'
import { useSubscription } from '../hooks/useSubscription'
import { buildDocumentRegions, type DocumentSourceRegion } from './documentRegions'
import styles from './DocumentPane.module.scss'

const DocumentViewer = lazy(() => import('./DocumentViewer'))

type FieldSources = Record<string, DocumentFieldSourceDto>
type ClearClaim = (fieldName: string, reason: HighlightReason) => void

interface DocumentPaneProps {
  documents: DocumentDto[]
  /** Fetches a document's bytes. */
  loadDocument: (documentId: string) => Promise<Blob>
  /** React Query key for a document's bytes. */
  documentQueryKey: (documentId: string) => QueryKey
  /** Id of the document to show; the caller owns selection so controls outside the pane can drive it.
   * Undefined (or an id this pane doesn't list) falls back to the first document. */
  selectedId: string | undefined
  onSelectedIdChange: (id: string) => void
  /** Ids of documents referenced by a `fieldSources` entry — badged in the picker as an extraction source. */
  sourceDocumentIds?: ReadonlySet<string>
  /** Every field's provenance, keyed by field name — drawn as regions over the document so hovering one
   * highlights the form field it filled. Same map the form is given. */
  fieldSources?: FieldSources
}

/** The claim a hovered region makes on the form: every field read off it that still has a source. */
function regionClaim(region: DocumentSourceRegion, fieldSources: FieldSources | undefined): ActiveFieldSource[] {
  return region.fieldNames.flatMap((fieldName) => {
    const source = fieldSources?.[fieldName]
    return source ? [{ ...source, fieldName }] : []
  })
}

/**
 * Releases every name in the region, not just the first: `regionClaim` drops fields whose source went missing,
 * so releasing by one representative name would depend on that name having survived the filter.
 */
function releaseRegion(region: DocumentSourceRegion, clear: ClearClaim): void {
  region.fieldNames.forEach((fieldName) => clear(fieldName, 'document'))
}

/**
 * A field's source can name a document other than the one currently shown — switch to it, but only if the pane
 * actually lists it: a source pointing at an unlisted file would set `selectedId` to a phantom id, and the pane
 * silently falls back to the first document while the picker shows something else.
 */
function useFollowActiveDocument({ selectedId, documents, onSelectedIdChange }: Pick<DocumentPaneProps, 'selectedId' | 'documents' | 'onSelectedIdChange'>) {
  const { active } = useSourceHighlight()
  useExternalSync(() => {
    if (active && active.fileId !== selectedId && documents.some((d) => d.id === active.fileId)) {
      onSelectedIdChange(active.fileId)
    }
  }, [active, selectedId, documents, onSelectedIdChange])
}

/**
 * Releases whatever the pane's regions published when they go away. React fires no mouseleave when the hovered
 * rectangle is removed (document switch, regions recompute, unmount), and a stuck `document` claim outranks
 * keyboard focus and keeps forcing the pane back to its file — the reviewer then cannot change documents at all.
 * `clear` goes through a ref so the cleanup runs only when the regions change, never because `clear` did.
 */
function useReleaseRegionClaims(regions: DocumentSourceRegion[]) {
  const { clear } = useSourceHighlight()
  const clearRef = useRef(clear)
  useExternalSync(() => { clearRef.current = clear }, [clear])
  useSubscription(() => () => {
    regions.forEach((region) => releaseRegion(region, clearRef.current))
  }, [regions])
}

/**
 * The document picker, shown only when there is more than one document. Rendered above a failed load too, on
 * purpose: one unreadable document must not strand the reviewer on it when there are others to read.
 */
function DocumentPicker({ documents, selectedId, sourceDocumentIds, onChange }: {
  documents: DocumentDto[]
  selectedId: string
  sourceDocumentIds?: ReadonlySet<string>
  onChange: (id: string) => void
}) {
  if (documents.length <= 1) return null
  return (
    <div className={styles.picker}>
      <select aria-label="Select document" value={selectedId} onChange={(e) => onChange(e.target.value)}>
        {documents.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {`${doc.fileName}${sourceDocumentIds?.has(doc.id) ? ' (source)' : ''}`}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * The viewer for one document, wired to the shared highlight. Keyed per document so page, zoom, and the loaded
 * pdf.js handle reset with the file rather than carrying over from the previously shown one. Fields are only
 * emphasized once the pane has actually switched to their source document — right after a click, the claim may
 * still point at a document the pane hasn't caught up to yet.
 */
function HighlightedDocumentViewer({ document, blob, regions, fieldSources }: {
  document: DocumentDto
  blob: Blob | undefined
  regions: DocumentSourceRegion[]
  fieldSources: FieldSources | undefined
}) {
  const { active, activeFieldNames, activeReason, publish, clear, anchors } = useSourceHighlight()

  return (
    <div className={styles.viewerHost}>
      <Suspense fallback={<div className={styles.empty}>Loading viewer…</div>}>
        <DocumentViewer
          key={document.id}
          blob={blob}
          fileName={document.fileName}
          mimeType={document.mimeType}
          regions={regions}
          activeFieldNames={active?.fileId === document.id ? activeFieldNames : undefined}
          followActive={activeReason !== 'document'}
          onRegionEnter={(region) => {
            const claim = regionClaim(region, fieldSources)
            if (claim.length > 0) publish(claim, 'document')
          }}
          onRegionLeave={(region) => releaseRegion(region, clear)}
          onActiveRegionRef={anchors.setRegion}
        />
      </Suspense>
    </div>
  )
}

/**
 * The document side of a side-by-side review: a picker (when more than one document is available) over a lazy
 * document viewer. Callers supply the document list, a byte loader, and a cache-key factory. Highlighting runs
 * both ways: the field the form publishes is emphasized here, and hovering a region here publishes every field
 * read off it back to the form.
 */
export function DocumentPane({ documents, loadDocument, documentQueryKey, selectedId, onSelectedIdChange, sourceDocumentIds, fieldSources }: DocumentPaneProps) {
  const selected = documents.find((d) => d.id === selectedId) ?? documents[0]
  const regions = useMemo(() => buildDocumentRegions(fieldSources, selected?.id), [fieldSources, selected?.id])

  useFollowActiveDocument({ selectedId, documents, onSelectedIdChange })
  useReleaseRegionClaims(regions)

  const { data: blob, isError, refetch } = useQuery({
    queryKey: documentQueryKey(selected?.id ?? ''),
    queryFn: () => loadDocument(selected!.id),
    enabled: !!selected,
    staleTime: Infinity,
  })

  if (!selected) {
    return (
      <div className={styles.pane}>
        <DocumentPlaceholder title="No documents to review" message="No document has been added yet." />
      </div>
    )
  }

  const picker = (
    <DocumentPicker documents={documents} selectedId={selected.id} sourceDocumentIds={sourceDocumentIds} onChange={onSelectedIdChange} />
  )

  return (
    <div className={styles.pane}>
      {picker}
      {isError ? (
        <DocumentPlaceholder
          title="This document could not be opened"
          message={`We couldn't fetch ${selected.fileName}. It may have been moved, or the connection dropped on the way.`}
          action={<button type="button" className="btnPrimary" onClick={() => void refetch()}>Try again</button>}
        />
      ) : (
        <HighlightedDocumentViewer document={selected} blob={blob} regions={regions} fieldSources={fieldSources} />
      )}
    </div>
  )
}

/**
 * The placeholder shown instead of a document — no file to review, or one that failed to load. Centred column
 * so the icon reads as the missing document's stand-in and the recovery action sits directly under the text it
 * belongs to, rather than trailing the sentence inline.
 */
function DocumentPlaceholder({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className={styles.placeholder}>
      <HiOutlineDocumentText className={styles.placeholderIcon} aria-hidden />
      <h3 className={styles.placeholderTitle}>{title}</h3>
      <p className={styles.placeholderText}>{message}</p>
      {action}
    </div>
  )
}

export default DocumentPane
