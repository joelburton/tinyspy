import { cls } from '../../common/lib/util/cls'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import type { Member } from '../../common/lib/games'
import type { WordlePlayerState, GuessRow } from '../hooks/useGame'
import type { WordleSetup } from '../lib/setup'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/** Where the hidden target is drawn from, for the setup disclosure. `0` = the curated
 *  NYT-Wordle answer list; `1..6` = a clean word of that difficulty band or easier. */
const answerSourceLabel = (n: number): string =>
  n === 0 ? 'NYT Wordle list' : `${difficultyValue(n)} or easier`

/**
 * wordle's info column — near-zero state, an arrangement of the shared scaffold pieces
 * in the fixed order (docs/design-decisions.md → Info column): state (guess count) →
 * OpponentStrip (compete) → action row → help → setup disclosure → terminal answer
 * reveal → the turn log. Every mutation is a named callback up (`onEndGame` /
 * `onConcede` / `onBackToClub` / `onSelectTurn`); PlayArea owns the RPCs + the history
 * coordination. Prop names match the other games' columns for the same idea (docs/
 * playarea-decomposition-plan.md).
 */
export function InfoCol({
  // ── Mode + phase ──
  isCompete,
  isTerminal,
  over,
  isLocallyDone,
  myConceded,
  isPlayer,
  // ── State (guess count) ──
  guessesUsed,
  maxGuesses,
  // ── Opponent strip (compete) ──
  players,
  selfId,
  playerStates,
  concededIds,
  // ── Action row ──
  onEndGame,
  onConcede,
  onBackToClub,
  // ── Setup disclosure ──
  setup,
  // ── Terminal answer reveal ──
  solution,
  // ── Turn log ──
  guesses,
  mode,
  viewingIndex,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  /** Terminal copy when the game is over (drives the action row + modal), else null. */
  over: TerminalCopy | null
  /** I'm done in a compete race (solved / out / conceded) while the others race on —
   *  the terminal LOOK without revealing the answer. */
  isLocallyDone: boolean
  /** I specifically conceded (vs. ran out) — picks the locally-done wording. */
  myConceded: boolean
  /** Am I a player in this game? (Else the "watching" notice.) */
  isPlayer: boolean

  // ── State ──
  guessesUsed: number
  maxGuesses: number

  // ── Opponent strip (compete) ──
  /** The common roster (identity + concede bits) — the strip + the turn-log picker. */
  players: Member[]
  selfId: string
  /** Per-player wordle state — the strip reads each peer's `guesses_used`. */
  playerStates: WordlePlayerState[]
  /** Who has conceded (drives the strip's "out" cell). */
  concededIds: Set<string>

  // ── Action row ──
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: WordleSetup

  // ── Terminal answer reveal ──
  /** The hidden answer, revealed once terminal (else null). Prop is `solution`
   *  (the glossary term for the terminal-reveal slot, matching waffle/stackdown);
   *  the value comes from the DB-blessed `game.target` column. */
  solution: string | null

  // ── Turn log ──
  /** The RAW guesses (not the viewer's own) — the log's dropdown switches whose show. */
  guesses: GuessRow[]
  mode: 'coop' | 'compete'
  /** Turn-history: the open turn (by log position), or null when live. */
  viewingIndex: number | null
  /** Open a turn on the board viewer (click its `#N`). */
  onSelectTurn: (index: number) => void
}) {
  // Click-to-define on the revealed answer (the shared DefinitionPopover — same
  // lookup waffle's SolutionReveal and stackdown's turn log use).
  const { define, popover } = useDefinePopover()

  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out of the
  // race → wordle.concede); coop uses the neutral "End" (a mutual "we're done" →
  // end_game). Shared by the playing and the locally-terminal action rows.
  const endButton = isCompete ? (
    <ConcedeGameButton onClick={onConcede} className={shared.helperButton} disabled={myConceded} />
  ) : (
    <EndGameButton onClick={onEndGame} className={shared.helperButton} />
  )

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {!isPlayer && (
          <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
        )}

        {/* State — the live guess count (the viewer's own; coop shares it). */}
        <p className={shared.infoState}>
          <strong>{guessesUsed}/{maxGuesses}</strong> guesses
        </p>

        {/* Opponent strip (compete) — each racer's guess COUNT (not their letters,
            which RLS hides until terminal). */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Guesses"
            metricFor={(p, isSelf) =>
              concededIds.has(p.user_id)
                ? 'out'
                : isSelf
                  ? guessesUsed
                  : (playerStates.find((s) => s.user_id === p.user_id)?.guesses_used ?? 0)
            }
          />
        )}

        {/* Action row — three states. Terminal: the outcome line + back-to-club.
            Locally terminal (compete, I'm done while others race): the terminal LOOK —
            "Waiting for others" + Concede. Playing: just End/Concede (wordle has no
            hint/reveal). */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : isLocallyDone ? (
          <LocalTerminalRow label={myConceded ? 'You conceded' : 'Waiting for others'}>
            {endButton}
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>{endButton}</div>
        )}

        {/* Help — only while you can act (never a silent swap; the locally-done state is
            carried loudly by the action row above). */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
        )}

        {/* Setup — last, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>Guesses: {maxGuesses}</li>
          <li>Answer: {answerSourceLabel(setup.answer_source)}</li>
          <li>Dictionary: {difficultyValue(setup.legal_guess)}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* Terminal-only answer reveal — the one info-column region allowed to grow at
          game over (docs/ui.md → Layout stability). Shown in BOTH here and the
          below-board pill, deliberately. */}
      {over && solution && (
        <div className={shared.terminalExtra}>
          <p className={cls(shared.infoState, styles.answerLine)}>
            The answer was{' '}
            <strong
              className={cls('definable', styles.answerReveal)}
              role="button"
              tabIndex={0}
              title="Click to define"
              onClick={(e) => define(solution, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  define(solution, e.currentTarget)
                }
              }}
            >
              {solution.toUpperCase()}
            </strong>
          </p>
          {popover}
        </div>
      )}

      {/* Bottom region: the turn log. It takes the RAW `guesses` (not the viewer's own)
          so its header dropdown can switch whose guesses show — coop is one shared
          "Team"; compete defaults to You and lists opponents (their rows fill in once
          the game ends and RLS reveals them). */}
      <GameTurnLog
        guesses={guesses}
        players={players}
        selfId={selfId}
        mode={mode}
        isTerminal={isTerminal}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
