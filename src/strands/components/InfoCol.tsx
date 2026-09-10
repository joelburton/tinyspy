// cs-unmet

import type React from 'react'
import { terminalOutcomeVerb } from '@/common/terminal/terminalOutcomeVerb'
import { type GamePlayer } from '@/common/members/member'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { LocalTerminalRow } from '@/common/terminal/LocalTerminalRow'
import type { TerminalCopy } from '@/common/terminal/terminalCopy'
import { TerminalActionRow } from '@/common/terminal/TerminalActionRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/turn-log/TurnStatusLine'
import type { StrandsSetup } from '../lib/setup'
import type { EventRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import { useDefinePopover } from '@/common/definitions/useDefinePopover'
import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/PlayArea.module.css'
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
  /** The theme words, SPANGRAM FIRST — non-null only while the solution is
   *  showing, since this is the same secret the board's gray lines are. The
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
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete, and
   *  gray once you have SOLVED it (conceding would forfeit a banked win). */
  actConcede: BoundAction
  /** Trace this board again from scratch. */
  actRestart: BoundAction
  /** Start the next puzzle nobody here has played. Disables itself while the
   *  create is in flight. */
  actNewGame: BoundAction
  /** Show the unfound words — or put them away again. A local display toggle
   *  carrying its own two faces, the inert "solution already shown" included. */
  actReveal: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction
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
  actEndGame,
  actConcede,
  actRestart,
  actNewGame,
  actReveal,
  actBackToClub,
  viewingIndex,
  onSelectTurn,
}: Props) {
  // Click-to-define, the shared popover the turn log and word lists use.
  const { define, popover } = useDefinePopover()
  // Pointer-only, deliberately: NOT focusable, no role="button". See
  // common/core-css/utilities.css → `.definable` for why every definable word is like this.
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
                return `${terminalOutcomeVerb(member)} on ${hints}`
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
          <TerminalActionRow over={over}>
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </TerminalActionRow>
        ) : isLocallyDone ? (
          /* Compete, my race over while the others play on: the terminal LOOK
             (a status line + a disabled action), so the frozen board has an
             explanation beside it. */
          <LocalTerminalRow label={iSolved ? 'You solved it — waiting' : 'You conceded'}>
            {/* Concede grays itself once you have solved or dropped out — the
                row keeps its shape and the button says why. */}
            <ActionButton action={actConcede} show="icon" />
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actConcede} show="icon" />
            <ActionButton action={actEndGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" />
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
            theme), each click-to-define. Comes and goes with the board's gray
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
