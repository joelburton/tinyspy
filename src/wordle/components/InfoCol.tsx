// cs-unmet

import { cls } from '@/common/utils/cls'
import { TerminalActionRow } from '@/common/terminal/TerminalActionRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { LocalTerminalRow } from '@/common/terminal/LocalTerminalRow'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { useDefinePopover } from '@/common/definitions/useDefinePopover'
import type { TerminalCopy } from '@/common/terminal/terminalCopy'
import type { Member } from '@/common/members/member'
import type { WordlePlayerState, GuessRow } from '../hooks/useGame'
import type { WordleSetup } from '../lib/setup'
import { GameTurnLog } from './GameTurnLog'
import { TurnStatusLine } from '@/common/turn-log/TurnStatusLine'
import shared from '@/common/game-page/PlayArea.module.css'
import styles from './InfoCol.module.css'

/**
 * wordle's info column — near-zero state, an arrangement of the shared scaffold pieces
 * in the fixed order (docs/playarea.md → Info-column readouts): state (guess count) →
 * OpponentStrip (compete) → action row → help → setup disclosure → terminal answer
 * reveal → the turn log. Every COMMAND arrives as a bound action this column
 * places; `onSelectTurn` stays a callback, being coordination rather than a
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
  /** Whose turn it is under turn-order, or null for a free-for-all game.
   *  Non-null ⇒ render the shared TurnStatusLine (a turn game). */
  currentTurnUserId: string | null

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
      <div className={shared.actionSlot}>
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
          <TerminalActionRow over={over}>
            {/* Stay-here options left of the leave option (Club): restart this
                word, see the answer, or spin up the next game. */}
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </TerminalActionRow>
        ) : isLocallyDone ? (
          <LocalTerminalRow label={myConceded ? 'You conceded' : 'Waiting for others'}>
            {/* Reveal keeps its slot while the others race, but inert: the
                answer opens only when the game is over for EVERYONE — the
                target doesn't even reach this client before then
                (wordle._target_for gates on is_terminal) — so a player who
                dropped out can't spoil a live race. Present rather than absent
                so the row doesn't change shape when the last racer finishes;
                the button is simply enabled then. */}
            <ActionButton action={actReveal} show="icon" tooltip="Can't reveal until all end" />
            {endButton}
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {endButton}
            <ActionButton action={actBackToClub} show="icon" />
          </div>
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
              The answer was{' '}
              {/* Pointer-only, deliberately: NOT focusable, no `role="button"`.
                  See common/core-css/utilities.css → `.definable`. */}
              <strong
                className={cls('definable', styles.answerReveal)}
                title="Click to define"
                onClick={(e) => define(solution, e.currentTarget)}
              >
                {solution.toUpperCase()}
              </strong>
            </p>
            {popover}
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
