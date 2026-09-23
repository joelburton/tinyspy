// cs-met-spellingbee

import { DictBandField } from '@/common/fields/DictBandField'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SelectField } from '@/common/fields/SelectField'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { difficultyValue } from '@/common/setup-form/difficulty'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import type { SpellingbeeValues } from '../lib/setup'
import { ManualBoardField } from '@/common/fields/ManualBoardField'
import { groupTiles } from '@/common/fields/groupTiles'

/** Normalize a letter input: lowercase, drop anything but a–z, cap the length.
 *  Keeps state canonical (lowercase, letters-only) so validation + the edge
 *  function agree; the UI uppercases via CSS for the honeycomb look. */
const cleanLetters = (raw: string, max: number) =>
  raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, max)

/**
 * Split the one typed field into the two setup keys.
 *
 * THE HYPHEN IS OPTIONAL. `A-CHIROT` and `ACHIROT` mean the same thing — the
 * first letter is the center and the rest are the outer ring — because the
 * hyphen is punctuation in a display form, not data. `cleanLetters` drops it
 * either way; this just decides where the cut falls, which is always after the
 * first letter. The two keys stay separate in the setup blob, since
 * `create_game` and `customLettersError` each validate them by name.
 */
function splitCustomLetters(raw: string): { center?: string; letters?: string } {
  const letters = cleanLetters(raw, 1 + 6)
  return {
    center: letters.slice(0, 1) || undefined,
    letters: letters.slice(1) || undefined,
  }
}


/**
 * Allowed target-rank choices, shared by both modes' pickers. The full
 * 7-rank ladder is `RANKS[0..6]` (Start, Good, Solid, Nice, Great, Amazing,
 * Genius); only Start (0) is withheld, because every player begins at it — a
 * target of Start is won by the first accepted word in compete and instantly
 * in coop (`_rank_idx >= 0` is true from the off). So the list runs
 * Good..Genius (1..6). Compete's default lands on Amazing (5).
 */
const TARGET_RANK_CHOICES = [1, 2, 3, 4, 5, 6] as const

/** The coop picker's "None" option. A UI-only sentinel — choosing it removes
 *  `target_rank` from the setup blob entirely (the server reads absent/null as
 *  "no win condition"), so this number never leaves this file. */
const NO_TARGET = -1

/**
 * spellingbee's per-game setup form. Mode is locked at the gametype level
 * (coop or compete — picked by which Start button the player clicked), so
 * this body never renders a mode radio.
 *
 * In order: the players, the target rank — coop's "Win at" with a "None" that
 * is stored as an ABSENT `target_rank`, compete's "Target rank" with no
 * "None" — the two dictionary bands, the optional custom letters in one box,
 * and the shared `<SetupTimerSection>`. Both pickers offer Good..Genius;
 * Start is withheld (`TARGET_RANK_CHOICES`).
 *
 * Controlled: state lives in the wrapping `SetupGameModal`, this body renders
 * `values` and signals via `set`. The `values as SpellingbeeValues` cast at the
 * top is the boundary between the manifest's `unknown` setup type and
 * spellingbee's narrow shape.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as SpellingbeeValues
  const set = setValue as SetupSetter<SpellingbeeValues>

  // Disclosure summaries carry the current value so it reads without opening.
  const dictLabel = `Dictionaries: ${difficultyValue(s.required)} / ${difficultyValue(s.legal)}`
  const customCenter = (s.custom_center ?? '').toUpperCase()
  const customOuter = (s.custom_letters ?? '').toUpperCase()
  // The summary is grouped by the SAME function the field uses, not by a
  // hand-written hyphen that happens to agree with it today.
  const customShown = groupTiles([...customCenter, ...customOuter], [1, 6])
  const customLabel =
    customCenter && customOuter
      ? `Custom letters: ${customShown}`
      : 'Custom letters (optional)'

  // What the two target-rank summaries say. `target_rank` is an index into
  // RANKS, and its ABSENCE is the coop "None" — the key is deleted rather than
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
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        error={errors.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />

      {mode === 'compete' ? (
        <SetupSection label={`Target rank: ${targetRankLabel}`}>
          <SelectField
            name="target_rank"
            error={errors.target_rank}
            value={s.target_rank ?? NO_TARGET}
            onChange={(v) => set('target_rank', Number(v))}
          >
            {TARGET_RANK_CHOICES.map((idx) => (
              <option key={idx} value={idx}>
                {RANKS[idx]}
              </option>
            ))}
          </SelectField>
        </SetupSection>
      ) : (
        <SetupSection label={`Win at: ${targetRankLabel}`}>
          <SelectField
            name="target_rank"
            error={errors.target_rank}
            value={s.target_rank ?? NO_TARGET}
            // -1 is this picker's "None" value only; it never reaches the setup
            // blob — picking it DELETES the key, because "no win condition" is
            // the absence of a target, not a magic rank.
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
      )}

      {/* "Dictionaries" — the required/legal word bands, behind a disclosure whose
          summary shows the current bands (e.g. "Dictionaries: 3 (Familiar) / 5
          (Obscure)"). */}
      <SetupSection label={dictLabel}>
        <DictBandField
          name="required"
          error={errors.required}
          label="Required words"
          length={null}
          minBand={1}
          maxBand={6}
          help="Dictionary used to make list of required words on board."
          value={s.required}
          onChange={(required) => set('required', required)}
        />
        <DictBandField
          name="legal"
          error={errors.legal}
          label="Legal (bonus) words"
          length={null}
          minBand={s.required}
          maxBand={6}
          help="Dictionary used to make list of legal words on board."
          value={s.legal}
          onChange={(legal) => set('legal', legal)}
        />
      </SetupSection>

      {/* Optional custom letters, behind a disclosure whose summary shows the
          chosen letters (e.g. "Custom letters: A-CHIROT") or "(optional)" when
          blank. Both blank → a random board (the normal path); fill both to build
          a board from your own letters. The Start button is gated on
          `customLettersError` (via the manifest's validate), so an invalid partial
          entry blocks Start with an inline reason. Cleared inputs store `undefined`
          so the edge function sees them as absent → random. */}
      <SetupSection label={customLabel}>
        <ManualBoardField
          help="Leave blank for a random board, or set your own: a center letter plus six other letters. No S, and all seven must be different."
          name="custom_letters"
          error={errors.custom_letters}
          value={customEntry}
          onChange={(raw) => {
            const { center, letters } = splitCustomLetters(raw)
            { set('custom_center', center); set('custom_letters', letters) }
          }}
          placeholder="A-CHIROT"
          chars={8}
          maxLength={8}
          // The center, then the ring — so the hyphen the summary has always
          // printed appears as you type it, and "which one is the center?" is
          // answered on screen rather than in the help text.
          groups={[1, 6]}
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
