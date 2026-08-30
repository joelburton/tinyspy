// cs-unmet

import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { runRpc } from '../../common/lib/supabase/dbResult'
import { showFaultModal } from '../../common/lib/fault/faultStore'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import {
  SetupNextPuzzleSection,
  type NextPuzzle,
} from '../../common/components/setup/SetupNextPuzzleSection'
import { FORM_ERROR_KEYNAME } from '../../common/components/fields/formState'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { db } from '../db'
import type { ConnectionsValues } from '../lib/setup'

/**
 * What the two puzzle-picker RPCs put in `data`. One shape for both, which is
 * what lets the shared `<SetupNextPuzzleSection>` take either — and each answer
 * names itself, so "there isn't one" is a case rather than an empty payload.
 *
 * `NonNullable<NextPuzzle>` because the section's own type is
 * `{…} | null`, and the null half of it is this type's `'none'`.
 */
type PuzzleAnswer =
  | { result: 'found'; puzzle: NonNullable<NextPuzzle> }
  | { result: 'none' }

/**
 * connections's per-game setup form. Two choices — and the puzzle is no
 * longer one of them:
 *
 *   - **Puzzle** — a read-only line naming what Start will play. The server
 *     picks it (`connections.next_puzzle_for_club`): the earliest puzzle none
 *     of the selected players has played, in any club. There is no picker
 *     because the date never meant anything here — the archive is a queue,
 *     and the only question the old calendar was asked was "one we haven't
 *     done." Crosswords keeps its calendar, where the date genuinely matters.
 *   - **Timer** — the shared `<SetupTimerSection>` (None / Up / Down with MM:SS).
 *
 * Plus the shared coop-pacing field.
 *
 * What this replaced, and why none of it is missed: a `<input type="date">`
 * and a month-grid `<Calendar>` colored from `connections.club_game_status`,
 * plus `resolveDefaultPuzzle` — a pure helper that seeded the dialog with the
 * club's saved default and stepped one day forward if they'd finished it.
 * The server's derivation subsumes all of it, and `setup.puzzle_id` is no
 * longer sent at all (create_game strips it from the club's saved default
 * too, so an older client's remembered pick can't override the derivation).
 *
 * `startGameInClub`'s find-or-create branch still exists and now simply never
 * fires from here: the dialog can't offer a puzzle that already has a game.
 * Resuming a half-finished game is the club page's job.
 */
export function SetupForm({
  brand, mode, members, selfId, numberOfPlayers, values, set: setValue, errors, setError,
}: SetupBodyProps) {
  const s = values as ConnectionsValues
  const set = setValue as SetupSetter<ConnectionsValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        error={errors.player_user_ids}
        value={s.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. */}
      <SetupCoopStyleSection
        errors={errors}
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          { set('coop_style', coopStyle); set('first_turn_user_id', firstTurnUserId) }
        }
      />

      <SetupNextPuzzleSection
        errors={errors}
        brand={brand}
        seenBy={players.map((p) => p.user_id)}
        // Both RPCs answer two ways — a puzzle, or none — and each says which,
        // so neither is read as "whatever `data` happens to be". The section has
        // its own words for the empty case (the archive is spent / no puzzle
        // that day), which is why the server's `warning` outcome is not read
        // here: the caller already knows which question it asked.
        //
        // A failure still returns null — the section has no third state — but
        // it no longer passes for an empty archive: the message goes under
        // `puzzle_id`, where the section already draws a field error, and stays
        // there after the modal is dismissed.
        load={async (seenBy) => {
          const res = await runRpc<PuzzleAnswer>(
            db.rpc('next_puzzle_for_club', { seen_by: seenBy }),
          )
          if (res.type === 'not-ok') {
            // EVERY severity, where the server said it belongs: PN302 (the
            // archive is spent) names `puzzle_id` and lands red under the
            // puzzle field, a fault says `_` and lands on the form's line. The
            // modal is dismissable, so it cannot be the only place a fault is
            // said; and the spent archive never had a modal at all, only a gray
            // line it did not deserve (Joel, 2026-08-29).
            setError(res.field ?? FORM_ERROR_KEYNAME, res.message)
            return null
          } else if (res.type === 'ok' && res.data.result === 'found') {
            // BOTH keys, because a previous failure could have used either —
            // this load answering at last is what clears whichever it was.
            setError('puzzle_id', null)
            setError(FORM_ERROR_KEYNAME, null)
            return res.data.puzzle
          } else {
            showFaultModal({ text: 'BUG: next_puzzle_for_club fell through to unhandled' })
            return null
          }
        }}
        loadByDate={async (date) => {
          const res = await runRpc<PuzzleAnswer>(db.rpc('puzzle_for_date', { target_date: date }))
          if (res.type === 'not-ok') {
            // PN303 names `puzzle_id`, the box the date was typed into — the
            // most direct case of a message landing where the question was
            // asked. A fault says `_` and takes the form's line.
            setError(res.field ?? FORM_ERROR_KEYNAME, res.message)
            return null
          } else if (res.type === 'ok' && res.data.result === 'found') {
            setError('puzzle_id', null)
            setError(FORM_ERROR_KEYNAME, null)
            return res.data.puzzle
          } else {
            showFaultModal({ text: 'BUG: puzzle_for_date fell through to unhandled' })
            return null
          }
        }}
        // A chosen date rides in setup.puzzle_id; cleared, the key is dropped
        // entirely — its ABSENCE is what tells create_game to choose.
        onPick={(puzzleId) => set('puzzle_id', puzzleId)}
      />

      <SetupTimerSection errors={errors} value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}
