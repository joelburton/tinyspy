// cs-unmet

import { CheckboxField } from '@/common/fields/CheckboxField'
import { DictBandField } from '@/common/fields/DictBandField'
import { NumberField } from '@/common/fields/NumberField'
import { RadioRow } from '@/common/fields/RadioRow'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SetupCoopStyleSection } from '@/common/setup-form/SetupCoopStyleSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { dictBandValue } from '@/common/setup-form/dictBand'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import {
  describeRound, N_ROUNDS_OPTIONS, ROUND_STYLE_OPTIONS, TIMER_SECONDS_MAX, TIMER_SECONDS_MIN,
} from '../lib/setup'
import type { GSetupValues } from '../types'

/**
 * wordsy's setup form, rendered inside the common SetupGameModal, by the
 * manifest's mode:
 *
 *   - **Dictionary** — the band a word may come from, any length. Both modes.
 *   - **Round** — the clock's seconds, typed (1–120, the rulebook's 30 to
 *     start). Compete also chooses how a round ends: that clock from the
 *     first submit, or no timer, where everyone takes as long as they need,
 *     a First Wordsmith stands in for the Fastest, and a round ends once
 *     everyone has submitted; and "One word a round", which gives the timer
 *     style that last rule (no-timer always has it, so there the box is
 *     checked and disabled, and the seconds box disabled too).
 *   - **Length** — compete only: seven rounds, the best five counted, or a
 *     short game's three, the best two. Coop plays the card's seven.
 *   - **Co-op** — coop with two or more: free-for-all or turns, and who
 *     writes first (the shared `SetupCoopStyleSection`, which self-gates).
 *
 * There is no Timer section: the round's clock is the game's own, so the
 * setup's `timer` is fixed at none.
 */
export function SetupForm({
  mode, members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>
  const lengthLabel = N_ROUNDS_OPTIONS.find((o) => o.value === s.n_rounds)!.label
  const isNoTimer = s.round_style === 'no-timer'
  // The checked subset of the roster, in `members` order: the Co-op section
  // names the actual players.
  const players = members.filter((m) => s.player_user_ids.has(m.id))

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
      <SetupCoopStyleSection
        errors={errors}
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) => {
          set('coop_style', coopStyle)
          set('first_turn_user_id', firstTurnUserId)
        }}
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
      {mode === 'compete' && (
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
      )}
      <SetupSection label={`Round: ${describeRound(s, mode).toLowerCase()}`}>
        {mode === 'compete' && (
          <RadioRow
            name="round_style"
            error={errors.round_style}
            label="How a round ends"
            options={ROUND_STYLE_OPTIONS}
            value={s.round_style}
            onChange={(round_style) => set('round_style', round_style)}
          />
        )}
        <NumberField
          help={mode === 'coop'
            ? 'The clock starts with each round; a word in before it runs out can earn a bonus.'
            : 'The clock starts at the first word in.'}
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
        {mode === 'compete' && (
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
        )}
      </SetupSection>
    </>
  )
}
