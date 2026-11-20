import type { ConsistencyCheckDto, DocumentDto, DocumentFieldSourceDto } from '../types'

export interface Extraction {
  document: DocumentDto
  fieldSources: Record<string, DocumentFieldSourceDto>
  /** Absent from servers older than the checks; the form then shows none. */
  checks?: ConsistencyCheckDto[]
  model?: string
}

/** Sends a PDF to the .NET API (server/) and returns the same shape as the bundled sample. */
export async function extractDocument(file: File, signal?: AbortSignal): Promise<Extraction> {
  const body = new FormData()
  body.append('file', file)

  const res = await fetch('/api/extractions', { method: 'POST', body, signal })
  if (!res.ok) throw new Error(await problemDetail(res))
  return (await res.json()) as Extraction
}

/** The API answers errors as RFC 9457 problem details; falls back to the status when there is no body. */
async function problemDetail(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => null)) as { detail?: string } | null
  return problem?.detail ?? `Extraction failed (HTTP ${res.status})`
}
