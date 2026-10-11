// cs-unmet

import { CheckboxField } from '@/common/fields/CheckboxField'
import { DictBandField } from '@/common/fields/DictBandField'
import { NumberField } from '@/common/fields/NumberField'
import { RadioRow } from '@/common/fields/RadioRow'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { dictBandValue } from '@/common/setup-form/dictBand'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import {
  describeRound, N_ROUNDS_OPTIONS, ROUND_STYLE_OPTIONS, TIMER_SECONDS_MAX, TIMER_SECONDS_MIN,
} from '../lib/setup'
import type { GSetupValues } from '../types'

/**
 * wordsy's setup form, rendered inside the common SetupGameModal:
 *
 *   - **Dictionary** — the band a word may come from, any length.
 *   - **Length** — seven rounds, the best five counted, or a short game's
 *     three, the best two.
 *   - **Round** — a clock from the first submit, its seconds typed (1–120,
 *     the rulebook's 30 to start), or no timer: everyone takes as long as
 *     they need, a First Wordsmith stands in for the Fastest, and a round
 *     ends once everyone has submitted. "One word a round" gives the timer
 *     style that last rule; no-timer always has it, so there the box is
 *     checked and disabled, and the seconds box disabled too.
 *
 * There is no Timer section: the round's clock is the game's own, so the
 * setup's `timer` is fixed at none.
 */
export function SetupForm({
  members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>
  const lengthLabel = N_ROUNDS_OPTIONS.find((o) => o.value === s.n_rounds)!.label
  const isNoTimer = s.round_style === 'no-timer'

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
      <SetupSection label={`Dictionary: ${dictBandValue(s.legal_band)}`}>
        <DictBandField
          name="legal_band"
          error={errors.legal_band}
          label="Legal words"
          length={null}
          minBand={1}
          maxBand={6}
          value={s.legal_band}
          onChange={(legal_band) => set('legal_band', legal_band)}
        />
      </SetupSection>
      <SetupSection label={`Length: ${lengthLabel}`}>
        <RadioRow
          name="n_rounds"
          error={errors.n_rounds}
          label="How many rounds"
          options={N_ROUNDS_OPTIONS}
          value={s.n_rounds}
          onChange={(n_rounds) => set('n_rounds', n_rounds)}
        />
      </SetupSection>
      <SetupSection label={`Round: ${describeRound(s).toLowerCase()}`}>
        <RadioRow
          name="round_style"
          error={errors.round_style}
          label="How a round ends"
          options={ROUND_STYLE_OPTIONS}
          value={s.round_style}
          onChange={(round_style) => set('round_style', round_style)}
        />
        <NumberField
          help="The clock starts at the first word in."
          name="timer_seconds"
          error={errors.timer_seconds}
          label="Seconds"
          min={TIMER_SECONDS_MIN}
          max={TIMER_SECONDS_MAX}
          chars={3}
          disabled={isNoTimer}
          value={s.timer_seconds}
          onChange={(timer_seconds) => set('timer_seconds', timer_seconds)}
        />
        <CheckboxField
          help="Your first word is your word for the round, and the round ends as soon as everyone has one in."
          name="one_word"
          error={errors.one_word}
          value={isNoTimer || s.one_word}
          disabled={isNoTimer}
          onChange={(one_word) => set('one_word', one_word)}
        >
          One word a round
        </CheckboxField>
      </SetupSection>
    </>
  )
}
