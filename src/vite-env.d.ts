/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in the GitHub Pages build, which has no extraction API. */
  readonly VITE_STATIC_DEMO?: string
}
