// cs-blessed-wordwheel

import { DictBandField } from '@/common/fields/DictBandField'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SelectField } from '@/common/fields/SelectField'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { difficultyValue } from '@/common/setup-form/difficulty'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import type { GSetupValues } from '../types'
import { ManualBoardField } from '@/common/fields/ManualBoardField'
import { groupTiles } from '@/common/fields/groupTiles'
import { CheckboxField } from '@/common/fields/CheckboxField'
import { NO_TARGET, splitCustomLetters, TARGET_RANK_CHOICES } from '@/shared/bee-games/beeSetup'

/**
 * wordwheel's per-game setup form. Mode is locked at the gametype level
 * (coop or compete — picked by which Start button the player clicked), so
 * this body never renders a mode radio.
 *
 * In order: the players, the target rank — coop's "Win at", compete's "Target
 * rank", each with a "None" that is stored as an ABSENT `target_rank` (compete
 * with none needs a countdown, which Start enforces) — the two dictionary
 * bands, the board constraints (unique letters
 * only), the optional custom letters in one box, and the shared
 * `<SetupTimerSection>`. Both pickers offer Good..Genius; Start is withheld
 * (`TARGET_RANK_CHOICES`).
 *
 * Controlled: state lives in the wrapping `SetupGameModal`, this body renders
 * `values` and signals via `set`. The `values as GSetupValues` cast at the
 * top is the boundary between the manifest's `unknown` setup type and
 * wordwheel's narrow shape.
 */
export function SetupForm({
  mode, members, myId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as GSetupValues
  const set = setValue as SetupSetter<GSetupValues>

  // Disclosure summaries carry the current value so it reads without opening.
  const dictLabel = `Dictionaries: ${difficultyValue(s.required_band)} / ${difficultyValue(s.legal_band)}`
  const customCenter = (s.custom_center ?? '').toUpperCase()
  const customOuter = (s.custom_letters ?? '').toUpperCase()
  // The summary is grouped by the SAME function the field uses, not by a
  // hand-written hyphen that happens to agree with it today.
  const customShown = groupTiles([...customCenter, ...customOuter], [1, 8])
  const customLabel =
    customCenter && customOuter
      ? `Custom letters: ${customShown}`
      : 'Custom letters (optional)'
  const constraintsLabel = s.unique_letters
    ? 'Board constraints: unique letters only'
    : 'Board constraints (optional)'

  // What the two target-rank summaries say. `target_rank` is an index into
  // RANKS, and its ABSENCE is "None" — the key is deleted rather than
  // set to a sentinel, so the summary reads the same absence.
  const targetRankLabel = s.target_rank === undefined ? 'None' : RANKS[s.target_rank]

  // The one field's text, rebuilt from the two keys it writes. Undashed: the
  // field owns the hyphen and puts it back after the center letter, so typing
  // it, omitting it or pasting it all mean the same thing.
  const customEntry = `${s.custom_center ?? ''}${s.custom_letters ?? ''}`

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

      <SetupSection label={`${mode === 'compete' ? 'Target rank' : 'Win at'}: ${targetRankLabel}`}>
        <SelectField
          name="target_rank"
          error={errors.target_rank}
          value={s.target_rank ?? NO_TARGET}
          // -1 is this picker's "None" value only; it never reaches the setup
          // blob — picking it DELETES the key, because "no target" is the
          // absence of a target, not a magic rank.
          onChange={(v) => {
            const choice = Number(v)
            set('target_rank', choice === NO_TARGET ? undefined : choice)
          }}
        >
          <option value={NO_TARGET}>None</option>
          {TARGET_RANK_CHOICES.map((idx) => (
            <option key={idx} value={idx}>
              {RANKS[idx]}
            </option>
          ))}
        </SelectField>
      </SetupSection>

      {/* "Dictionaries" — the required/legal word bands, behind a disclosure whose
          summary shows the current bands (e.g. "Dictionaries: 3 (Familiar) / 5
          (Obscure)"). */}
      {/* The help stays the SECTION's rather than splitting into two field
          sentences the way boggle's did: its last clause — "both are
          length-agnostic" — is about the pair, and would have to be said twice
          or dropped. */}
      <SetupSection
        label={dictLabel}
        help="Required words are the goal; legal words also score but aren't required. Both are length-agnostic (examples just show the band)."
      >
        <DictBandField
          name="required_band"
          error={errors.required_band}
          label="Required words"
          length={null}
          minBand={1}
          maxBand={6}
          value={s.required_band}
          onChange={(band) => set('required_band', band)}
        />
        <DictBandField
          name="legal_band"
          error={errors.legal_band}
          label="Legal (bonus) words"
          length={null}
          minBand={s.required_band}
          maxBand={6}
          value={s.legal_band}
          onChange={(band) => set('legal_band', band)}
        />
      </SetupSection>

      {/* Board constraints — optional rules that narrow which RANDOM board gets
          sampled. Just "unique letters only" today (all nine tiles distinct);
          the section exists so future constraints have a home. Ignored when
          custom letters are set (those letters stand as the player chose them).
          The summary shows the active constraint or "(optional)" when none. */}
      <SetupSection label={constraintsLabel}>
        <CheckboxField
          help="Pick only boards whose nine tiles are all different letters — no wheel with a doubled tile. Applies to random boards; a custom board keeps the letters you enter below."
          name="unique_letters"
          error={errors.unique_letters}
          value={s.unique_letters ?? false}
          onChange={(on) => set('unique_letters', on || undefined)}
        >
          Unique letters only
        </CheckboxField>
      </SetupSection>

      {/* Optional custom letters, behind a disclosure whose summary shows the
          chosen letters (e.g. "Custom letters: D-AEEGINNR") or "(optional)" when
          blank. Both blank → a random board (the normal path); fill both to build
          a board from your own letters. The Start button is gated on
          `customLettersError` (via the manifest's validate), so an invalid partial
          entry blocks Start with an inline reason. Cleared inputs store `undefined`
          so the edge function sees them as absent → random. */}
      <SetupSection label={customLabel}>
        <ManualBoardField
          help="Leave blank for a random board, or set your own: a center letter plus eight other letters. Repeats are fine — each tile is one use."
          name="custom_letters"
          error={errors.custom_letters}
          value={customEntry}
          onChange={(raw) => {
            const { center, letters } = splitCustomLetters(raw, 9)
            set('custom_center', center)
            set('custom_letters', letters)
          }}
          placeholder="D-AEEGINNR"
          chars={10}
          maxLength={10}
          // The center, then the ring — so the hyphen the summary has always
          // printed appears as you type it, and "which one is the center?" is
          // answered on screen rather than in the help text.
          groups={[1, 8]}
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
