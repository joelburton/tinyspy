import type React from 'react'
import { outcomeVerb, type GamePlayer } from '../../common/lib/games'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import type { SetupRow } from '../../common/lib/game/setupRows'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import type { StrandsSetup } from '../lib/setup'
import type { EventRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { cls } from '../../common/lib/util/cls'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

type Props = {
  // ── Mode + phase ──
  isCompete: boolean
  /** Compete: my race is over (solved, or conceded) while others play on. */
  isLocallyDone: boolean
  /** Solved, as opposed to conceded — they read very differently. */
  iSolved: boolean
  isTerminal: boolean
  over: TerminalCopy | null
  /** Are the unfound words drawn on the board right now? Swaps the button to
   *  its Hide face. */
  solutionShown: boolean
  /** The theme words, SPANGRAM FIRST — non-null only while the solution is
   *  showing, since this is the same secret the board's grey lines are. The
   *  board draws paths and never spells anything out, so without this the
   *  reveal makes you read the words off the grid letter by letter. */
  solutionWords: string[] | null
  currentTurnUserId: string | null
  // ── State ──
  clue: string
  wordsFound: number
  hintsSpent: number
  // ── Log ──
  events: EventRow[]
  players: GamePlayer[]
  /** Per-player hints used, for the opponent strip. */
  hintsByUser: Map<string, number>
  solvedIds: Set<string>
  selfId: string
  // ── Setup echo ──
  setup: StrandsSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  // ── Actions ──
  onEndGame: () => void
  onConcede: () => void
  onRestart: () => void
  onNewGame: () => void
  startingNewGame: boolean
  onReveal: () => void
  onBackToClub: () => void
  // ── Turn-history viewer ──
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}

/**
 * strands' info column, in the canonical order (docs/playarea.md → Info-column
 * readouts): **state → opponents (compete) → action row → help → setup
 * disclosure → turn log**. The OpponentStrip is compete-only — coop has no
 * opponents — and shows a rival exactly one number mid-race: hints spent.
 *
 * The **clue** leads the state region. It is the theme PROMPT, not the answer,
 * so it belongs on screen from the first second; putting it anywhere else would
 * imply it had to be earned.
 *
 * Every mutation is a named callback up; PlayArea owns the RPCs.
 */
export function InfoCol({
  isCompete,
  isLocallyDone,
  iSolved,
  isTerminal,
  over,
  solutionShown,
  solutionWords,
  currentTurnUserId,
  clue,
  wordsFound,
  hintsSpent,
  events,
  players,
  hintsByUser,
  solvedIds,
  selfId,
  setupRows,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onReveal,
  onBackToClub,
  viewingIndex,
  onSelectTurn,
}: Props) {
  // Click-to-define, the shared popover the turn log and word lists use.
  const { define, popover } = useDefinePopover()
  // Pointer-only, deliberately: NOT focusable, no role="button". See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineProps = (word: string) => ({
    className: 'definable',
    title: 'Click to define',
    onClick: (e: React.MouseEvent<HTMLSpanElement>) => define(word, e.currentTarget),
  })

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

        {/* Opponent strip (compete). The metric is HINTS USED and nothing else:
            it is the ranking, so it makes the race legible, and it says nothing
            about the puzzle. Word counts stay private until terminal — a
            deliberate divergence from the other compete games, which do show
            peer progress "so the race has tension". Here the hint count IS the
            tension. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Hints"
            metricFor={(p, isSelf) => {
              const hints = hintsByUser.get(p.user_id) ?? 0
              if (isTerminal) {
                const member = players.find((m) => m.user_id === p.user_id)
                return `${outcomeVerb(member)} on ${hints}`
              }
              // Mid-race: a rival who is done is worth showing as done — that's
              // race status, not puzzle content, and it tells you the bar you
              // have to clear.
              if (!isSelf && solvedIds.has(p.user_id)) return `done on ${hints}`
              return hints
            }}
          />
        )}

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

        {/* ── Action row ── TERMINAL: the outcome line + Reveal / Restart /
            New game / back-to-club. Reveal is always PRESENT (it toggles rather
            than spends itself, so the row can't change shape under a click) and
            nothing autoreveals — a finished board keeps its unfound words until
            the players ask. PLAYING: End + back-to-club. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            <RevealButton
              iconOnly
              label="Reveal answer"
              revealedLabel="Hide answer"
              revealed={solutionShown}
              onClick={onReveal}
            />
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : isLocallyDone ? (
          /* Compete, my race over while the others play on: the terminal LOOK
             (a status line + a disabled action), so the frozen board has an
             explanation beside it. */
          <LocalTerminalRow label={iSolved ? 'You solved it — waiting' : 'You conceded'}>
            <ConcedeGameButton iconOnly className={shared.helperButton} disabled />
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {isCompete ? (
              <ConcedeGameButton iconOnly className={shared.helperButton} onClick={onConcede} />
            ) : (
              <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
            )}
            <BackToClubButton iconOnly onClick={onBackToClub} />
          </div>
        )}

        {/* ── Help ── only while it's actionable; never silently swapped. */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Click letters in order — they may touch diagonally. After the first,
            you can type the rest. Click the last one again (or press{' '}
            <kbd>Enter</kbd>) to submit; <kbd>⌫</kbd> undoes one.
          </p>
        )}

        {/* ── The words themselves ── the other half of the reveal, and the
            half the board can't give you: a path shows you WHERE a word is,
            never what it says. Spangram first (it's the one that names the
            theme), each click-to-define. Comes and goes with the board's grey
            lines — one toggle, one secret — which is why it grows and shrinks
            here (a blessed exception to docs/ui.md → Layout stability). */}
        {solutionWords && (
          <p className={cls(shared.terminalExtra, styles.solutionWords)}>
            <span className="muted">Words:</span>{' '}
            {solutionWords.map((w) => (
              <span key={w} {...defineProps(w)}>
                {w.toUpperCase()}
              </span>
            ))}
            {popover}
          </p>
        )}

        {/* ── Setup ── LAST before the log, behind a disclosure. */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

      <GameTurnLog
        events={events}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
