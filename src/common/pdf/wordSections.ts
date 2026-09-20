// cs-blessed-pdf

import type { WordRow } from './wordColumns'

/**
 * One block of the printed word list: a heading, that block's own tally, and
 * its words. Coop prints one unattributed section; compete prints one per
 * player (doc.md → Details says why).
 */
export type WordSection = {
  // Section heading — a player's name, or null for the plain "Words" list.
  who: string | null
  // That section's tally ("12 words · 34 pts"), or null for the coop list,
  // whose totals are already in the page header.
  tally: string | null
  words: WordRow[]
}

/**
 * Split a flat word list into the sections a printout shows.
 *
 * Coop: one section, the rows untouched. Compete: one section per player in
 * roster order — a player who found nothing still gets one — with the per-row
 * finder dropped (the heading says whose it is) and the tally summed from the
 * rows, so the score and the words cannot disagree. Words nobody found (the
 * terminal reveal, arriving as `found: null` rows) go last under "Not found",
 * credited to no one.
 */
export function buildWordSections(
  words: WordRow[],
  mode: 'coop' | 'compete',
  // The roster, in the order sections should appear.
  players: { user_id: string; username: string }[],
  // Marks the viewer's own section: "joel (you)".
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
