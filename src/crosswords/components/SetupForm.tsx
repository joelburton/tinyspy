// cs-unmet

import { PlayersSection } from '../../common/components/setup/PlayersSection'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import type { CrosswordsValues, PuzzleChoice } from '../lib/setup'
import { PuzzleSourceField } from './PuzzleSourceField'
import styles from './SetupForm.module.css'

/**
 * The crosswords setup form: who is playing, which puzzle, and the timer.
 *
 * **Which puzzle is ONE field** (`PuzzleSourceField`), not four tabs. The four
 * sources — library, NYT daily, Guardian, an uploaded file — are four blocking
 * modals opened from four buttons, and each writes the same `setup` keys its
 * tab wrote: `puzzle_id` · `date` + `weekday` · `series` · `board` + `filename`.
 * `create_game` sees no difference.
 *
 * Why it stopped being tabs (plans/areas/forms.md → F50
 * `puzzle-source-picks-in-a-dialog`): a refusal about a source could arrive
 * while a different source was on screen, which no care in the error system can
 * fix from the outside. It is also what gave this form a field NAME, so a
 * server validation lands under a control here like it does in every other
 * game rather than on the dialog's bottom line.
 */
/** The keys `PuzzleChoice` carries, so applying a new one writes every one of
 *  them — including the absences, which is the half that matters. */
const PUZZLE_KEYS: Array<keyof PuzzleChoice> = [
  'source', 'puzzle_id', 'date', 'weekday', 'series', 'board', 'filename',
]

export function SetupForm({
  clubHandle, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as CrosswordsValues
  const set = setValue as SetupSetter<CrosswordsValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  return (
    <div className={styles.setup}>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        error={errors.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />

      <PuzzleSourceField
        name="source"
        help="Where the puzzle comes from. Each button opens its own picker."
        value={{
          source: s.source,
          puzzle_id: s.puzzle_id,
          date: s.date,
          weekday: s.weekday,
          series: s.series,
          board: s.board,
          filename: s.filename,
        }}
        // The WHOLE choice replaces the old one, so every key a source did not
        // set lands as `undefined` — which is how a stale board from a source
        // you left cannot ride along into the game you start.
        onChange={(next) => {
          for (const key of PUZZLE_KEYS) set(key, next[key] as never)
        }}
        // WHOSE history the NYT weekday walk skips over. It lives up here
        // because the field cannot know it — the player picker is a sibling,
        // and unchecking someone brings a puzzle back.
        seenBy={players.map((p) => p.user_id)}
        clubHandle={clubHandle}
        error={errors.source}
      />

      {/* Timer — the shared field every other game uses (None / Up / Down with
          MM:SS). A countdown expiring routes to crosswords.submit_timeout,
          which ends the table: coop → `lost`, compete → `lost_compete`, both
          stamped `outcome: 'timeout'` so buildOver can say "Out of time"
          rather than the concede wording those states otherwise carry. */}
      <SetupTimerSection errors={errors} value={s.timer} onChange={(timer) => set('timer', timer)} />
    </div>
  )
}
