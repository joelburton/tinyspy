/**
 * Minimal type shim for `puzjs` (which ships no types). Ported from
 * crossplay. Only the `decode` surface `puz.ts` actually reads is
 * declared — `encode` is present for completeness but unused here.
 *
 * puzjs is an unmaintained legacy `.puz` reader; it runs ONLY in this
 * Node import CLI, never in the frontend bundle.
 */
declare module 'puzjs' {
  type RawCell = string | { solution: string }
  type DecodedPuz = {
    grid: RawCell[][]
    meta: { title?: string; author?: string; copyright?: string; description?: string }
    /** Flat cell indices (`row * width + col`) for cells with the GEXT
     *  circle bit. Empirically what puzjs returns. */
    circles?: number[]
    /** Flat cell indices for cells with the GEXT shade bit — read into
     *  the `shaded` cell flag by `parsePuzBuffer`. */
    shades?: number[]
    clues: { across: (string | undefined)[]; down: (string | undefined)[] }
  }
  const Puz: {
    decode(bytes: Uint8Array | ArrayBuffer): DecodedPuz
    encode(puzzle: unknown): Uint8Array
  }
  export default Puz
}
