import { difficultyValue } from '../../common/lib/game/difficulty'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { HintButton } from '../../common/components/buttons/HintButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { PsychicnumSetup } from '../lib/setup'
import type { Player, PlayerRow, GuessRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * psychicnum's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/design-decisions.md → Info column): state readout →
 * OpponentStrip (compete) → action row → help → setup disclosure → turn log. Every
 * mutation is a named callback up (`onHint`/`onReveal`/`onEndGame`/`onConcede`/
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
  onReveal,
  revealing,
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  wordCount,
  guesses,
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

  // ── State readout (secrets found + the guess counter) ──
  found: number
  secretCount: number
  guessesUsed: number
  totalGuesses: number

  // ── Players (the OpponentStrip — compete) ──
  /** The roster (identity + per-player concede flags). */
  players: Player[]
  selfId: string
  /** Per-player budget rows — read for the strip's public `secrets_found` count. */
  playerBudgets: PlayerRow[]
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (Hint / Reveal + End/Concede, back-to-club at terminal) ──
  onHint: () => void
  hinting: boolean
  onReveal: () => void
  revealing: boolean
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: PsychicnumSetup
  /** The number of board tiles (setup echo). */
  wordCount: number

  // ── Turn-history log (GameTurnLog) ──
  guesses: GuessRow[]
  /** The turn currently open in the board viewer (by log position), or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {

  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out of
  // the race → psychicnum.concede); solo / coop use the neutral "End" (a mutual
  // "we're done" → end_game). Two components because they're semantically distinct
  // actions. Shared by the "playing" and the "out of guesses / conceded" action rows.
  const endButton = isCompete ? (
    <ConcedeGameButton onClick={onConcede} className={shared.helperButton} disabled={myConceded} />
  ) : (
    <EndGameButton onClick={onEndGame} className={shared.helperButton} />
  )

  return (
    <div className={shared.infoCol}>
      {/* The non-log info column — the shared named readouts, in the canonical order
          (docs/design-decisions.md → Info column): STATE → OpponentStrip (compete) →
          ACTIONS → HELP → SETUP disclosure, then the turn log below. */}
      <div className={shared.actionSlot}>
        {/* State — shown in both play and terminal. */}
        <p className={shared.infoState}>
          <strong>
            {found}/{secretCount}
          </strong>{' '}
          found ·{' '}
          <strong>
            {guessesUsed}/{totalGuesses}
          </strong>{' '}
          guesses used
        </p>
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
                : (playerBudgets.find((b) => b.user_id === p.user_id)?.secrets_found ?? 0)
            }
          />
        )}

        {/* The action row has three states. TERMINAL (game over): a bold,
            outcome-colored result line + a compact back-to-club button. PLAYING (can
            guess): Hint / Reveal + End/Concede. WAITING (out of guesses OR conceded
            but the game's still going — basically terminal for ME): reuse the terminal
            LOOK (a bold status line + the action on the right) so the state change
            reads loudly, not as a silently-swapped help line. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : canGuess ? (
          <div className={shared.infoActions}>
            {/* Hint = a clue (common.words.hint); Reveal = the answer word. Both log
                to the turn log, cost nothing — and both are warning-toned (amber) via
                the semantic button components. */}
            <HintButton onClick={onHint} disabled={hinting} className={shared.helperButton} />
            <RevealButton onClick={onReveal} disabled={revealing} className={shared.helperButton} />
            {endButton}
          </div>
        ) : (
          <LocalTerminalRow label={myConceded ? 'You conceded' : 'Waiting for others'}>
            {endButton}
          </LocalTerminalRow>
        )}

        {/* Help — shown ONLY while you can actually act on it (canGuess). It never
            silently swaps text: the "out of guesses, waiting" state is carried loudly
            by the action row above (the terminal look), not by a quietly-changed help
            line. Below the action row, per the InfoCol order. */}
        {canGuess && <p className={shared.infoHelp}>Click on or type a word and hit submit.</p>}

        {/* Setup — shown in BOTH states, behind a disclosure, LAST before the turn log
            (docs/design-decisions.md → InfoCol order). Open, it grows (which we
            normally avoid), but it's closable so it reclaims the space. */}
        <SetupDisclosure>
          <li>Tiles: {wordCount}</li>
          <li>Secret words: {secretCount}</li>
          <li>Dictionary: {difficultyValue(setup.difficulty)}</li>
        </SetupDisclosure>
      </div>

      <GameTurnLog
        guesses={guesses}
        players={players}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
