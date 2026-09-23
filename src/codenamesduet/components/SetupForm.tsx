// cs-met-codenamesduet

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
 *   - **First clue** — which member gives it. `create_game` seats the chosen
 *     player as A, since A always opens the game, and the other as B.
 *
 * and the timer. The manifest's defaults can't carry a member id (they are
 * evaluated before any club is known), so the first member is seeded here as
 * the first clue-giver; the radio can still be flipped before Start.
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

  // Auto-pick the first member as first-clue-giver when the form
  // first sees a populated member list with an empty selection.
  // Once first_clue_giver_user_id is set, the inner condition is
  // false and this is a no-op — including on s-change reruns.
  useEffect(function seedFirstClueGiver() {
    if (s.first_clue_giver_user_id === '' && members.length > 0) {
      set('first_clue_giver_user_id', members[0].user_id)
    }
  }, [s, members, set])

  // The summary says WHO, not which uuid. The `?? '—'` covers the first render
  // before the seeding effect above has picked a default; no user sees it.
  const firstClueGiverName =
    members.find((m) => m.user_id === s.first_clue_giver_user_id)?.username ?? '—'

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
          options={members.map((m) => ({ value: m.user_id, label: m.username }))}
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
