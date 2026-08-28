// cs-unmet

import { DictBandField } from '../../common/components/fields/DictBandField'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { SelectField } from '../../common/components/fields/SelectField'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { answerMaxBand, GUESS_OPTIONS, type WordleValues } from '../lib/setup'

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
 * Plus the shared `SetupTimerSection`. Controlled component (state lives in the
 * wrapper); shared by both manifests (mode doesn't change the form).
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
  // opening (the boggle/scrabble/spellingbee pattern). Answer source 0 is the
  // curated Wordle list — not a difficulty band — so it formats as "0 (Wordle)".
  const guessesLabel = `Guesses: ${s.max_guesses}`
  const answerValue =
    s.answer_source === 0 ? '0 (Wordle)' : difficultyValue(s.answer_source)
  const dictLabel = `Dictionaries: ${answerValue} / ${difficultyValue(s.legal_guess)}`

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
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
          name="answer_source"
          label="Answer source"
          length={5}
          extraLowOption={{ value: 0, label: 'Wordle' }}
          minBand={1}
          maxBand={6}
          value={s.answer_source}
          onChange={(answer_source) => set('answer_source', answer_source)}
        />
        <DictBandField
          name="legal_guess"
          label="Legal guesses"
          length={5}
          minBand={answerMaxBand(s)}
          maxBand={6}
          value={s.legal_guess}
          onChange={(legal_guess) => set('legal_guess', legal_guess)}
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
