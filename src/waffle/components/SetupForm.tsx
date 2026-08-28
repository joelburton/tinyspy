// cs-unmet

import { DictBandField } from '../../common/components/fields/DictBandField'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { EXTRA_SWAP_OPTIONS, type WaffleValues } from '../lib/setup'

/**
 * waffle's setup form, rendered inside the common SetupGameModal.
 * Two choices plus the timer:
 *
 *   - **Word difficulty** — which vocabulary band (1..6) the six 5-letter
 *     words are drawn from (sets `difficulty`), via the shared DictBandField.
 *   - **Swap budget** — how many *extra* swaps beyond the puzzle's
 *     par you get. Fewer = harder. `max_swaps = par + extra_swaps`.
 *
 * Plus the shared `SetupTimerSection`.
 *
 * Controlled component (state lives in the wrapper); the single
 * `value as WaffleSetup` cast is the boundary between the manifest's
 * `unknown` setup and waffle's shape. Shared by both manifests (mode
 * doesn't change the form).
 *
 * `difficulty` is the one field here a refusal can actually land on: whether a
 * board EXISTS at a given band is the single thing this form cannot rule out
 * from its own values, and waffle-build-board says so under that name.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as WaffleValues
  const set = setValue as SetupSetter<WaffleValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // Disclosure summaries carry the current values so each section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Singular "Dictionary" —
  // waffle has ONE band. The swap summary shows the gloss + the number, e.g.
  // "Swap budget: Tight +3".
  const dictLabel = `Dictionary: ${difficultyValue(s.difficulty)}`
  const swapGloss =
    EXTRA_SWAP_OPTIONS.find((opt) => opt.value === s.extra_swaps)?.label ?? 'Custom'
  const swapLabel = `Swap budget: ${swapGloss} +${s.extra_swaps}`

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
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
        onChange={({ coopStyle, firstTurnUserId }) =>
          { set('coop_style', coopStyle); set('first_turn_user_id', firstTurnUserId) }
        }
      />
      <SetupSection label={dictLabel}>
        <DictBandField
          name="difficulty"
          help="Which vocabulary the puzzle's words come from."
          length={5}
          minBand={1}
          maxBand={6}
          value={s.difficulty}
          error={errors.difficulty}
          onChange={(difficulty) => set('difficulty', difficulty)}
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
