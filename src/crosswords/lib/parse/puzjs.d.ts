/**
 * Minimal type shim for `puzjs` (which ships no types). Ported from
 * crossplay. Only the `decode` surface `puz.ts` actually reads is
 * declared — `encode` is present for completeness but unused here.
 *
 * puzjs is a dependency-free legacy `.puz` reader operating on a
 * `Uint8Array`, so it runs in both the Node import CLI and the browser
 * (the in-app upload).
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
