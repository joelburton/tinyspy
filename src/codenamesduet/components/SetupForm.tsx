// cs-blessed-codenamesduet

import { useEffect } from 'react'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { CheckboxField } from '@/common/fields/CheckboxField'
import { CheckboxListField } from '@/common/fields/CheckboxListField'
import { RadioRow } from '@/common/fields/RadioRow'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { listWordPoolLabels, sayYesNo, TURN_OPTIONS, WORD_POOLS } from '../lib/setup'
import type { GSetupValues } from '../types'
import { SetupSection } from '@/common/setup-form/SetupSection'

/**
 * codenamesduet's setup form, rendered inside the common `SetupGameModal`:
 * the two players, then
 *
 *   - **Turns** — the starting turn budget, one of {9, 10, 11}. 9 is the
 *     standard game; 10 and 11 are the rulebook's easier missions.
 *   - **First clue** — which of the chosen players gives it. `create_game`
 *     seats the chosen player as A, since A always opens the game, and the
 *     other as B.
 *   - **Word pool** — which lists the 25 words come from, at least one;
 *     `create_game` deals them in equal shares.
 *   - **Guess required**, **Strict words**, **Can decline clue-giving** — the
 *     three on/off options, a section each (`GSetupValues` says what each
 *     does).
 *
 * and the timer. The manifest's defaults can't carry a member id (they are
 * evaluated before any club is known), so the first chosen player is seeded
 * here as the first clue-giver, and again whenever the chosen one is
 * unticked; the radio can still be flipped before Start.
 *
 * Controlled: the shared form owns the values, and the two casts at the top
 * narrow them to codenamesduet's shape (see `SetupBodyProps` in
 * `common/setup-form/setupForm.ts`).
 */
export function SetupForm({
  members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>

  // The chosen players, not the whole club: the first clue-giver must be one
  // of them, or `create_game` refuses the setup.
  const players = members.filter((m) => s.player_user_ids.has(m.id))

  // Re-seed to the first chosen player whenever the current pick isn't one:
  // the initial empty string, or a chosen player since unticked. Converges, as
  // `SetupCoopStyleSection`'s first-player seeding does.
  useEffect(function seedFirstClueGiver() {
    const stillChosen = players.some((p) => p.id === s.first_clue_giver_user_id)
    if (!stillChosen && players.length > 0) {
      set('first_clue_giver_user_id', players[0].id)
    }
  }, [players, s.first_clue_giver_user_id, set])

  // The summary says WHO, not which uuid. The `?? '—'` covers the render
  // before the seeding effect above has picked one; no user sees it.
  const firstClueGiverName =
    players.find((p) => p.id === s.first_clue_giver_user_id)?.username ?? '—'

  return (
    <>
      <PlayersSection
        members={members}
        myId={myId}
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
          options={players.map((p) => ({ value: p.id, label: p.username }))}
          value={s.first_clue_giver_user_id}
          onChange={(id) => set('first_clue_giver_user_id', id)}
        />
      </SetupSection>

      <SetupSection label={`Word pool: ${listWordPoolLabels(s.word_pools) || 'none'}`}>
        <CheckboxListField
          help="Each board deals the same number of words from every list you tick."
          name="word_pools"
          error={errors.word_pools}
          options={WORD_POOLS.map((p) => ({ value: p.name, label: p.label }))}
          value={new Set(s.word_pools)}
          // Kept in pool order, whichever box was ticked last.
          onChange={(ticked) =>
            set('word_pools', WORD_POOLS.filter((p) => ticked.has(p.name)).map((p) => p.name))
          }
        />
      </SetupSection>

      <SetupSection label={`Guess required: ${sayYesNo(s.guess_required)}`}>
        <CheckboxField
          help="The guesser must guess at least one word before passing."
          name="guess_required"
          error={errors.guess_required}
          value={s.guess_required}
          onChange={(guess_required) => set('guess_required', guess_required)}
        >
          Guess required
        </CheckboxField>
      </SetupSection>

      <SetupSection label={`Strict words: ${sayYesNo(s.strict_words)}`}>
        <CheckboxField
          help="A clue may use only the letters A to Z: no spaces, hyphens or digits."
          name="strict_words"
          error={errors.strict_words}
          value={s.strict_words}
          onChange={(strict_words) => set('strict_words', strict_words)}
        >
          Strict words
        </CheckboxField>
      </SetupSection>

      <SetupSection label={`Can decline clue-giving: ${sayYesNo(s.can_decline_clue_giving)}`}>
        <CheckboxField
          help="Instead of giving a clue, a player may decline. No turn is spent, and their partner gives every clue for the rest of the game."
          name="can_decline_clue_giving"
          error={errors.can_decline_clue_giving}
          value={s.can_decline_clue_giving}
          onChange={(can_decline_clue_giving) =>
            set('can_decline_clue_giving', can_decline_clue_giving)}
        >
          Can decline clue-giving
        </CheckboxField>
      </SetupSection>

      <SetupTimerSection
        errors={errors}
        value={s.timer}
        onChange={(timer) => set('timer', timer)}
      />
    </>
  )
}
