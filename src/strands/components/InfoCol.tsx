import type { Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { StrandsSetup } from '../lib/setup'
import type { GuessRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

type Props = {
  // ── Mode + phase ──
  isTerminal: boolean
  over: TerminalCopy | null
  solutionRevealed: boolean
  currentTurnUserId: string | null
  // ── State ──
  clue: string
  wordsFound: number
  hintsSpent: number
  // ── Log ──
  guesses: GuessRow[]
  players: Member[]
  selfId: string
  // ── Setup echo ──
  setup: StrandsSetup
  // ── Actions ──
  onEndGame: () => void
  onRestart: () => void
  onNewGame: () => void
  startingNewGame: boolean
  onReveal: () => void
  onBackToClub: () => void
}

/**
 * strands' info column, in the canonical order (docs/playarea.md → Info-column
 * readouts): **state → action row → help → setup disclosure → turn log**. No
 * OpponentStrip — coop has no opponents, and the compete sibling isn't built.
 *
 * The **clue** leads the state region. It is the theme PROMPT, not the answer,
 * so it belongs on screen from the first second; putting it anywhere else would
 * imply it had to be earned.
 *
 * Every mutation is a named callback up; PlayArea owns the RPCs.
 */
export function InfoCol({
  isTerminal,
  over,
  solutionRevealed,
  currentTurnUserId,
  clue,
  wordsFound,
  hintsSpent,
  guesses,
  players,
  selfId,
  setup,
  onEndGame,
  onRestart,
  onNewGame,
  startingNewGame,
  onReveal,
  onBackToClub,
}: Props) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* ── State ── */}
        {/* Quoted: the clue is the puzzle's own words, not ours, and unquoted
            it reads as a heading the app wrote. */}
        <p className={styles.clue}>“{clue}”</p>
        {/* Count only, never "of N": the TOTAL is part of the answer, and a
            shielded puzzle shouldn't announce how many words it holds. */}
        <p className={shared.infoState}>
          {wordsFound} {wordsFound === 1 ? 'word' : 'words'}
          {hintsSpent > 0 && <span className={styles.hintsUsed}> · {hintsSpent} hint{hintsSpent === 1 ? '' : 's'} used</span>}
        </p>

        {/* Whose-turn line — ONLY for a turn-order game (pointer non-null). The
            component itself doesn't guard: its contract is that the caller
            decides, and rendering it unconditionally puts a "Waiting for
            someone…" nag on a free-for-all board where nobody is waiting. */}
        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        {/* ── Action row ── TERMINAL: the outcome line + Restart / New game /
            back-to-club, plus Reveal while the answer is still hidden (strands
            registers hides_solution, so a game that ended without a win keeps
            its secret until the players ask). PLAYING: End + back-to-club. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {!solutionRevealed && <RevealButton iconOnly onClick={onReveal} />}
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : (
          <div className={shared.infoActions}>
            <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
            <BackToClubButton iconOnly onClick={onBackToClub} />
          </div>
        )}

        {/* ── Help ── only while it's actionable; never silently swapped. */}
        {!over && (
          <p className={shared.infoHelp}>
            Click letters in order — they may touch diagonally. Click the last one
            again (or press <kbd>Enter</kbd>) to submit; <kbd>⌫</kbd> undoes one.
          </p>
        )}

        {/* ── Setup ── LAST before the log, behind a disclosure. */}
        <SetupDisclosure>
          <li>Hint dictionary: {difficultyValue(setup.band)}</li>
          <li>Words per hint: {setup.hint_cost}</li>
          <li>Shortest word: {setup.min_word_length} letters</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      <GameTurnLog
        guesses={guesses}
        players={players}
        selfId={selfId}
        mode="coop"
        isTerminal={isTerminal}
      />
    </div>
  )
}
