/**
 * The live DOM endpoints of the connector drawn between a highlighted document region and the form field it
 * filled. Deliberately outside React state: both ends move on document scroll, zoom, page change, form scroll
 * and splitter drag — none of which are renders — so the connector re-reads them per frame instead of trying
 * to subscribe to every way they can shift.
 */
export interface SourceAnchors {
  /** The emphasized region on the document, or null when none is drawn on the visible page. */
  setRegion: (el: HTMLElement | null) => void
  /** Registers (or, with null, releases) the form field currently showing as filled from that region. */
  setField: (fieldName: string, el: HTMLElement | null) => void
  region: () => HTMLElement | null
  /** The first registered field among `fieldNames` — several fields can share one region. */
  field: (fieldNames: ReadonlySet<string>) => HTMLElement | null
}

/**
 * The element while it is still in the document, else null. An anchor can outlive its element — a field that is
 * hidden or replaced unmounts without a mouseleave. A detached node still answers getBoundingClientRect(), with
 * zeros, which would pin the connector to the layout's top-left corner.
 */
function live(el: HTMLElement | null | undefined): HTMLElement | null {
  return el?.isConnected ? el : null
}

export function createSourceAnchors(): SourceAnchors {
  let regionEl: HTMLElement | null = null
  const fieldEls = new Map<string, HTMLElement>()

  return {
    setRegion: (el) => { regionEl = el },
    setField: (fieldName, el) => {
      if (el) fieldEls.set(fieldName, el)
      else fieldEls.delete(fieldName)
    },
    region: () => live(regionEl),
    field: (fieldNames) => {
      for (const name of fieldNames) {
        const el = live(fieldEls.get(name))
        if (el) return el
      }
      return null
    },
  }
}
