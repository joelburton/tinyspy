// cs-unmet

import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { SetupNextPuzzleSection } from '../../common/components/setup/SetupNextPuzzleSection'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { db } from '../db'
import type { ConnectionsValues } from '../lib/setup'

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
 * The server's derivation subsumes all of it, and `setup.puzzleId` is no
 * longer sent at all (create_game strips it from the club's saved default
 * too, so an older client's remembered pick can't override the derivation).
 *
 * `startGameInClub`'s find-or-create branch still exists and now simply never
 * fires from here: the dialog can't offer a puzzle that already has a game.
 * Resuming a half-finished game is the club page's job.
 */
export function SetupForm({
  brand, mode, members, selfId, numberOfPlayers, values, set: setValue,
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
        value={s.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. */}
      <SetupCoopStyleSection
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          { set('coop_style', coopStyle); set('first_turn_user_id', firstTurnUserId) }
        }
      />

      <SetupNextPuzzleSection
        brand={brand}
        seenBy={players.map((p) => p.user_id)}
        load={async (seenBy) => {
          const { data } = await db.rpc('next_puzzle_for_club', { seen_by: seenBy })
          // Both RPCs return 0 or 1 rows. Zero from this one means the archive
          // is spent for these players; zero from the by-date one means no
          // puzzle that day. SetupNextPuzzleSection renders each as its own state.
          return data?.[0] ?? null
        }}
        loadByDate={async (date) => {
          const { data } = await db.rpc('puzzle_for_date', { target_date: date })
          return data?.[0] ?? null
        }}
        // A chosen date rides in setup.puzzleId; cleared, the key is dropped
        // entirely — its ABSENCE is what tells create_game to choose.
        onPick={(puzzleId) => set('puzzleId', puzzleId)}
      />

      <SetupTimerSection value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}
