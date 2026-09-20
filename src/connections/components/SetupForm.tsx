// cs-met-connections

import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { runRpc } from '@/common/supabase/dbResult'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SetupCoopStyleSection } from '@/common/setup-form/SetupCoopStyleSection'
import {
  SetupNextPuzzleSection,
} from '@/common/setup-form/SetupNextPuzzleSection'
import { FORM_ERROR_KEYNAME } from '@/common/forms/formState'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { db } from '../db'
import type { ConnectionsValues, PuzzleAnswer } from '../lib/setup'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * connections' per-game setup form: the players, the shared coop-pacing
 * field, the puzzle, and the timer.
 *
 * The puzzle is a read-only line naming what Start will play — the server
 * picks it (`connections.next_puzzle_for_club`: the earliest puzzle none of
 * the selected players has played, in any club) — with a date field beside
 * it for the times that is not what you want (`puzzle_for_date`, which
 * filters nothing). There is no picker because the date carries no meaning
 * here: the archive is a queue. `setup.puzzle_id` is sent only when a date
 * was typed.
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
        // Both RPCs answer one way — a puzzle — and not finding one is a
        // not-ok (the archive is spent; no puzzle that day). The section has
        // no third state, so a not-ok returns null, and its message goes where
        // the server said it belongs: a spent archive names `puzzle_id` and
        // lands red under the puzzle field, a fault says `_` and lands on the
        // form's line. Either stays after the modal is dismissed, which is
        // why the modal is not the only place a fault is said.
        load={async (seenBy) => {
          const res = await runRpc<PuzzleAnswer>(
            db.rpc('next_puzzle_for_club', { seen_by: seenBy }),
          )
          if (res.type === 'not-ok') {
            setError(res.field ?? FORM_ERROR_KEYNAME, res.message)
            return null
          } else if (res.type === 'ok' && res.data.result === 'found') {
            // BOTH keys, because a previous failure could have used either —
            // this load answering at last is what clears whichever it was.
            setError('puzzle_id', null)
            setError(FORM_ERROR_KEYNAME, null)
            return res.data.puzzle
          } else {
            reportUnhandled('next_puzzle_for_club', res)
            return null
          }
        }}
        loadByDate={async (date) => {
          const res = await runRpc<PuzzleAnswer>(db.rpc('puzzle_for_date', { target_date: date }))
          if (res.type === 'not-ok') {
            // The server names `puzzle_id`, the box the date was typed into —
            // the most direct case of a message landing where the question
            // was asked. A fault says `_` and takes the form's line.
            setError(res.field ?? FORM_ERROR_KEYNAME, res.message)
            return null
          } else if (res.type === 'ok' && res.data.result === 'found') {
            setError('puzzle_id', null)
            setError(FORM_ERROR_KEYNAME, null)
            return res.data.puzzle
          } else {
            reportUnhandled('puzzle_for_date', res)
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
