import { HiArrowDownTray } from 'react-icons/hi2'
import { downloadBlob } from '../../utils/downloadBlob'
import { formatFileSize } from '../../utils/formatFileSize'
import styles from '../DocumentViewer.module.scss'

export function LoadingDocument() {
  return <div className={styles.viewer}><div className={styles.status}>Loading document…</div></div>
}

/** A file that can't be previewed, or a PDF pdf.js could not open: its name and size, and a download. */
export function UnsupportedDocument({ blob, fileName }: { blob: Blob; fileName: string }) {
  return (
    <div className={styles.viewer}>
      <div className={styles.fallback}>
        <p className={styles.fallbackName}>{fileName}</p>
        <p className="mutedText">{formatFileSize(blob.size)}</p>
        <p className="mutedText">This file type can’t be previewed.</p>
        <button type="button" className="btnSecondary" onClick={() => downloadBlob(blob, fileName)}>
          <HiArrowDownTray /> Download
        </button>
      </div>
    </div>
  )
}
