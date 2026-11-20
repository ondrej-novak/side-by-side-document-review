const PERCENT_PER_WHOLE = 100

/** A 0–1 fraction as a percentage, unrounded. */
export function toPercent(fraction: number): number {
  return fraction * PERCENT_PER_WHOLE
}
