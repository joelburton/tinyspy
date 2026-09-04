// cs-unmet

import { useEffect } from 'react'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/setup/setupForm'
import {
  TURN_OPTIONS,
  type CodenamesduetValues,
} from '../lib/setup'
import { SetupSection } from '../../common/components/setup/SetupSection'

/**
 * codenamesduet's per-game setup form, rendered inside the common
 * `SetupGameModal`. Two choices for the players:
 *
 *   - **Turns** — starting turn count, one of {9, 10, 11}
 *     (matches the Duet rulebook's mission counts). 9 is the
 *     standard game; 10 and 11 are easier warm-ups.
 *   - **Who gives the first clue** — radio with the two club
 *     members. `create_game` seats the chosen user as A
 *     (since A always opens the game), the other as B.
 *
 * On mount we auto-seed `first_clue_giver_user_id` to the first
 * club member. The manifest's defaults can't carry a member id
 * (defaults are evaluated before any club is known), so the
 * resolution happens here. The user can still flip the radio
 * before clicking Start.
 *
 * Controlled component pattern: state lives in the wrapper,
 * we render from `value` and signal via `onChange`. The single
 * `value as CodenamesduetSetup` cast at the top is the boundary
 * between the manifest's `unknown` setup type and codenamesduet's
 * narrow shape — see the SetupBodyProps doc in
 * src/common/lib/setup/setupForm.ts.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `CodenamesduetSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`codenamesduet/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
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
