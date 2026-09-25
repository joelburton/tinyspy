// cs-blessed-wordle

import { DictBandField } from '@/common/fields/DictBandField'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { SelectField } from '@/common/fields/SelectField'
import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { SetupCoopStyleSection } from '@/common/setup-form/SetupCoopStyleSection'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { difficultyValue } from '@/common/setup-form/difficulty'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import { answerMaxBand, GUESS_OPTIONS, WORD_LENGTH, type WordleValues } from '../lib/setup'

/**
 * wordle's setup form, rendered inside the common SetupGameModal.
 *
 *   - **Guesses** — the budget (5–8; 6 is classic Wordle). In coop it's
 *     shared by the team; in compete it's each player's own.
 *   - **Answer source** — where the target comes from: "0: Wordle" (the
 *     curated NYT list) or a difficulty band 1–6.
 *   - **Legal guesses** — how obscure a guess may be (band 1–6). Bands below
 *     the answer's hardest are disabled (you must be able to guess any answer);
 *     the manifest's `validate` gates Start on the same rule.
 *
 * Plus the shared coop-pacing and timer sections. Controlled component (state
 * lives in the wrapper); shared by both manifests, the coop-pacing section
 * gating itself by mode.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as WordleValues
  const set = setValue as SetupSetter<WordleValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // Disclosure summaries carry the current values so each section reads without
  // opening. Answer source 0 is the curated Wordle list — not a difficulty band
  // — so it formats as "0 (Wordle)".
  const guessesLabel = `Guesses: ${s.max_guesses}`
  const answerValue =
    s.answer_band === 0 ? '0 (Wordle)' : difficultyValue(s.answer_band)
  const dictLabel = `Dictionaries: ${answerValue} / ${difficultyValue(s.legal_band)}`

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
      <SetupSection label={guessesLabel}>
        <SelectField
          help="How many guesses you get (6 is classic)."
          name="max_guesses"
          error={errors.max_guesses}
          value={s.max_guesses}
          onChange={(v) => set('max_guesses', Number(v))}
        >
          {GUESS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} guesses
            </option>
          ))}
        </SelectField>
      </SetupSection>
      <SetupSection label={dictLabel}>
        <DictBandField
          name="answer_band"
          error={errors.answer_band}
          label="Answer source"
          length={WORD_LENGTH}
          extraLowOption={{ value: 0, label: 'Wordle' }}
          minBand={1}
          maxBand={6}
          value={s.answer_band}
          onChange={(answer_band) => set('answer_band', answer_band)}
        />
        <DictBandField
          name="legal_band"
          error={errors.legal_band}
          label="Legal guesses"
          length={WORD_LENGTH}
          minBand={answerMaxBand(s)}
          maxBand={6}
          value={s.legal_band}
          onChange={(legal_band) => set('legal_band', legal_band)}
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
