import type { DocumentFieldBoundingBoxDto, DocumentFieldSourceDto } from '../types'

/** One extracted region on this document, and the form fields filled from it — several when an extractor
 * reports one field for values the form splits up (an amount and its currency code share a region). */
export interface DocumentSourceRegion {
  fieldNames: string[]
  boundingBoxes: DocumentFieldBoundingBoxDto[]
}

/**
 * Groups the fields' provenance into the regions to draw over one document.
 *
 * Fields whose geometry is identical become a single region covering all of them: an extractor reporting a
 * total as `{amount, currencyCode}` gives two form fields the same box, and drawing one rectangle per field
 * would stack them, leaving whichever happened to paint last the only one the pointer could reach — making
 * which field a region belongs to look arbitrary.
 */
export function buildDocumentRegions(
  fieldSources: Record<string, DocumentFieldSourceDto> | undefined,
  documentId: string | undefined,
): DocumentSourceRegion[] {
  if (!fieldSources || !documentId) return []

  const byGeometry = new Map<string, DocumentSourceRegion>()
  for (const [fieldName, source] of Object.entries(fieldSources)) {
    if (source.fileId !== documentId || !source.boundingBoxes?.length) continue
    const key = JSON.stringify(source.boundingBoxes)
    const existing = byGeometry.get(key)
    if (existing) existing.fieldNames.push(fieldName)
    else byGeometry.set(key, { fieldNames: [fieldName], boundingBoxes: source.boundingBoxes })
  }
  return [...byGeometry.values()]
}
