// cs-met-connections

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { ConnectionsSetup } from '../lib/setup'
import type { Board } from '../lib/board'
import type { EventRow, Player } from '../hooks/useGame'
import { GameEventLog } from './GameEventLog'
import { HintList } from './HintList'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'


/**
 * connections's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * whose-turn line (turn-order) → OpponentStrip (compete) → action row → the hint
 * list → help → setup disclosure → event log. Every command is a BOUND ACTION the
 * PlayArea handed down (`actHint`, `actEndGame`, …), so this column places buttons
 * and decides nothing about them — an action that does not apply here draws
 * nothing, which is how one row serves coop and compete. What is a callback is
 * what isn't a command: the history-viewer selection. Prop names match the other
 * games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  isCompete,
  terminalMessage,
  showInput,
  myConceded,
  currentTurnUserId,
  found,
  categoryCount,
  mistakeCount,
  mistakeBudget,
  players,
  selfId,
  metricByUser,
  concededIds,
  actHint,
  actReveal,
  actRestart,
  actNewGame,
  actConcede,
  actEndGame,
  actBackToClub,
  categories,
  hintsOpen,
  setupRows,
  guesses,
  historyId,
  onShowHistory,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  // The terminal message when the game is over (drives the action row), else null.
  terminalMessage: TerminalMessage | null
  // May I still submit? Gates the hint list + help (vs the locally-done look).
  showInput: boolean
  // I conceded / was eliminated in a compete race — picks the locally-done wording.
  myConceded: boolean
  // Whose turn it is under turn-order, or null for a free-for-all game.
  // Non-null ⇒ render the shared TurnStatusLine (a turn game).
  currentTurnUserId: string | null

  // ── State readout (categories found + mistakes) ──
  found: number
  categoryCount: number
  mistakeCount: number
  mistakeBudget: number

  // ── Players (the OpponentStrip — compete) ──
  // The roster (identity + per-player concede flags).
  players: Player[]
  selfId: string
  // Opponents' public categories-found counts (`connections.players.matched_count`).
  metricByUser: ReadonlyMap<string, number>
  // Who has conceded (drives the OpponentStrip "out" mid-game).
  concededIds: Set<string>

  // ── Action row — listed in the order the row draws them, which is the order
  //    the game menu lists them too (docs/playarea.md) ──
  // Unfold / fold the inline hint list. Carries its own two faces.
  actHint: BoundAction
  // Show the categories nobody solved — or put them away, bringing back the
  // board as the game ended. A local display toggle; nothing is written, and it
  // carries its own two faces (see PlayArea's useSolutionReveal).
  actReveal: BoundAction
  // Solve THIS puzzle again from scratch — same sixteen tiles, same shuffle.
  actRestart: BoundAction
  // Start the NEXT unplayed daily puzzle — connections' archive is dated, so
  // this walks forward rather than re-rolling a board. Disables itself while
  // the create is in flight, so a slow network reads as "working".
  actNewGame: BoundAction
  // Drop out of a race while the others play on — hidden outside compete.
  actConcede: BoundAction
  // End the game for the whole table — coop's exit; it hides itself in a race.
  actEndGame: BoundAction
  // Leave for the club — the shell's own action, off `ctx.menu`.
  actBackToClub: BoundAction

  // ── The hint list ──
  // The board's 4 categories — feeds the inline HintList (first-tile reveals).
  categories: Board['categories']
  // Is the inline hint list unfolded? The Hints button toggles this (PlayArea owns it).
  hintsOpen: boolean

  // ── Setup disclosure ──
  setup: ConnectionsSetup
  // The setup recap — the SAME array the PDF prints (lib/setupSummary.ts).
  setupRows: SetupRow[]
  // The puzzle's NYT date (setup echo), or null for a custom puzzle.
  puzzleDate: string | null
  // The number of board tiles (setup echo).
  tileCount: number

  // ── Turn-history log (GameEventLog) ──
  guesses: EventRow[]
  // The turn currently open in the board viewer, or null.
  historyId: number | null
  // Straight through to the log: opening a `#N` hands up the row's id and the
  // number the log printed beside it.
  onShowHistory: (id: number, n: number) => void
}) {
  // The row's line, and the only thing that varies between states: the verdict
  // once the game is over, a neutral "you are done, they are not" while a race
  // runs on without you, and nothing at all while you can still play.
  const rowMessage: InfoActionsMessage | undefined = terminalMessage
    ? { text: terminalMessage.infoColText, outcome: terminalMessage.outcome }
    : showInput
      ? undefined
      : { text: myConceded ? 'You conceded' : 'You’re out', outcome: 'neutral' }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — categories found + mistakes (the mistakes dots live below the
            board; this is the at-a-glance textual count, kept here too). */}
        <p className={shared.infoState}>
          <strong>
            {found}/{categoryCount}
          </strong>{' '}
          categories found ·{' '}
          <strong>
            {mistakeCount}/{mistakeBudget}
          </strong>{' '}
          mistakes
        </p>
        {/* Whose-turn line — only for a turn-order game (pointer non-null). A
            separate line below the state readout; never replaces it. */}
        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={terminalMessage !== null}
          />
        )}

        {/* Opponent strip (compete) — the race comparison: each player's categories
            FOUND (public via players.matched_count). */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Found"
            metricFor={(p, isSelf) =>
              // A dropped-out racer reads 'out' mid-game (their found-count is frozen
              // and no longer part of the race); everyone else shows their live
              // categories-found.
              concededIds.has(p.user_id)
                ? 'out'
                : isSelf
                  ? found
                  : (metricByUser.get(p.user_id) ?? 0)
            }
          />
        )}

        {/* ONE row, one order, every action listed once. Which of them is on
            screen right now is each action's own answer — `<ActionButton>` draws
            nothing for an action that says it is hidden — so no branch here can
            disagree with what the menu shows. The game menu lists the same
            bindings in this same order (docs/playarea.md). */}
        <InfoActionsRow message={rowMessage}>
          {/* Hints toggles the inline HintList below (warning-toned, amber);
              aria-pressed reflects whether the list is currently unfolded. */}
          <ActionButton action={actHint} show="icon" aria-pressed={hintsOpen} />
          {/* Everything right of here is about the END of the game rather than
              about playing it. Both sides are pressable mid-game, so the bar is
              what says where the meaning changes; it hides itself when nothing
              is left on its left. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actReveal} show="icon" />
          {/* Both say `hidden` to a button until the game is over, while their
              menu rows and keys stay live all game — the row's few slots belong
              to playing, and moving on is a thing you go looking for. */}
          <ActionButton action={actRestart} show="icon" />
          <ActionButton action={actNewGame} show="icon" />
          {/* Compete's Concede and coop's End are distinct acts, and each hides
              itself in the mode that isn't its own. */}
          <ActionButton action={actConcede} show="icon" />
          <ActionButton action={actEndGame} show="icon" />
          {/* Leaving, last. Filled at terminal, outline while the game runs:
              `weight` is the placement's to choose rather than the action's,
              which is why it is a condition here (docs/ui.md → Back to club). */}
          <ActionButton
            action={actBackToClub}
            show="icon"
            weight={terminalMessage ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>
        {/* The per-player hint reveals — unfolds right under the action row when
            Hints is on; stays mounted (so revealed tiles persist across toggles),
            and folds with the Hints button once you can no longer submit. */}
        <HintList categories={categories} open={hintsOpen && showInput} />

        {/* Help — shown only while you can act on it (never silently swaps); the
            eliminated state is carried loudly by the action row above. */}
        {showInput && (
          <p className={shared.infoHelp}>Pick 4 tiles that share a connection, then Submit.</p>
        )}

        {/* Setup — last, behind a disclosure (closed by default so it doesn't claim
            space). */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

      {/* Event log. Coop shows the whole shared game; compete gets the shared
          "whose guesses?" picker — an opponent's rows are RLS-hidden during play
          and open at terminal, so the picker is how you compare lines afterwards. */}
      <GameEventLog
        guesses={guesses}
        categories={categories}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={terminalMessage !== null}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
