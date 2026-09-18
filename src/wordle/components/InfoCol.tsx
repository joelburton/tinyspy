// cs-unmet

import { cls } from '@/common/utils/cls'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import type { Member } from '@/common/members/member'
import type { WordlePlayerState, EventRow } from '../hooks/useGame'
import type { WordleSetup } from '../lib/setup'
import { GameEventLog } from './GameEventLog'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/game-page/playArea.module.css'
import styles from './InfoCol.module.css'

/**
 * wordle's info column — near-zero state, an arrangement of the shared scaffold pieces
 * in the fixed order (docs/playarea.md → Info-column readouts): state (guess count) →
 * OpponentStrip (compete) → action row → help → setup disclosure → terminal answer
 * reveal → the event log. Every COMMAND arrives as a bound action this column
 * places; `onShowHistory` stays a callback, being coordination rather than a
 * command. PlayArea owns the RPCs + the history
 * coordination. Prop names match the other games' columns for the same idea (docs/
 * playarea.md).
 */
export function InfoCol({
  // ── Mode + phase ──
  isCompete,
  isTerminal,
  over,
  isLocallyDone,
  myConceded,
  isPlayer,
  currentTurnUserId,
  // ── State (guess count) ──
  guessesUsed,
  maxGuesses,
  // ── Opponent strip (compete) ──
  players,
  selfId,
  playerStates,
  concededIds,
  // ── Action row ──
  actEndGame,
  actConcede,
  actRestart,
  actReveal,
  actNewGame,
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
  /** The terminal message when the game is over (drives the action row), else null. */
  over: TerminalMessage | null
  /** I'm done in a compete race (solved / out / conceded) while the others race on —
   *  the terminal LOOK without revealing the answer. */
  isLocallyDone: boolean
  /** I specifically conceded (vs. ran out) — picks the locally-done wording. */
  myConceded: boolean
  /** Am I a player in this game? (Else the "watching" notice.) */
  isPlayer: boolean
  /** Whose turn it is under turn-order, or null for a free-for-all game.
   *  Non-null ⇒ render the shared TurnStatusLine (a turn game). */
  currentTurnUserId: string | null

  // ── State ──
  guessesUsed: number
  maxGuesses: number

  // ── Opponent strip (compete) ──
  /** The common roster (identity + concede bits) — the strip + the event-log picker. */
  players: Member[]
  selfId: string
  /** Per-player wordle state — the strip reads each peer's `guesses_used`. */
  playerStates: WordlePlayerState[]
  /** Who has conceded (drives the strip's "out" cell). */
  concededIds: Set<string>

  // ── Action row (ICON-ONLY buttons — the waffle arrangement; tooltips
  //    carry the labels. Playing: End/Concede + back-to-club. Terminal:
  //    Restart + Reveal + New game + back-to-club.) ──
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete, and
   *  gray once you have SOLVED it (conceding would forfeit a banked win). */
  actConcede: BoundAction
  /** Restart THIS game — same word — from scratch. */
  actRestart: BoundAction
  /** Show the word — or put it away again. A local display toggle, no RPC (see
   *  PlayArea's useSolutionReveal); it carries its own faces, the inert
   *  "solution already shown" included. */
  actReveal: BoundAction
  /** Start a fresh follow-up game — same setup, new target + id. Disables itself
   *  while the create is in flight. */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. ONE binding
   *  for both rows: it navigates directly at terminal and routes through the
   *  suspend-confirm flow mid-game. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: WordleSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]

  // ── Terminal answer reveal ──
  /** The answer to DISPLAY, or null while it stays hidden — which is the
   *  default at every terminal, win included: nothing shows until this viewer
   *  presses Reveal, and pressing Hide takes it away again. Prop is `solution`
   *  (the glossary term for the terminal-reveal slot, matching
   *  waffle/stackdown); the value comes from the DB-blessed `game.target`. */
  solution: string | null

  // ── Event log ──
  /** The RAW guesses (not the viewer's own) — the log's dropdown switches whose show. */
  guesses: EventRow[]
  mode: 'coop' | 'compete'
  /** The open turn (by log position), or null when live. */
  historyId: number | null
  /** Open a turn on the board viewer (click its `#N`). */
  onShowHistory: (index: number) => void
}) {
  // Both exits, error-toned (red), placed together and each hiding itself in the
  // mode that isn't its own: compete CONCEDES (drop out of the race →
  // wordle.concede), coop ENDS (a mutual "we're done" → end_game). Shared by the
  // playing and the locally-terminal action rows. Icon-only (the waffle
  // arrangement): the styled tooltip carries the label.
  const endButton = (
    <>
      <ActionButton action={actConcede} show="icon" />
      <ActionButton action={actEndGame} show="icon" />
    </>
  )

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
        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
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
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            {/* Stay-here options left of the leave option (Club): restart this
                word, see the answer, or spin up the next game. */}
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : isLocallyDone ? (
          <InfoActionsRow message={{ text: myConceded ? 'You conceded' : 'Waiting for others', outcome: 'neutral' }}>
            {/* Reveal keeps its slot while the others race, but inert: the
                answer opens only when the game is over for EVERYONE — the
                target doesn't even reach this client before then
                (wordle._target_for gates on is_terminal) — so a player who
                dropped out can't spoil a live race. Present rather than absent
                so the row doesn't change shape when the last racer finishes;
                the button is simply enabled then. */}
            <ActionButton action={actReveal} show="icon" />
            {endButton}
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {endButton}
            <ActionButton action={actBackToClub} show="icon" />
          </InfoActionsRow>
        )}

        {/* Help — only while you can act (never a silent swap; the locally-done state is
            carried loudly by the action row above). */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
        )}

        {/* Terminal-only answer reveal — an info-column region allowed to grow when
            the viewer opens it and to give the space back when they close it again
            (a blessed exception to docs/ui.md → Layout stability: the reflow IS the
            reveal, and it only ever happens at the viewer's own click). ABOVE the
            setup disclosure per the canonical order (the reveal is the payoff; the
            recap is bookkeeping).
            The ONLY place the word shows: the below-board terminal pill carries the
            verdict alone (a one-line, ellipsising row), so the answer lives here
            where it has room to be a sentence and a click-to-define target. */}
        {over && solution && (
          <div className={shared.terminalExtra}>
            <p className={cls(shared.infoState, styles.answerLine)}>
              The answer was <DefinableWord word={solution} className={styles.answerReveal} />
            </p>
          </div>
        )}

        {/* Setup — last, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
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
