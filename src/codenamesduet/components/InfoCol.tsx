import { colorVarFor } from '../../common/lib/color/memberColor'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { CodenamesduetSetup } from '../lib/setup'
import type { ClueRow } from '../hooks/useClues'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/**
 * codenamesduet's info column — near-zero state, an arrangement of the shared
 * scaffold pieces in the fixed order (docs/design-decisions.md → Info column):
 * agent/turn state readout → finished-player banners → action row → help → setup
 * disclosure → turn log. codenamesduet has NO opponent strip (peer status rides the
 * GamePage header pill) and its finished-player banners sit right under the state
 * line they explain. Every mutation is a named callback up (`onEndGame` /
 * `onSelectTurn`); PlayArea owns the RPCs + coordination. Prop names match the other
 * games' columns for the same idea (see docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
  over,
  inSuddenDeath,
  greenFound,
  turnNumber,
  viewerFinished,
  peerFinished,
  peer,
  onEndGame,
  onBackToClub,
  setup,
  firstClueGiver,
  clues,
  guesses,
  players,
  gameOver,
  viewingSeq,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  /** Terminal copy when the game is over (drives the action row), else null. */
  over: TerminalCopy | null
  /** Turn budget spent — the state line reads "sudden death" and the help swaps to
   *  the sudden-death rules. */
  inSuddenDeath: boolean

  // ── State readout (agents found + the turn counter) ──
  /** Green agents contacted, out of 15. */
  greenFound: number
  /** The current turn number (`games.turn_number`); paired with `setup.turns`. */
  turnNumber: number

  // ── Finished-player banners (Duet's finished-seat hand-off, shown to BOTH) ──
  /** I've found all my agents → my partner gives every remaining clue. */
  viewerFinished: boolean
  /** My partner has found all theirs → I give every remaining clue now. */
  peerFinished: boolean
  /** The other seated player — names the clue-giver in the banners. */
  peer: Player | undefined

  // ── Action row (End during play; back-to-club at terminal) ──
  onEndGame: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: CodenamesduetSetup
  /** The player seated as the first clue-giver (setup echo). */
  firstClueGiver: Player | undefined

  // ── Turn-history log (GameTurnLog) ──
  clues: ClueRow[]
  guesses: GuessRow[]
  players: Player[]
  gameOver: boolean
  /** The turn currently open in the board viewer (by turn_number), or null. */
  viewingSeq: number | null
  onSelectTurn: (turnNumber: number) => void
}) {
  return (
    <div className={shared.infoCol}>
      {/* Info-column readouts in the shared canonical order (docs/design-decisions.md
          → Info column): STATE → [no opponent strip — peer status rides the header
          pill] → ACTIONS → HELP → SETUP disclosure, then the turn log below.
          codenamesduet's finished-player banners are a loud live-state announcement,
          so they sit right under the state line. */}
      <div className={shared.actionSlot}>
        <p className={shared.infoState}>
          <strong>{greenFound}</strong>/15 agents ·{' '}
          {inSuddenDeath ? (
            'sudden death'
          ) : (
            <>
              <strong>{turnNumber}</strong>/{setup.turns} turns
            </>
          )}
        </p>

        {/* Duet's finished-player rule, surfaced to BOTH players so neither reads the
            lopsided turn flow as a bug — a prominent colored banner right under the
            live state it explains. */}
        {viewerFinished && (
          <div className={styles.finishedNote}>
            All your agents have been found! From here{' '}
            {peer ? (
              <strong style={{ color: colorVarFor(peer.color) }}>{peer.username}</strong>
            ) : (
              'your partner'
            )}{' '}
            gives every remaining clue — keep guessing to find theirs.
          </div>
        )}
        {peerFinished && (
          <div className={styles.peerDoneNote}>
            {peer ? (
              <strong style={{ color: colorVarFor(peer.color) }}>{peer.username}</strong>
            ) : (
              'Your partner'
            )}{' '}
            has found all their agents — you give every remaining clue now, and they do
            the guessing.
          </div>
        )}

        {/* Action row. Playing: End. Terminal: the bold, outcome-colored result line +
            a compact back-to-club button (the shared swap). */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : (
          <div className={shared.infoActions}>
            {/* Manual "we're done" stop — the shared EndGameButton (flag + error/red
                tone, the canonical "End" label). codenamesduet is coop, so End (a
                mutual stop), not Concede. It reads distinctly from this game's "Pass &
                end turn" below the board (a different component + glyph), so it keeps
                the same plain "End" as every other v3 game. */}
            <EndGameButton onClick={onEndGame} className={shared.helperButton} />
          </div>
        )}

        {/* Help — a stable orienting line during play (the per-phase guidance lives
            below the board + in the header pill). In sudden death it switches to the
            sudden-death rules; the help is muted and easily skimmed-past as
            "unchanged", so it leads with a RED "SUDDEN DEATH:" tag to flag that it's
            different now. */}
        {!over && (
          <p className={shared.infoHelp}>
            {inSuddenDeath ? (
              <>
                <strong className={styles.suddenDeathTag}>SUDDEN DEATH:</strong> no clues
                left — every reveal must be an agent. One non-green guess (a bystander or
                the assassin) ends the game.
              </>
            ) : (
              'Give clues for your agents; guess the clues your partner gives you.'
            )}
          </p>
        )}

        {/* Setup — a disclosure, LAST before the turn log (closed by default so it
            doesn't claim space; opening it grows the slot, the one allowed exception
            since it's closable). */}
        <SetupDisclosure>
          <li>Turns: {setup.turns}</li>
          <li>First clue: {firstClueGiver?.username ?? '—'}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      <GameTurnLog
        clues={clues}
        guesses={guesses}
        players={players}
        currentTurn={turnNumber}
        gameOver={gameOver}
        viewingSeq={viewingSeq}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
