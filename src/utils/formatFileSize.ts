const BYTES_PER_KB = 1_000
const BYTES_PER_MB = 1_000_000
const BYTES_PER_GB = 1_000_000_000

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes >= BYTES_PER_GB) return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
  if (bytes >= BYTES_PER_KB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`
  return `${bytes} B`
}
