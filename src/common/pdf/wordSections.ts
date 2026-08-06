import type { WordRow } from './wordColumns'

/**
 * One block of the found-words list: a heading, that block's own tally, and its
 * words.
 *
 * Coop is a single unattributed section — one shared hunt, one list, and each
 * row keeps its finder so you can see who got what. **Compete is a section per
 * player**, because in compete the words and the score are per-player facts:
 * printing them merged under one global "12 words · 34 pts" reported the
 * viewer's own numbers as if they were the table's, and the words themselves
 * ran together into one list where the only clue to authorship was a name
 * squeezed at the end of each row.
 */
export type WordSection = {
  /** Section heading — a player's name, or null for the plain "Words" list. */
  who: string | null
  /** That section's tally ("12 words · 34 pts"), or null for the coop list,
   *  whose totals are already in the page header. */
  tally: string | null
  words: WordRow[]
}

/**
 * Split a flat word list into the sections a printout should show.
 *
 * Coop → one section, exactly the old behaviour.
 *
 * Compete → one per player IN ROSTER ORDER, so two printouts of the same game
 * agree and a player who found nothing still gets a section saying so (their
 * absence is a result, not a reason to omit them). The per-row finder is
 * dropped inside a player's section — the heading already says whose it is, and
 * repeating the name on every row is the noise this replaces.
 *
 * Words nobody found — the terminal reveal, which arrives as `found: null` rows
 * — go last, under their own heading. They belong to no player, and filing them
 * under one would credit a miss to somebody.
 *
 * Scores come from summing the rows rather than from a separate tally, so the
 * printed score and the printed words can't disagree.
 */
export function buildWordSections(
  words: WordRow[],
  mode: 'coop' | 'compete',
  /** The roster, in the order sections should appear. */
  players: { user_id: string; username: string }[],
  /** Marks the viewer's own section, e.g. "joel (you)". */
  selfId: string,
): WordSection[] {
  if (mode === 'coop') return [{ who: null, tally: null, words }]

  const found = words.filter((w) => w.found)
  const missed = words.filter((w) => !w.found)

  const sections: WordSection[] = players.map((p) => {
    const mine = found.filter((w) => w.found!.who === p.username)
    const points = mine.reduce((s, w) => s + w.found!.points, 0)
    return {
      who: p.user_id === selfId ? `${p.username} (you)` : p.username,
      tally: `${mine.length} word${mine.length === 1 ? '' : 's'} · ${points} pt${points === 1 ? '' : 's'}`,
      // `found: null` renders the bare word — which is what we want inside a
      // player's own section, minus the redundant name.
      words: mine.map((w) => ({ ...w, found: null })),
    }
  })

  if (missed.length) {
    sections.push({ who: 'Not found', tally: null, words: missed })
  }
  return sections
}
