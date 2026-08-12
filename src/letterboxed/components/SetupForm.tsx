import { useState } from 'react'
import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import type { SetupBodyProps } from '../../common/lib/games'
import { PAR } from '../lib/board'
import { cleanSides, formatSides } from '../lib/customBoard'
import type { LetterboxedSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'
import local from './SetupForm.module.css'

/**
 * letterboxed's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button the player clicked), so this
 * body never renders a mode radio.
 *
 * Two knobs, and they pull in OPPOSITE directions, which the copy has to make
 * plain: a lower word limit is harder, while a higher dictionary band is
 * EASIER (more legal words means more escape routes off an awkward tail).
 *
 * Controlled component: state lives in the wrapping `SetupGameDialog`; this
 * body renders `value` and signals via `onChange`.
 */
export function SetupForm({ mode, players, value, onChange }: SetupBodyProps) {
  const s = value as LetterboxedSetup

  // WHAT YOU TYPED, kept separately from what gets stored. The field shows your
  // text verbatim — dashes, dots, spaces and all — because you should be able
  // to paste "ABC-DEF-GHI-JKL" and still see a board rather than a run of
  // twelve letters. `custom_sides` on the setup holds the NORMALISED twelve
  // (`cleanSides`), the shape the other games store and the shape the server
  // cross-checks against `board.sides`.
  //
  // Local state rather than deriving from `s.custom_sides`, because the two
  // genuinely differ: normalising is lossy about separators, so the field could
  // not be reconstructed from the stored value. It initialises from the setup
  // once, which is right — `custom_sides` is stripped from the club default
  // (create_game), so a reopened dialog starts blank by design.
  const [typedSides, setTypedSides] = useState(s.custom_sides ?? '')

  // The section's summary carries its own value, so a closed section still
  // shows what's set (SetupSection's contract). CANONICAL, not the raw text:
  // the summary is the board as the app writes it everywhere else, and a
  // half-typed board summarises honestly ("Board: ABC-DE").
  const customSides = s.custom_sides ?? ''
  const customSidesLabel = customSides
    ? `Board: ${formatSides(customSides)}`
    : 'Board (optional)'

  return (
    <div className={styles.setup}>
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. Turn-by-turn suits this
          game unusually well: the chain hands off on its own. */}
      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
        }
      />

      {mode === 'coop' ? (
        <p className="muted">
          One shared chain. Each word starts with the last letter of the one
          before it, and no word may use two letters from the same side.
          Together, touch all twelve letters.
        </p>
      ) : (
        <p className="muted">
          Same twelve letters, a private chain each. First to touch all twelve
          within the word limit wins; until then you only see how far the
          others have got, not their words.
        </p>
      )}

      {/* Difficulty is expressed against PAR, not as a bare word count: every
          board is solvable in two, so "5 words" means nothing on its own while
          "par + 3" says exactly how much room you are giving yourself. */}
      <SelectField
        label="Word limit (every board can be solved in 2)"
        value={s.extra_words}
        onChange={(v) => onChange({ ...s, extra_words: Number(v) })}
      >
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n === 0
              ? `Par — ${PAR} words exactly`
              : `Par + ${n} — up to ${PAR + n} words${n === 5 ? ' (relaxed)' : ''}`}
          </option>
        ))}
      </SelectField>

      {/* Higher = easier here, unlike most games' difficulty bands. */}
      <DifficultyField
        label="Dictionary (higher accepts more words)"
        length={null}
        minDifficulty={1}
        maxDifficulty={6}
        value={s.legal_band}
        onChange={(legal_band) => onChange({ ...s, legal_band })}
      />

      {/* Optional custom board, behind a disclosure whose summary shows the
          board as it's written everywhere else ("Board: ABC-DEF-GHI-JKL") or
          "(optional)" when blank. Blank → a rolled board (the normal path);
          fill it to play exactly this one — which is how you send a friend a
          board you liked, read straight off its info column or its printout.

          Last before the timer because it's the rare knob: the two difficulty
          fields above are the ones every game touches.

          Start is gated on `customSidesError` (via the manifest's validate),
          but only on SHAPE — twelve distinct letters. Whether those letters
          are a board we can prove solvable in two is the edge function's call
          (it needs the seed table), so an unprovable board fails at Start with
          the server's reason. Cleared input stores `undefined` so the edge
          function sees it as absent → roll. */}
      <SetupSection label={customSidesLabel}>
        <p className="muted">
          Leave blank to roll a random board, or type one: all twelve letters,
          clockwise from the top-left corner. Separators are ignored, so paste
          it however you have it written.
        </p>
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typedSides}
          onChange={(e) => {
            setTypedSides(e.target.value)
            onChange({ ...s, custom_sides: cleanSides(e.target.value) || undefined })
          }}
          className={local.sidesInput}
          placeholder="ABC-DEF-GHI-JKL"
          aria-label="Custom board"
        />
      </SetupSection>

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
