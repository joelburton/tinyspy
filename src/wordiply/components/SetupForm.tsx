import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import type { SetupBodyProps } from '../../common/lib/games'
import { cleanBase, type WordiplySetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'
import local from './SetupForm.module.css'

/**
 * wordiply's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button the player clicked), so this
 * body never renders a mode radio.
 *
 * It's deliberately minimal: a mode paragraph, one dictionary-difficulty
 * band (the base is a letter-combination, not a word, so there's no base
 * difficulty; and wordiply isn't a race-to-rank, so no target-rank picker),
 * and the shared `<TimerField>`.
 *
 * Controlled component: state lives in the wrapping `SetupGameDialog`; this
 * body renders `value` and signals via `onChange`.
 */
export function SetupForm({ mode, players, value, onChange }: SetupBodyProps) {
  const s = value as WordiplySetup

  // The custom-starter section's summary carries its own value, so a closed
  // section still shows what's set (SetupSection's contract).
  const customBase = s.custom_base ?? ''
  const customBaseLabel = customBase
    ? `Starter: ${customBase.toUpperCase()}`
    : 'Starter (optional)'

  return (
    <div className={styles.setup}>
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. */}
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
          Everyone in the club shares five guesses. Each guess must contain
          the starter and be longer than it; together you're hunting the
          longest word.
        </p>
      ) : (
        <p className="muted">
          Each player gets their own five guesses off the same starter. The
          longest word wins; until the end you only see how many guesses each
          other has spent, not the words.
        </p>
      )}

      <DifficultyField
        label="Dictionary"
        length={null}
        minDifficulty={1}
        maxDifficulty={6}
        value={s.difficulty}
        onChange={(difficulty) => onChange({ ...s, difficulty })}
      />

      {/* Optional custom starter, behind a disclosure whose summary shows the
          chosen letters (e.g. "Starter: MOTH") or "(optional)" when blank.
          Blank → a random starter (the normal path); fill it to play exactly
          these letters — which is how you send a friend a challenge.

          Start is gated on `customBaseError` (via the manifest's validate), but
          only on SHAPE: whether the letters yield a board is the edge
          function's call, so an unusable starter fails at Start with the
          server's reason — the same deal boggle's constraints get. Cleared
          input stores `undefined` so the edge function sees it as absent →
          random. */}
      <SetupSection label={customBaseLabel}>
        <p className="muted">
          Leave blank for a random starter, or set your own: 2–4 letters that
          every guess must contain. Very short starters usually match too many
          words to make a puzzle.
        </p>
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={4}
          value={customBase}
          onChange={(e) =>
            onChange({ ...s, custom_base: cleanBase(e.target.value) || undefined })
          }
          className={local.baseInput}
          aria-label="Custom starter"
        />
      </SetupSection>

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
