// cs-unmet

import { SetupTimerSection } from '@/common/setup-form/SetupTimerSection'
import { SetupCoopStyleSection } from '@/common/setup-form/SetupCoopStyleSection'
import { DictBandField } from '@/common/fields/DictBandField'
import { SelectField } from '@/common/fields/SelectField'
import { RadioRow } from '@/common/fields/RadioRow'
import { SetupSection } from '@/common/setup-form/SetupSection'
import { PlayersSection } from '@/common/setup-form/PlayersSection'
import { difficultyValue } from '@/common/setup-form/difficulty'
import type { SetupBodyProps, SetupSetter } from '@/common/setup-form/setupForm'
import {
  GUESS_OPTIONS,
  WORD_COUNT_OPTIONS,
  type PsychicnumValues,
} from '../lib/setup'

/**
 * psychicnum's per-game setup form, rendered inside the common
 * `SetupGameModal`. Choices for the players:
 *
 *   - **Guesses** — guess budget, one of {3, 5, 7, 9}.
 *   - **Words on the board** — how many words (5..20); three are secret.
 *   - **Word difficulty** — the dictionary band the board is drawn from
 *     (the shared `<DictBandField>`).
 *   - **Timer** — the shared `<SetupTimerSection>`.
 *
 * No member-aware UI (every guess is interchangeable; no seats),
 * no auto-seeding logic — the manifest's defaults already cover
 * a usable initial state.
 *
 * Controlled component pattern, same as the codenamesduet form: state
 * lives in the wrapper; we render from `value` and signal via
 * `onChange`. The single `value as PsychicnumSetup` cast at
 * the top is the boundary between the manifest's `unknown` setup
 * type and psychicnum's narrow shape.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `PsychicnumSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`psychicnum/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  // The boundary between the manifest's game-agnostic `unknown` and
  // psychicnum's own shape — one cast for what the form holds, one for how it
  // is written, so a mistyped key is a compile error.
  const s = values as PsychicnumValues
  const set = setValue as SetupSetter<PsychicnumValues>
  // The checked subset of the roster, in `members` order — a control that must
  // name the ACTUAL players (the turn-order "First player" picker) lists only
  // who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // Disclosure summaries carry the current values so each section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Singular "Dictionary" —
  // psychicnum has ONE band.
  const guessesLabel = `Guesses: ${s.guesses}`
  const wordsLabel = `Words on board: ${s.word_count}`
  const dictLabel = `Dictionary: ${difficultyValue(s.difficulty)}`

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
      {/* Coop pacing — free-for-all (default) vs turn-by-turn — first, right
          below the dialog's player picker. Self-gates to nothing for
          compete / solo, so it's dropped in unconditionally. */}
      <SetupCoopStyleSection
        errors={errors}
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) => {
          set('coop_style', coopStyle)
          set('first_turn_user_id', firstTurnUserId)
        }}
      />
      <SetupSection label={guessesLabel}>
        {/* Copy is mode-neutral on purpose — the same SetupForm
            backs both psychicnum_coop and psychicnum_compete
            manifests. In coop this is the shared pool (per-player
            value equals shared value because everyone decrements
            in lock-step); in compete each player gets this many
            independently. The number-on-the-radio carries the
            same meaning either way. */}
        <RadioRow
          help="How many guesses each player starts with."
          name="guesses"
          error={errors.guesses}
          options={GUESS_OPTIONS.map((n) => ({ value: n, label: n }))}
          value={s.guesses}
          onChange={(guesses) => set('guesses', guesses)}
        />
      </SetupSection>
      <SetupSection label={wordsLabel}>
        {/* The board shows this many words; three of them are the hidden
            secrets, so a bigger board is more haystack. Same in both modes. */}
        <SelectField
          name="word_count"
          error={errors.word_count}
          help={<>{s.word_count} words on the board — find the 3 secrets among them.</>}
          value={s.word_count}
          onChange={(v) => set('word_count', Number(v))}
        >
          {WORD_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
      </SetupSection>
      <SetupSection label={dictLabel}>
        {/* Dictionary band: board words are drawn from common.words at
            difficulty ≤ this (harder bands add more obscure words). */}
        <DictBandField
          name="difficulty"
          error={errors.difficulty}
          help="How obscure the board words can get."
          length={null}
          minBand={1}
          maxBand={6}
          value={s.difficulty}
          onChange={(difficulty) => set('difficulty', difficulty)}
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
