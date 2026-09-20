// cs-unmet

import { DotActor } from '@/common/members/ActorMention'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { CodenamesduetSetup } from '../lib/setup'
import type { ClueRow } from '../hooks/useClues'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * codenamesduet's info column — near-zero state, an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column readouts):
 * agent/turn state readout → finished-player banners → action row → help → setup
 * disclosure → event log. codenamesduet has NO opponent strip (peer status rides the
 * GamePage header pill) and its finished-player banners sit right under the state
 * line they explain. Every command arrives as a bound action this column places; the
 * one callback up is `onShowHistory`. PlayArea owns the RPCs + coordination. Prop names match the other
 * games' columns for the same idea (see docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  over,
  inSuddenDeath,
  greenFound,
  turnNumber,
  viewerFinished,
  peerFinished,
  peer,
  actEndGame,
  actConcede,
  actRestart,
  actReveal,
  actNewGame,
  actBackToClub,
  setup,
  setupRows,
  clues,
  guesses,
  players,
  selfId,
  gameOver,
  historyId,
  onShowHistory,
}: {
  // ── Mode + phase ──
  /** The terminal message when the game is over (drives the action row), else null. */
  over: TerminalMessage | null
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
  /** End the game for the whole table — the mutual "we're done". */
  actEndGame: BoundAction
  /** Placed for symmetry with every other game's row and never drawn here: duet
   *  is coop, so this hides itself. */
  actConcede: BoundAction
  /** Run this board back — same words, same key cards (a mulligan). */
  actRestart: BoundAction
  /** Open the partner's key card at game-over — or cover it up again. A local
   *  display toggle carrying its own two faces: nothing is written, and the
   *  partner's own card stays covered until THEY ask. */
  actReveal: BoundAction
  /** Start a fresh follow-up game — same setup + roster, a newly sampled board.
   *  Disables itself while the create is in flight. */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: CodenamesduetSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** The player seated as the first clue-giver (setup echo). */
  firstClueGiver: Player | undefined

  // ── Turn-history log (GameEventLog) ──
  clues: ClueRow[]
  guesses: GuessRow[]
  players: Player[]
  /** The viewer — the log's player picker orders them first. */
  selfId: string
  gameOver: boolean
  /** The turn currently open in the board viewer (by turn_number), or null. */
  historyId: number | null
  /** Straight through to the log. A duet turn is addressed by its `turn_number`,
   *  which is also the `#N` the log prints, so both arguments are that number. */
  onShowHistory: (turnNumber: number, n: number) => void
}) {
  return (
    <div className={shared.infoCol}>
      {/* Info-column readouts in the shared canonical order (docs/playarea.md
          → Info-column readouts): STATE → [no opponent strip — peer status rides the header
          pill] → ACTIONS → HELP → SETUP disclosure, then the event log below.
          codenamesduet's finished-player banners are a loud live-state announcement,
          so they sit right under the state line. */}
      <div className={shared.noShrinkRow}>
        {/* The same `<StateLine>` the mobile status bar renders above the board
            (BoardCol) — one component so the two copies can't drift. */}
        <p className={shared.infoState}>
          <StateLine
            greenFound={greenFound}
            turnNumber={turnNumber}
            turns={setup.turns}
            inSuddenDeath={inSuddenDeath}
          />
        </p>

        {/* Duet's finished-player rule, surfaced to BOTH players so neither reads the
            lopsided turn flow as a bug — a prominent colored banner right under the
            live state it explains. */}
        {viewerFinished && (
          <div className={styles.finishedNote}>
            All your agents have been found! From here{' '}
            {/* `show="both"` on both banners: they are sentences, and a phone
                dropping the name would leave "From here ● gives every…". */}
            {peer ? <DotActor actor={peer} show="both" /> : 'your partner'}{' '}
            gives every remaining clue — keep guessing to find theirs.
          </div>
        )}
        {peerFinished && (
          <div className={styles.peerDoneNote}>
            {peer ? <DotActor actor={peer} show="both" /> : 'Your partner'}{' '}
            has found all their agents — you give every remaining clue now, and they do
            the guessing.
          </div>
        )}

        {/* Action row. Playing: End. Terminal: the bold, outcome-colored result line +
            a compact back-to-club button (the shared swap). */}
        {over ? (
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            {/* Stay-here options, left of the leave option (Club): open the
                partner's key card (the post-mortem, once you've talked through
                what you'd have played next), run the same board back, or deal a
                fresh one. */}
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {/* Manual "we're done" stop — flag + error/red tone, the canonical
                "End game" label. Both exits are placed, as in every other game's
                row; duet is coop, so Concede hides itself and only End is drawn.
                It reads distinctly from this game's "Pass & end turn" below the
                board (a different glyph), so it keeps the same wording as every
                other v3 game. */}
            <ActionButton action={actConcede} show="icon" />
            <ActionButton action={actEndGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" />
          </InfoActionsRow>
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

        {/* Setup — a disclosure, LAST before the event log (closed by default so it
            doesn't claim space; opening it grows the slot, the one allowed exception
            since it's closable). */}
        <SetupDisclosure rows={setupRows} />
      </div>

      <GameEventLog
        clues={clues}
        guesses={guesses}
        players={players}
        selfId={selfId}
        currentTurn={turnNumber}
        gameOver={gameOver}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
