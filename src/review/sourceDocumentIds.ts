import type { DocumentFieldSourceDto } from '../types'

export function getSourceDocumentIds(fieldSources: Record<string, DocumentFieldSourceDto> | undefined): ReadonlySet<string> | undefined {
  if (!fieldSources) return undefined

  const ids = new Set(Object.values(fieldSources).map((source) => source.fileId).filter((fileId) => !!fileId))
  return ids.size > 0 ? ids : undefined
}
