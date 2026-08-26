// cs-unmet

import { DictBandField } from '../../common/components/fields/DictBandField'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import type { StackdownSetup } from '../lib/setup'

/**
 * stackdown's setup form, rendered inside the common SetupGameModal.
 * A random board is dealt from the pre-generated library, filtered to the
 * chosen word-difficulty `band`. Two knobs: the `DictBandField` (bands
 * 1..2 — that's what the board library holds) and the shared `SetupTimerSection`.
 * Controlled component (state lives in the wrapper); shared by both
 * manifests (mode doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as StackdownSetup

  // Disclosure summary carries the current band so the section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Singular "Dictionary" —
  // stackdown has ONE band, not a required/legal pair.
  const dictLabel = `Dictionary: ${difficultyValue(s.band)}`

  return (
    <>
      <SetupSection label={dictLabel}>
        <DictBandField
          help="Band 1 is the common everyday words; band 2 uses the next tier of less-common ones."
          label="Word difficulty"
          length={5}
          minBand={1}
          maxBand={2}
          value={s.band}
          onChange={(band) => onChange({ ...s, band })}
        />
      </SetupSection>
      <SetupTimerSection
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </>
  )
}
