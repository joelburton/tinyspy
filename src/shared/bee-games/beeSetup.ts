// cs-unmet

/**
 * Allowed target-rank choices, shared by both modes' pickers. The full
 * 7-rank ladder is `RANKS[0..6]` (Start, Good, Solid, Nice, Great, Amazing,
 * Genius); only Start (0) is withheld, because every player begins at it — a
 * target of Start is won by the first accepted word in compete and instantly
 * in coop (`_rank_idx >= 0` is true from the off). So the list runs
 * Good..Genius (1..6). Compete's default lands on Amazing (5).
 */
export const TARGET_RANK_CHOICES = [1, 2, 3, 4, 5, 6] as const

/** The target picker's "None" option. A UI-only sentinel — choosing it removes
 *  `target_rank` from the setup blob entirely (the server reads absent/null as
 *  "no target": the goal is every required word), so this number never
 *  reaches the setup blob. */
export const NO_TARGET = -1

/** Normalize a letter input: lowercase, drop anything but a–z, cap the length.
 *  Keeps state canonical (lowercase, letters-only) so validation + the edge
 *  function agree; the UI uppercases via CSS for the board's look. */
const cleanLetters = (raw: string, max: number) =>
  raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, max)

/**
 * Split the one typed custom-letters field into the two setup keys, keeping at
 * most `count` letters — the center plus the outer ring.
 *
 * THE HYPHEN IS OPTIONAL. `A-CHIROT` and `ACHIROT` mean the same thing — the
 * first letter is the center and the rest are the outer ring — because the
 * hyphen is punctuation in a display form, not data. `cleanLetters` drops it
 * either way; this just decides where the cut falls, which is always after the
 * first letter. The two keys stay separate in the setup blob, since
 * `create_game` and each game's `customLettersError` validate them by name.
 */
export function splitCustomLetters(raw: string, count: number): { center?: string; letters?: string } {
  const letters = cleanLetters(raw, count)
  return {
    center: letters.slice(0, 1) || undefined,
    letters: letters.slice(1) || undefined,
  }
}
