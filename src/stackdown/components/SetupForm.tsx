// cs-unmet

import { DictBandField } from '@/common/fields/DictBandField'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { difficultyValue } from '@/common/setup-form/difficulty'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import type { StackdownValues } from '../lib/setup'

/**
 * stackdown's setup form, rendered inside the common SetupGameModal.
 * A random board is dealt from the pre-generated library, filtered to the
 * chosen word-difficulty `band`. Two knobs: the `DictBandField` (bands
 * 1..2 — that's what the board library holds) and the shared `SetupTimerSection`.
 * Controlled component (state lives in the wrapper); shared by both
 * manifests (mode doesn't change the form).
 */
export function SetupForm({
  members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as StackdownValues
  const set = setValue as SetupSetter<StackdownValues>

  // Disclosure summary carries the current band so the section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Singular "Dictionary" —
  // stackdown has ONE band, not a required/legal pair.
  const dictLabel = `Dictionary: ${difficultyValue(s.band)}`

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
      <SetupSection label={dictLabel}>
        <DictBandField
          name="band"
          error={errors.band}
          help="Band 1 is the common everyday words; band 2 uses the next tier of less-common ones."
          label="Word difficulty"
          length={5}
          minBand={1}
          maxBand={2}
          value={s.band}
          onChange={(band) => set('band', band)}
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
