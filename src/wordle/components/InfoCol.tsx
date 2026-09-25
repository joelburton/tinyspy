// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import type { Member } from '@/common/members/member'
import type { WordlePlayerState, EventRow } from '../hooks/useGame'
import { GameEventLog } from './GameEventLog'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * wordle's info column — near-zero state, an arrangement of the shared scaffold pieces
 * in the fixed order (docs/playarea.md → Info-column readouts): state (guess count) →
 * whose-turn line (turn-order) → OpponentStrip (compete) → action row → help →
 * terminal answer reveal → setup disclosure → the event log. Every command is a
 * BOUND ACTION the PlayArea handed down (`actReveal`, `actEndGame`, …), so this
 * column places buttons and decides nothing about them — an action that does
 * not apply here draws nothing, which is how one row serves coop and compete.
 * What is a callback is what isn't a command: the history-viewer selection.
 * Prop names match the other games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  // ── Mode + phase ──
  isCompete,
  isTerminal,
  terminalMessage,
  showInput,
  myConceded,
  isPlayer,
  turnHolderId,
  // ── State (guess count) ──
  guessesUsed,
  maxGuesses,
  // ── Opponent strip (compete) ──
  players,
  selfId,
  playerStates,
  concededIds,
  // ── Action row ──
  actReveal,
  actRestart,
  actNewGame,
  actConcede,
  actEndGame,
  actBackToClub,
  // ── Setup disclosure ──
  setupRows,
  // ── Terminal answer reveal ──
  solution,
  // ── Event log ──
  guesses,
  mode,
  historyId,
  onShowHistory,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  // The terminal message when the game is over (drives the action row), else null.
  terminalMessage: TerminalMessage | null
  // May I still submit? Gates the help line, and picks the row's line: false
  // with the game still on means I am done in a race the others are still
  // running — solved, out of guesses, or conceded.
  showInput: boolean
  // I specifically conceded (vs. solved or ran out) — picks the locally-done wording.
  myConceded: boolean
  // Am I a player in this game? (Else the "watching" notice.)
  isPlayer: boolean
  // Whose turn it is under turn-order, or null for a free-for-all game.
  // Non-null ⇒ render the shared TurnStatusLine (a turn game).
  turnHolderId: string | null

  // ── State ──
  guessesUsed: number
  maxGuesses: number

  // ── Opponent strip (compete) ──
  // The common roster (identity + concede bits) — the strip + the event-log picker.
  players: Member[]
  selfId: string
  // Per-player wordle state — the strip reads each peer's `guesses_used`.
  playerStates: WordlePlayerState[]
  // Who has conceded (drives the strip's "out" cell).
  concededIds: Set<string>

  // ── Action row — listed in the order the row draws them, which is the order
  //    the game menu lists them too (docs/playarea.md) ──
  // Show the word — or put it away again. A local display toggle, no RPC (see
  // PlayArea's useSolutionReveal); it carries its own faces, the inert
  // "solution already shown" included.
  actReveal: BoundAction
  // Restart THIS game — same word — from scratch.
  actRestart: BoundAction
  // Start a fresh follow-up game — same setup, new target + id. Disables itself
  // while the create is in flight.
  actNewGame: BoundAction
  // Drop out of a race while the others play on — hidden outside compete, and
  // gray once you have SOLVED it (conceding would forfeit a banked win).
  actConcede: BoundAction
  // End the game for the whole table — coop's exit; it hides itself in a race.
  actEndGame: BoundAction
  // Leave for the club — the shell's own action, off `ctx.menu`: it navigates
  // directly at terminal and routes through the suspend-confirm flow mid-game.
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  // The setup recap — the SAME array the PDF prints (lib/setupSummary.ts).
  setupRows: SetupRow[]

  // ── Terminal answer reveal ──
  // The answer to DISPLAY, or null while it stays hidden — which is the default
  // at a terminal this viewer did not solve. `solution` is the glossary term for
  // the terminal-reveal slot; the value is the DB-blessed `game.target`.
  solution: string | null

  // ── Event log ──
  // The RAW guesses (not the viewer's own) — the log's dropdown switches whose show.
  guesses: EventRow[]
  mode: 'coop' | 'compete'
  // The open turn, or null when live.
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
      : { text: myConceded ? 'You conceded' : 'Waiting for others', outcome: 'neutral' }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {!isPlayer && (
          <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
        )}

        {/* State — the live guess count (the viewer's own; coop shares it). */}
        <p className={shared.infoState}>
          <strong>{guessesUsed}/{maxGuesses}</strong> guesses
        </p>
        {/* Whose-turn line — only for a turn-order game (pointer non-null). A
            separate line below the state readout; never replaces it. */}
        {turnHolderId !== null && (
          <TurnStatusLine
            turnHolderId={turnHolderId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        {/* Opponent strip (compete) — each racer's guess COUNT (not their letters,
            which RLS hides until terminal). */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Guesses"
            metricFor={(p) =>
              concededIds.has(p.user_id)
                ? 'out'
                : (playerStates.find((s) => s.user_id === p.user_id)?.guesses_used ?? 0)
            }
          />
        )}

        {/* ONE row, one order, every action listed once: which of them is on
            screen is each action's own answer, since `<ActionButton>` draws
            nothing for one that says it is hidden. The game menu lists the same
            bindings in the same order (docs/playarea.md). wordle has nothing to
            the left of the divider — no hint, no spoiler — so it draws none. */}
        <InfoActionsRow message={rowMessage}>
          <ActionButton action={actReveal} show="icon" />
          <ActionButton action={actRestart} show="icon" />
          <ActionButton action={actNewGame} show="icon" />
          <ActionButton action={actConcede} show="icon" />
          <ActionButton action={actEndGame} show="icon" />
          {/* `weight` is the placement's to choose, not the action's — filled
              at terminal, outline while the game runs (docs/ui.md → Back to
              club). */}
          <ActionButton
            action={actBackToClub}
            show="icon"
            weight={terminalMessage ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Help — only while you can act; the action row above carries the
            locally-done state. */}
        {showInput && (
          <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
        )}

        {/* The word shows here and nowhere else — the below-board pill is a
            one-line ellipsizing row with the verdict in it, and this has the
            room to be a sentence and a click-to-define target. The region grows
            when the viewer opens it and gives the space back when they close it,
            a blessed exception to docs/ui.md → Layout stability. */}
        {terminalMessage && solution && (
          <div className={shared.terminalExtra}>
            <p className={cls(shared.infoState, styles.answerLine)}>
              The answer was <DefinableWord word={solution} className={styles.answerReveal} />
            </p>
          </div>
        )}

        {/* Setup — last, behind a disclosure (closed by default). */}
        <SetupDisclosure rows={setupRows} />
      </div>

      {/* Bottom region: the event log. It takes the RAW `guesses` (not the viewer's own)
          so its header dropdown can switch whose guesses show — coop is one shared
          "Team"; compete defaults to You and lists opponents (their rows fill in once
          the game ends and RLS reveals them). */}
      <GameEventLog
        guesses={guesses}
        players={players}
        selfId={selfId}
        mode={mode}
        isTerminal={isTerminal}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
