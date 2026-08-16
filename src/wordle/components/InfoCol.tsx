import { cls } from '../../common/lib/util/cls'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import type { SetupRow } from '../../common/lib/game/setupRows'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import type { Member } from '../../common/lib/games'
import type { WordlePlayerState, GuessRow } from '../hooks/useGame'
import type { WordleSetup } from '../lib/setup'
import { GameTurnLog } from './GameTurnLog'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/**
 * wordle's info column — near-zero state, an arrangement of the shared scaffold pieces
 * in the fixed order (docs/playarea.md → Info-column readouts): state (guess count) →
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
  onEndGame,
  onConcede,
  onRestart,
  onRevealAnswer,
  answerShown,
  answerAlreadyShown,
  onNewGame,
  startingNewGame,
  onBackToClub,
  onRequestBackToClub,
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
  onEndGame: () => void
  onConcede: () => void
  /** Restart THIS game — same word — from scratch (the menu's Restart item,
   *  unconfirmed at terminal since there's no progress left to lose). */
  onRestart: () => void
  /** Show the word — or put it away again. A local display toggle, no RPC (see
   *  PlayArea's useSolutionReveal). Rendered only in the terminal row. */
  onRevealAnswer: () => void
  /** Is the word on screen right now? Swaps the button to its Hide face, and
   *  the menu item with it. */
  answerShown: boolean
  /** Is it on screen because this player SOLVED it? Then the control has
   *  nothing to do — it goes inert and says so. */
  answerAlreadyShown: boolean
  /** Start a fresh follow-up game — same setup, new target + id. */
  onNewGame: () => void
  /** New game is mid-flight — disables the button so a slow network reads as
   *  "working", not "nothing happened". Paired with the menu item's own
   *  `disabled`; see useSingleFlight in this game's PlayArea. */
  startingNewGame?: boolean
  /** Direct navigation to the club — terminal only (nothing to lose). */
  onBackToClub: () => void
  /** Mid-game back-to-club: routes through the shell's suspend-confirm flow
   *  (menu.requestBackToClub), NOT direct navigation — leaving a live game
   *  shelves it. */
  onRequestBackToClub: () => void

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

  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out of the
  // race → wordle.concede); coop uses the neutral "End" (a mutual "we're done" →
  // end_game). Shared by the playing and the locally-terminal action rows.
  // Icon-only (the waffle arrangement): the styled tooltip carries the label.
  const endButton = isCompete ? (
    <ConcedeGameButton
      onClick={onConcede}
      iconOnly
      className={shared.helperButton}
      disabled={myConceded}
    />
  ) : (
    <EndGameButton onClick={onEndGame} iconOnly className={shared.helperButton} />
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
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {/* Stay-here options left of the leave option (Club): restart this
                word, see the answer, or spin up the next game. */}
            <RestartButton iconOnly onClick={onRestart} />
            <RevealButton
              iconOnly
              label="Reveal answer"
              revealedLabel="Hide answer"
              revealed={answerShown}
              alreadyShown={answerAlreadyShown}
              onClick={onRevealAnswer}
            />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
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
            <RevealButton iconOnly disabled tooltip="Can't reveal until all end" />
            {endButton}
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {endButton}
            <BackToClubButton iconOnly onClick={onRequestBackToClub} />
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
                  See common/theme.css → `.definable`. */}
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
