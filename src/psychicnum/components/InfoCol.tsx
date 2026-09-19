// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import type { Player, PlayerRow, EventRow } from '../hooks/useGame'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * psychicnum's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * OpponentStrip (compete) → action row → help → setup disclosure → event log. Every
 * command is a BOUND ACTION the PlayArea handed down (`actHint`, `actEndGame`, …),
 * so this column places buttons and decides nothing about them — an action that
 * does not apply here draws nothing, which is how one row serves coop and compete.
 * What is a callback is what isn't a command: the history-viewer selection.
 * Prop names match the other games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  isCompete,
  terminalMessage,
  isStillPlaying,
  myConceded,
  isMyTurn,
  currentTurnUserId,
  found,
  secretCount,
  guessesUsed,
  totalGuesses,
  players,
  selfId,
  playerBudgets,
  concededIds,
  actHint,
  actSpoiler,
  actReveal,
  actRestart,
  actNewGame,
  actConcede,
  actEndGame,
  actBackToClub,
  setupRows,
  guesses,
  isTerminal,
  historyId,
  onShowHistory,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** The terminal message when the game is over (drives the action row), else null. */
  terminalMessage: TerminalMessage | null
  /** May I still guess? Gates the play action row + help (vs the locally-done look). */
  isStillPlaying: boolean
  /** I conceded a compete race (a real loss; the others keep racing) — picks the
   *  locally-done status wording. */
  myConceded: boolean
  // Turn-order: may I act THIS moment? The shell's one answer, the same one
  // BoardCol gates the entry on. Always true for free-for-all / solo.
  isMyTurn: boolean
  /** Whose turn it is under turn-order, or null for a free-for-all game.
   *  Non-null ⇒ render the shared `<TurnStatusLine>` (this is a turn game);
   *  null ⇒ omit it entirely (the default free-for-all games). */
  currentTurnUserId: string | null

  // ── State readout (secrets found + the guess counter) ──
  found: number
  secretCount: number
  guessesUsed: number
  totalGuesses: number

  // ── Players (the OpponentStrip — compete) ──
  /** The roster (identity + per-player concede flags). */
  players: Player[]
  selfId: string
  /** Per-player budget rows — read for the strip's public `found_secrets_count` count. */
  playerBudgets: PlayerRow[]
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row — listed in the order the row draws them, which is the order
  //    the game menu lists them too (docs/playarea.md) ──
  /** Ask for a clue. Grayed rather than gone when you can't ask — the glyph is
   *  worth teaching either way. */
  actHint: BoundAction
  /** Mid-game cheat: hand over the answer word for one board word (the amber
   *  bare-eye glyph). Logs to the event log like a hint does. */
  actSpoiler: BoundAction
  /** Ring the three secrets at game-over — or un-ring them. A local display
   *  toggle shared with the menu twin; nothing is written, no peer affected. It
   *  carries its own two faces, so this column places one button either way. */
  actReveal: BoundAction
  /** Hunt the SAME board + secrets again from scratch. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup + roster, a new board + secrets.
   *  Disables itself while the create is in flight, so a slow network reads as
   *  "working" rather than "nothing happened". */
  actNewGame: BoundAction
  /** Drop out of a race; the others keep going. Hidden outside one. */
  actConcede: BoundAction
  /** The whole table stops, with no result. Hidden in a race that doesn't
   *  offer it — so the pair above can be placed unconditionally. */
  actEndGame: BoundAction
  /** Leave for the club page — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** The number of board tiles (setup echo). */

  // ── Turn-history log (GameEventLog) ──
  guesses: EventRow[]
  /** Terminal yet? The log's player picker uses it to distinguish an opponent's
   *  RLS-hidden rows (during play) from a genuinely empty log (at terminal). */
  isTerminal: boolean
  /** The turn currently open in the board viewer, or null. */
  historyId: number | null
  /** Straight through to the log: opening a `#N` hands up the row's id and the
   *  number the log printed beside it. */
  onShowHistory: (id: number, n: number) => void
}) {

  // The exit — error-toned (red), and BOTH are placed: compete's CONCEDE (drop
  // out of the race → psychicnum.concede) and coop's neutral "End" (a mutual
  // "we're done" → end_game) are semantically distinct acts, and each hides
  // itself in the mode that isn't its own. Shared by the "playing" and the "out
  // of guesses / conceded" rows. Icon-only (the canonical action-row
  // treatment): the styled tooltip carries the label and the key.
  // The row's line, and the only thing that varies between states: the verdict
  // once the game is over, a neutral "you are done, they are not" while a race
  // runs on without you, and nothing at all while you can still play.
  const rowMessage: InfoActionsMessage | undefined = terminalMessage
    ? { text: terminalMessage.infoColText, outcome: terminalMessage.outcome }
    : isStillPlaying
      ? undefined
      : { text: myConceded ? 'You conceded' : 'Waiting for others', outcome: 'neutral' }

  return (
    <div className={shared.infoCol}>
      {/* The non-log info column — the shared named readouts, in the canonical order
          (docs/playarea.md → Info-column readouts): STATE → OpponentStrip (compete) →
          ACTIONS → HELP → SETUP disclosure, then the event log below. */}
      <div className={shared.noShrinkRow}>
        {/* State — shown in both play and terminal. The same `<StateLine>` the
            mobile status bar renders above the board (BoardCol), so the two
            copies can't drift. */}
        <p className={shared.infoState}>
          <StateLine
            found={found}
            secretCount={secretCount}
            guessesUsed={guessesUsed}
            totalGuesses={totalGuesses}
          />
        </p>
        {/* Whose-turn line — ONLY for a turn-order game (currentTurnUserId
            non-null). A separate line below the state readout, never replacing
            it. Its presence is fixed at create-time, so it can't reflow. */}
        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Found"
            metricFor={(p) =>
              // A player who's conceded reads as "out" mid-game (they're done,
              // whatever their found count was); everyone else shows progress.
              concededIds.has(p.user_id)
                ? 'out'
                : (playerBudgets.find((b) => b.user_id === p.user_id)?.found_secrets_count ?? 0)
            }
          />
        )}

        {/* ONE row, one order, every action listed once. Which of them is on
            screen right now is each action's own answer — `<ActionButton>` draws
            nothing for an action that says it is hidden — so no branch here can
            disagree with what the menu shows. The game menu lists the same
            bindings in this same order (docs/playarea.md). */}
        <InfoActionsRow message={rowMessage}>
          {/* Hint = a clue (common.words.hint); Spoiler = the answer word
              itself. Both log to the event log, cost nothing — and both wear the
              registry's caution tone (amber); the lightbulb-vs-bare-eye glyph is
              what separates them. The boxed-eye Reveal below is a different
              thing: the whole solution, and only once nobody can still play. */}
          <ActionButton action={actHint} show="icon" />
          <ActionButton action={actSpoiler} show="icon" />
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

        {/* Help — shown ONLY while you can actually act on it: still playing, and
            it is my move (the entry is inert while I wait, so the prompt would
            misdirect; Hint / Reveal / End stay available). It never silently
            swaps text: the "out of guesses, waiting" state is carried loudly by
            the action row above (the terminal look), not by a quietly-changed
            help line. Below the action row, per the InfoCol order. */}
        {isStillPlaying && isMyTurn && <p className={shared.infoHelp}>Click on or type a word and hit submit.</p>}

        {/* Setup — shown in BOTH states, behind a disclosure, LAST before the event log
            (docs/playarea.md → Info-column readouts). Open, it grows (which we
            normally avoid), but it's closable so it reclaims the space. */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

      <GameEventLog
        guesses={guesses}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
