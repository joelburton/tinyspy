// cs-blessed-codenamesduet

import { useEffect } from 'react'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { RadioRow } from '@/common/fields/RadioRow'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import {
  TURN_OPTIONS,
  type CodenamesduetValues,
} from '../lib/setup'
import { SetupSection } from '@/common/setup-form/SetupSection'

/**
 * codenamesduet's setup form, rendered inside the common `SetupGameModal`:
 * the two players, then
 *
 *   - **Turns** — the starting turn budget, one of {9, 10, 11}. 9 is the
 *     standard game; 10 and 11 are the rulebook's easier missions.
 *   - **First clue** — which of the selected players gives it. `create_game`
 *     seats the chosen player as A, since A always opens the game, and the
 *     other as B.
 *
 * and the timer. The manifest's defaults can't carry a member id (they are
 * evaluated before any club is known), so the first selected player is seeded
 * here as the first clue-giver, and again whenever the chosen one is
 * unticked; the radio can still be flipped before Start.
 *
 * Controlled: the shared form owns the values, and the two casts at the top
 * narrow them to codenamesduet's shape (see `SetupBodyProps` in
 * `common/setup-form/setupForm.ts`).
 */
export function SetupForm({
  members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as CodenamesduetValues
  const set = setValue as SetupSetter<CodenamesduetValues>

  // The selected players, not the whole club: the first clue-giver must be one
  // of them, or `create_game` refuses the setup.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // Re-seed to the first selected player whenever the current pick isn't one:
  // the initial empty string, or a chosen player since unticked. Converges, as
  // `SetupCoopStyleSection`'s first-player seeding does.
  useEffect(function seedFirstClueGiver() {
    const stillSelected = players.some((p) => p.user_id === s.first_clue_giver_user_id)
    if (!stillSelected && players.length > 0) {
      set('first_clue_giver_user_id', players[0].user_id)
    }
  }, [players, s.first_clue_giver_user_id, set])

  // The summary says WHO, not which uuid. The `?? '—'` covers the render
  // before the seeding effect above has picked one; no user sees it.
  const firstClueGiverName =
    players.find((p) => p.user_id === s.first_clue_giver_user_id)?.username ?? '—'

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
      <SetupSection label={`Turns: ${s.turns}`}>
        <RadioRow
          help="The standard game is 9. Pick 10 or 11 for an easier warm-up (matches the rulebook's mission difficulties)."
          name="turns"
          error={errors.turns}
          options={TURN_OPTIONS.map((t) => ({ value: t, label: t }))}
          value={s.turns}
          onChange={(turns) => set('turns', turns)}
        />
      </SetupSection>

      <SetupSection label={`First clue: ${firstClueGiverName}`}>
        <RadioRow
          help="The first clue-giver is seated as A; the other player opens as the guesser."
          name="first_clue_giver_user_id"
          error={errors.first_clue_giver_user_id}
          options={players.map((p) => ({ value: p.user_id, label: p.username }))}
          value={s.first_clue_giver_user_id}
          onChange={(id) => set('first_clue_giver_user_id', id)}
        />
      </SetupSection>

      <SetupTimerSection
        errors={errors}
        value={s.timer}
        onChange={(timer) => set('timer', timer)}
      />
    </>
  )
}
