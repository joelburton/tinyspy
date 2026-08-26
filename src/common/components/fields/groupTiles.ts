// cs-fixed

/**
 * Insert the dashes: take tiles, hand back `ABC-DEF-GHI-JKL`.
 *
 * ITS OWN MODULE, not a second export from `ManualBoardField.tsx`, because the field is not the only place a board is written down. A
 * setup section's summary shows the same value — `Custom board:
 * ABCD-EFGH-IJKL-MNOP` — and if it grouped by its own arithmetic the two could
 * disagree, which is the exact failure this area keeps finding. One function,
 * both surfaces.
 *
 * Anything past the last group runs on undashed rather than being dropped —
 * over-length input is the VALIDATOR's to complain about, in a sentence, and a
 * field that silently ate the extra letters would hide the mistake it should be
 * showing.
 */
export function groupTiles(tiles: string[], sizes: number[]): string {
  const out: string[] = []
  let i = 0
  for (const size of sizes) {
    if (i >= tiles.length) break
    out.push(tiles.slice(i, i + size).join(''))
    i += size
  }
  if (i < tiles.length) out.push(tiles.slice(i).join(''))
  return out.join('-')
}
