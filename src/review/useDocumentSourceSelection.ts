import { useMemo, useState } from 'react'
import type { DocumentDto, DocumentFieldSourceDto } from '../types'
import { getSourceDocumentIds } from './sourceDocumentIds'

export interface DocumentSourceSelection {
  /** Ids of documents some field's provenance points into — badged in the pane's picker. */
  sourceDocumentIds: ReadonlySet<string> | undefined
  /** Document to show: the reviewer's pick, else the first sourced document, else the first document at all. */
  selectedId: string | undefined
  onSelectedIdChange: (id: string) => void
}

/**
 * Selection state for a side-by-side document review pane. Opening on a sourced document rather than the first
 * attachment is the point: the reviewer lands on the file the values were read from, not on whatever happens to
 * sort first. Whether the pane shows at all stays with the caller.
 */
export function useDocumentSourceSelection(
  documents: DocumentDto[],
  fieldSources: Record<string, DocumentFieldSourceDto> | undefined,
): DocumentSourceSelection {
  const sourceDocumentIds = useMemo(() => getSourceDocumentIds(fieldSources), [fieldSources])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | undefined>(undefined)
  const defaultSourceDocumentId = useMemo(
    () => documents.find((doc) => sourceDocumentIds?.has(doc.id))?.id,
    [documents, sourceDocumentIds],
  )

  return {
    sourceDocumentIds,
    selectedId: selectedDocumentId ?? defaultSourceDocumentId ?? documents[0]?.id,
    onSelectedIdChange: setSelectedDocumentId,
  }
}
