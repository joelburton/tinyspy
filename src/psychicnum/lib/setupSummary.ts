import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import {
  coopRows,
  rosterRow,
  timerRow,
  type SetupRow,
} from '../../common/lib/game/setupRows'
import type { PsychicnumSetup } from './setup'

/**
 * psychicnum's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows).
 *
 * This game is why the shared rows exist. The two lists had drifted past
 * "inconsistent" into reporting **different facts**: the info column said Tiles
 * / Secret words / Dictionary while the printout said Difficulty / Guesses —
 * nearly disjoint, so the paper described a different aspect of the game than
 * the panel did, and neither was complete.
 *
 * Order mirrors `components/SetupForm.tsx`: roster (the dialog's own player
 * picker, above the per-game body), co-op pacing, guesses, words on board,
 * dictionary, timer.
 *
 * **"Secret words: 3" is deliberately gone.** It was on the old info-column
 * list, but three is a game CONSTANT, not a control the dialog offers — and the
 * rule is that the recap is the setup dialog read back, nothing more. A rule
 * that a constant may sneak in is a rule that drifts again. It belongs in Help,
 * which is where a player looks for how the game works rather than for what
 * this particular game was set to.
 */
export function setupRows(
  setup: PsychicnumSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'guesses', label: 'Guesses', value: String(setup.guesses) },
    { key: 'word_count', label: 'Words on board', value: String(setup.word_count) },
    { key: 'difficulty', label: 'Dictionary', value: difficultyValue(setup.difficulty) },
    timerRow(setup.timer),
  ]
}
