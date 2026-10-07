// cs-unmet

import { DictBandField } from '@/common/fields/DictBandField'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { RadioRow } from '@/common/fields/RadioRow'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import {
  SetupCoopStyleSection,
} from '@/common/setup-form/SetupCoopStyleSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { dictBandValue } from '@/common/setup-form/dictBand'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { EXTRA_SWAP_OPTIONS } from '../lib/setup'
import type { GSetupValues } from '../types'

/**
 * waffle's setup form, rendered inside the common SetupGameModal.
 * Two choices plus the timer:
 *
 *   - **Dictionary band** — which band (1..6) the six 5-letter
 *     words are drawn from (sets `dict_band`), via the shared DictBandField.
 *   - **Swap budget** — how many *extra* swaps beyond the puzzle's
 *     par you get. Fewer = harder. `max_swaps = par + extra_swaps`.
 *
 * Plus the shared `SetupTimerSection`.
 *
 * Controlled component (state lives in the wrapper); the single
 * `values as GSetupValues` cast is the boundary between the manifest's
 * `unknown` setup and waffle's shape. Shared by both manifests (mode
 * doesn't change the form).
 *
 * `dict_band` is the one field here a refusal can actually land on: whether a
 * board EXISTS at a given band is the single thing this form cannot rule out
 * from its own values, and waffle-build-board says so under that name.
 */
export function SetupForm({
  mode, members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.id))

  // Disclosure summaries carry the current values so each section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Singular "Dictionary" —
  // waffle has ONE band. The swap summary shows the gloss + the number, e.g.
  // "Swap budget: Tight +3".
  const dictLabel = `Dictionary: ${dictBandValue(s.dict_band)}`
  const swapGloss =
    EXTRA_SWAP_OPTIONS.find((opt) =>
      opt.value === s.extra_swaps)?.label ?? 'Custom'
  const swapLabel = `Swap budget: ${swapGloss} +${s.extra_swaps}`

  return (
    <>
      <PlayersSection
        members={members}
        myId={myId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        error={errors.player_user_ids}
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
        onChange={({ coopStyle, firstTurnUserId }) => {
          set('coop_style', coopStyle)
          set('first_turn_user_id', firstTurnUserId)
        }
        }
      />
      <SetupSection label={dictLabel}>
        <DictBandField
          name="dict_band"
          help="Which vocabulary the puzzle's words come from."
          length={5}
          minBand={1}
          maxBand={6}
          value={s.dict_band}
          error={errors.dict_band}
          onChange={(dictBand) => set('dict_band', dictBand)}
        />
      </SetupSection>
      <SetupSection label={swapLabel}>
        <RadioRow
          help="Extra swaps beyond the puzzle's minimum — fewer is harder."
          name="extra_swaps"
          error={errors.extra_swaps}
          options={EXTRA_SWAP_OPTIONS.map((opt) => ({
            value: opt.value,
            label: (
              <>
                {opt.label} <span className="muted">(+{opt.value})</span>
              </>
            ),
          }))}
          value={s.extra_swaps}
          onChange={(extra_swaps) => set('extra_swaps', extra_swaps)}
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
