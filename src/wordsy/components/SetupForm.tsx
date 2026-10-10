// cs-unmet

import { DictBandField } from '@/common/fields/DictBandField'
import { RadioRow } from '@/common/fields/RadioRow'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { dictBandValue } from '@/common/setup-form/dictBand'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { ROUND_STYLE_OPTIONS } from '../lib/setup'
import type { GSetupValues } from '../types'

/**
 * wordsy's setup form, rendered inside the common SetupGameModal:
 *
 *   - **Dictionary** — the band a word may come from, any length.
 *   - **Round** — the rulebook's 30 seconds from the first submit, or no
 *     timer: everyone takes as long as they need, a First Wordsmith stands
 *     in for the Fastest, and a round ends once everyone has submitted.
 *
 * There is no Timer section: the round's clock is the game's own, so the
 * setup's `timer` is fixed at none.
 */
export function SetupForm({
  members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>
  const roundLabel = ROUND_STYLE_OPTIONS.find((o) => o.value === s.round_style)!.label

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
      <SetupSection label={`Round: ${roundLabel.toLowerCase()}`}>
        <RadioRow
          name="round_style"
          error={errors.round_style}
          label="How a round ends"
          options={ROUND_STYLE_OPTIONS}
          value={s.round_style}
          onChange={(round_style) => set('round_style', round_style)}
        />
      </SetupSection>
    </>
  )
}
