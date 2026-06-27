import type { SetupBodyProps } from '../../common/lib/games'

/**
 * Phase-4 setup body. The manifest's `defaults` already seed a valid setup
 * (4×4 Revised, familiar band, basic scoring, no timer), so Start works as-is.
 * The full form — dice set, difficulty band (shared band component), scoring
 * ladder, min word length, board constraints, and the FreeBee timer field —
 * lands in Phase 5; see docs/games/boggle.md §7.
 */
export function SetupForm({ brand, mode }: SetupBodyProps) {
  return (
    <p>
      Start a {mode === 'compete' ? 'competitive' : 'cooperative'} {brand} game on
      the default 4×4 board. More setup options are coming soon.
    </p>
  )
}
