import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { NextPuzzleField } from '../../common/components/fields/NextPuzzleField'
import type { SetupBodyProps } from '../../common/lib/games'
import { db } from '../db'
import type { ConnectionsSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

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
 *   - **Timer** — the shared `<TimerField>` (None / Up / Down with MM:SS).
 *
 * Plus the shared coop-pacing field.
 *
 * What this replaced, and why none of it is missed: a `<input type="date">`
 * and a month-grid `<Calendar>` coloured from `connections.club_game_status`,
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
export function SetupForm({ brand, mode, players, value, onChange }: SetupBodyProps) {
  const s = value as ConnectionsSetup

  return (
    <div className={styles.setup}>
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. */}
      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
        }
      />

      <NextPuzzleField
        brand={brand}
        seenBy={players.map((p) => p.user_id)}
        load={async (seenBy) => {
          const { data } = await db.rpc('next_puzzle_for_club', { seen_by: seenBy })
          // Both RPCs return 0 or 1 rows. Zero from this one means the archive
          // is spent for these players; zero from the by-date one means no
          // puzzle that day. NextPuzzleField renders each as its own state.
          return data?.[0] ?? null
        }}
        loadByDate={async (date) => {
          const { data } = await db.rpc('puzzle_for_date', { target_date: date })
          return data?.[0] ?? null
        }}
        // A chosen date rides in setup.puzzleId; cleared, the key is dropped
        // entirely — its ABSENCE is what tells create_game to choose.
        onPick={(puzzleId) => {
          const next = { ...s, puzzleId }
          if (puzzleId === undefined) delete next.puzzleId
          onChange(next)
        }}
      />

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
