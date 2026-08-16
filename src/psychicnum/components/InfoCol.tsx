import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { HintButton } from '../../common/components/buttons/HintButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { SpoilerButton } from '../../common/components/buttons/SpoilerButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import type { SetupRow } from '../../common/lib/game/setupRows'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import type { Player, PlayerRow, GuessRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * psychicnum's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * OpponentStrip (compete) → action row → help → setup disclosure → turn log. Every
 * mutation is a named callback up (`onHint`/`onSpoiler`/`onReveal`/`onEndGame`/`onConcede`/
 * `onSelectTurn`); PlayArea owns the RPCs + coordination. Shared between coop and
 * compete: `isCompete` picks the OpponentStrip + Concede (vs End). Prop names match
 * the other games' columns for the same idea (docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
  isCompete,
  over,
  canGuess,
  myConceded,
  currentTurnUserId,
  found,
  secretCount,
  guessesUsed,
  totalGuesses,
  players,
  selfId,
  playerBudgets,
  concededIds,
  onHint,
  hinting,
  onSpoiler,
  spoiling,
  onReveal,
  secretsShown,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  setupRows,
  guesses,
  isTerminal,
  viewingIndex,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** Terminal copy when the game is over (drives the action row), else null. */
  over: TerminalCopy | null
  /** May I still guess? Gates the play action row + help (vs the locally-done look). */
  canGuess: boolean
  /** I conceded a compete race (a real loss; the others keep racing) — picks the
   *  locally-done status wording. */
  myConceded: boolean
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

  // ── Action row (Hint / Reveal + End/Concede, back-to-club at terminal) ──
  onHint: () => void
  hinting: boolean
  /** Mid-game cheat: hand over the answer word for one board word (the amber
   *  bare-eye SpoilerButton). Logs to the turn log like a hint does. */
  onSpoiler: () => void
  spoiling: boolean
  /** Ring the three secrets at game-over — or un-ring them. A local display
   *  toggle shared with the menu twin; nothing is written, no peer affected. */
  onReveal: () => void
  /** Are the secrets ringed right now? Swaps the button to its Hide face. */
  secretsShown: boolean
  onEndGame: () => void
  onConcede: () => void
  /** Hunt the SAME board + secrets again from scratch (the menu's Restart item;
   *  unconfirmed at terminal since there's no progress left to lose). */
  onRestart: () => void
  /** Start a fresh follow-up game — same setup + roster, a new board + secrets. */
  onNewGame: () => void
  /** New game is mid-flight — disables the button so a slow network reads as
   *  "working", not "nothing happened". Paired with the menu item's own
   *  `disabled`; see useSingleFlight in this game's PlayArea. */
  startingNewGame?: boolean
  onBackToClub: () => void

  // ── Setup disclosure ──
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** The number of board tiles (setup echo). */

  // ── Turn-history log (GameTurnLog) ──
  guesses: GuessRow[]
  /** Terminal yet? The log's player picker uses it to distinguish an opponent's
   *  RLS-hidden rows (during play) from a genuinely empty log (at terminal). */
  isTerminal: boolean
  /** The turn currently open in the board viewer (by log position), or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {

  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out of
  // the race → psychicnum.concede); solo / coop use the neutral "End" (a mutual
  // "we're done" → end_game). Two components because they're semantically distinct
  // actions. Shared by the "playing" and the "out of guesses / conceded" action rows.
  // Icon-only (the canonical action-row treatment): the styled tooltip carries
  // the label.
  const endButton = isCompete ? (
    <ConcedeGameButton iconOnly onClick={onConcede} className={shared.helperButton} disabled={myConceded} />
  ) : (
    <EndGameButton iconOnly onClick={onEndGame} className={shared.helperButton} />
  )

  // Turn-order: is it my turn (or a free-for-all game, pointer null)? Only used
  // to hide the "type a word" help while I'm waiting — the entry is inert then,
  // so the prompt would misdirect. Hint/Reveal/End stay available while waiting.
  const myTurn = currentTurnUserId === null || currentTurnUserId === selfId

  return (
    <div className={shared.infoCol}>
      {/* The non-log info column — the shared named readouts, in the canonical order
          (docs/playarea.md → Info-column readouts): STATE → OpponentStrip (compete) →
          ACTIONS → HELP → SETUP disclosure, then the turn log below. */}
      <div className={shared.actionSlot}>
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
            isTerminal={over !== null}
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

        {/* The action row has three states. TERMINAL (game over): a bold,
            outcome-colored result line + a compact back-to-club button. PLAYING (can
            guess): Hint / Spoiler + End/Concede. WAITING (out of guesses OR conceded
            but the game's still going — basically terminal for ME): reuse the terminal
            LOOK (a bold status line + the action on the right) so the state change
            reads loudly, not as a silently-swapped help line. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {/* Stay-here options left of the leave option (Club): hunt this board
                again, or deal a new one. */}
            {/* Reveal first: it acts on THIS finished board. Restart / New game
                are both "move on", and they leave. */}
            <RevealButton
              iconOnly
              label="Reveal secrets"
              revealedLabel="Hide secrets"
              revealed={secretsShown}
              onClick={onReveal}
            />
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : canGuess ? (
          <div className={shared.infoActions}>
            {/* Hint = a clue (common.words.hint); Spoiler = the answer word
                itself. Both log to the turn log, cost nothing — and both are
                warning-toned (amber) via the semantic button components; the
                lightbulb-vs-bare-eye glyph is what separates them. The boxed-eye
                RevealButton is a different thing entirely (the whole solution,
                terminal only) and never appears in this row. */}
            <HintButton iconOnly onClick={onHint} disabled={hinting} className={shared.helperButton} />
            <SpoilerButton iconOnly onClick={onSpoiler} disabled={spoiling} className={shared.helperButton} />
            {endButton}
          </div>
        ) : (
          <LocalTerminalRow label={myConceded ? 'You conceded' : 'Waiting for others'}>
            {/* Reveal keeps its slot while the others race, but inert: the
                solution opens only when the game is over for EVERYONE
                (common.reveal_solution enforces the same rule server-side), so
                a player who dropped out can't spoil a live race. Present
                rather than absent so the row doesn't change shape when the
                last racer finishes — the button is simply enabled then. */}
            <RevealButton iconOnly disabled tooltip="Can't reveal until all end" />
            {endButton}
          </LocalTerminalRow>
        )}

        {/* Help — shown ONLY while you can actually act on it (canGuess). It never
            silently swaps text: the "out of guesses, waiting" state is carried loudly
            by the action row above (the terminal look), not by a quietly-changed help
            line. Below the action row, per the InfoCol order. */}
        {canGuess && myTurn && <p className={shared.infoHelp}>Click on or type a word and hit submit.</p>}

        {/* Setup — shown in BOTH states, behind a disclosure, LAST before the turn log
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

      <GameTurnLog
        guesses={guesses}
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
