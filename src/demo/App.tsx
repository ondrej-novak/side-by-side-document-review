import { useMemo, useRef, useState } from 'react'
import { DocumentReviewLayout } from '../review/DocumentReviewLayout'
import { DocumentPane } from '../review/DocumentPane'
import { useDocumentSourceSelection } from '../review/useDocumentSourceSelection'
import { ReviewForm } from './ReviewForm'
import { sample } from './sample'
import { extractDocument, type Extraction } from './extractionApi'
import styles from './App.module.css'

interface Review extends Extraction {
  loadDocument: () => Promise<Blob>
}

interface UploadStatus {
  busy: boolean
  error?: string
}

const sampleReview: Review = {
  ...sample,
  loadDocument: async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}sample/${sample.document.fileName}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  },
}

/** The review on screen: the bundled sample until a PDF is uploaded, then that PDF's extraction. */
function useReviewUpload() {
  const [review, setReview] = useState<Review>(sampleReview)
  const [status, setStatus] = useState<UploadStatus>({ busy: false })

  async function upload(file: File) {
    setStatus({ busy: true })
    try {
      const extraction = await extractDocument(file)
      setReview({ ...extraction, loadDocument: async () => file })
      setStatus({ busy: false })
    } catch (e) {
      setStatus({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return { review, status, upload }
}

function statusText(status: UploadStatus, review: Review): string {
  if (status.busy) return 'Reading the document…'
  if (status.error) return `Could not extract: ${status.error}`
  if (review.model) return `${review.document.fileName}, extracted by ${review.model}`
  return 'Showing the bundled sample extraction.'
}

function UploadButton({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <button type="button" className="btnSecondary" disabled={busy} onClick={() => fileInput.current?.click()}>
        Upload PDF
      </button>
    </>
  )
}

/**
 * The document beside the form. A new document starts a new review: the form is keyed by the document id, so
 * remounting it drops the previous form's edits.
 */
interface ReviewWorkspaceProps {
  review: Review
  showDocument: boolean
  checksSlot: Element | null
}

function ReviewWorkspace({ review, showDocument, checksSlot }: ReviewWorkspaceProps) {
  const documents = useMemo(() => [review.document], [review.document])
  const selection = useDocumentSourceSelection(documents, review.fieldSources)

  return (
    <DocumentReviewLayout
      showDocument={showDocument}
      document={
        <DocumentPane
          documents={documents}
          loadDocument={review.loadDocument}
          documentQueryKey={(id) => ['document', id]}
          fieldSources={review.fieldSources}
          {...selection}
        />
      }
    >
      <ReviewForm key={review.document.id} fieldSources={review.fieldSources} checks={review.checks} checksSlot={checksSlot} />
    </DocumentReviewLayout>
  )
}

export function App() {
  const { review, status, upload } = useReviewUpload()
  const [showDocument, setShowDocument] = useState(true)
  const [checksSlot, setChecksSlot] = useState<HTMLDivElement | null>(null)

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <h1 className={styles.title}>Document review</h1>
          <p className="mutedText">Check what the AI read from the financial statement, fix what it got wrong, approve the rest.</p>
          <p className="mutedText" role="status">{statusText(status, review)}</p>
        </div>
        <div className={styles.actions}>
          <div ref={setChecksSlot} className={styles.checksSlot} />
          <UploadButton busy={status.busy} onFile={(file) => void upload(file)} />
          <button type="button" className="btnSecondary" onClick={() => setShowDocument((v) => !v)} aria-pressed={showDocument}>
            {showDocument ? 'Hide document' : 'Show document'}
          </button>
        </div>
      </header>
      <ReviewWorkspace review={review} showDocument={showDocument} checksSlot={checksSlot} />
    </div>
  )
}
