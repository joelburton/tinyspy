// cs-unmet

import { DictBandField } from '@/common/fields/DictBandField'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SelectField } from '@/common/fields/SelectField'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { SetupCoopStyleSection } from '@/common/setup-form/SetupCoopStyleSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { dictBandValue } from '@/common/setup-form/dictBand'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { DIFFICULTY_OPTIONS, WORD_LENGTH } from '../lib/setup'
import type { GDifficulty, GSetupValues } from '../types'

/**
 * wordleone's setup form, rendered inside the common SetupGameModal.
 *
 *   - **Dictionary** — the legal band (1–6): the words you may guess, and the
 *     pool the answer is the only fit in.
 *   - **Difficulty** — the shape of the starter's colors, by its greens.
 *
 * Plus the shared coop-pacing and timer sections. Controlled component (state
 * lives in the wrapper); shared by both manifests, the coop-pacing section
 * gating itself by mode.
 */
export function SetupForm({
  mode, members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.id))

  // Disclosure summaries carry the current values so each section reads
  // without opening.
  const puzzleLabel = `Puzzle: ${dictBandValue(s.legal_band)} / ${s.difficulty}`

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
      <SetupSection label={puzzleLabel}>
        <DictBandField
          name="legal_band"
          error={errors.legal_band}
          label="Dictionary"
          length={WORD_LENGTH}
          minBand={1}
          maxBand={6}
          value={s.legal_band}
          onChange={(legal_band) => set('legal_band', legal_band)}
        />
        <SelectField
          help="How many greens the starter shows."
          name="difficulty"
          error={errors.difficulty}
          value={s.difficulty}
          onChange={(v) => set('difficulty', v as GDifficulty)}
        >
          {DIFFICULTY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      </SetupSection>
      <SetupTimerSection
        errors={errors}
        value={s.timer}
        onChange={(timer) => set('timer', timer)}
      />
    </>
  )
}
