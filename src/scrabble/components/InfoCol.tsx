import { cls } from '../../common/lib/util/cls'
import { playerOutcome, type Member, type GamePlayer } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { colorVarFor } from '../../common/lib/color/memberColor'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { DIFFICULTY_LABELS } from '../../common/lib/game/difficulty'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { ScrabbleSetup } from '../lib/setup'
import type { PlayerRow, PlayRow } from '../hooks/useGame'
import { PlayLog } from './PlayLog'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * scrabble's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/design-decisions.md → Info column): turn/score
 * readout → OpponentStrip → action row → help → setup disclosure → Moves log. Every
 * mutation is a named callback up (`onEndGame`/`onConcede`/`onSelectTurn`); PlayArea
 * owns the RPCs + coordination. Prop names match the other games' columns for the
 * same idea (docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
  isCompete,
  myTurn,
  over,
  myConceded,
  isTerminal,
  currentMember,
  teamScore,
  bagCount,
  members,
  selfId,
  playerStates,
  concededIds,
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  plays,
  viewingSeq,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** Whose turn it is is mine (compete); always true in coop. */
  myTurn: boolean
  /** Terminal copy when the game is over (drives the action row + modal), else null. */
  over: TerminalCopy | null
  /** I conceded (compete) — drives the "You conceded" terminal look. */
  myConceded: boolean
  isTerminal: boolean

  // ── State readout (turn / team score + the bag) ──
  /** The player whose turn it is (compete) — its color + name drive the "Turn: ● name"
   *  line; undefined in coop / when unknown. */
  currentMember: Member | undefined
  /** The coop team score (null in compete). */
  teamScore: number | null
  bagCount: number

  // ── Players (the OpponentStrip) ──
  /** The roster (GamePlayer — carries the concede/result bits playerOutcome reads). */
  members: GamePlayer[]
  selfId: string
  playerStates: PlayerRow[]
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: ScrabbleSetup

  // ── Turn-history log (Moves) ──
  plays: PlayRow[]
  /** The play currently open in the board viewer (by seq), or null. */
  viewingSeq: number | null
  onSelectTurn: (seq: number) => void
}) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* InfoCol order is FIXED (docs/design-decisions.md → Info column):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — whose turn (compete) / team score (coop) + the bag count. The
            other player's turn reads "Turn: ● name" (a leading color disc + the bare
            name) — never the possessive "name's turn" (we don't apostrophize usernames). */}
        <p className={shared.infoState}>
          {isCompete ? (
            myTurn ? (
              <strong>Your turn</strong>
            ) : (
              <>
                Turn:{' '}
                <span style={{ color: colorVarFor(currentMember?.color) }} aria-hidden>
                  ●
                </span>{' '}
                {currentMember?.username ?? 'someone'}
              </>
            )
          ) : (
            <>
              Team score: <strong>{teamScore ?? 0}</strong>
            </>
          )}
          {' · '}
          {bagCount} in bag
        </p>

        {/* Opponent strip (compete) — each peer's score, identity on a leading disc.
            Scores aren't hidden (the board reveals them). */}
        {isCompete && (
          <OpponentStrip
            players={members}
            selfId={selfId}
            metricLabel="Score"
            metricFor={(player) => {
              const ps = playerStates.find((p) => p.user_id === player.user_id)
              const score = ps?.score ?? 0
              // Mid-game a conceder reads as "out"; at terminal the score line is
              // prefixed with the outcome verb (Quit / Lost / Won). The strip types
              // `player` as Member, so read the concede/result bits back off `members`.
              if (!isTerminal) return concededIds.has(player.user_id) ? 'out' : score
              const gpm = members.find((m) => m.user_id === player.user_id)
              const outcome = gpm ? playerOutcome(gpm) : 'lost'
              const verb = outcome === 'won' ? 'Won' : outcome === 'quit' ? 'Quit' : 'Lost'
              return `${verb} · ${score}`
            }}
          />
        )}

        {/* Action row — End (coop) / Concede (compete) during play; the "You
            conceded" terminal look once I've dropped out (others race on); at
            terminal the bold outcome line + a compact back-to-club button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : isCompete && myConceded ? (
          <div className={cls(shared.infoActions, shared.terminalActions)}>
            <span className={cls(shared.outcome, shared.outcome_neutral)}>You conceded</span>
            <ConcedeGameButton className={shared.helperButton} disabled />
          </div>
        ) : (
          <div className={shared.infoActions}>
            {isCompete ? (
              <ConcedeGameButton className={shared.helperButton} onClick={onConcede} />
            ) : (
              <EndGameButton className={shared.helperButton} onClick={onEndGame} />
            )}
          </div>
        )}

        {/* Help — only while the player can act on it (never silently swapped). */}
        {!over && (
          <p className={shared.infoHelp}>
            Drag tiles onto the board, or tap a square and type. Arrows move the cursor (a sideways
            arrow turns it ↓). Enter plays.
          </p>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>2-letter words: {DIFFICULTY_LABELS[setup.dict_2 - 1] ?? '—'}</li>
          <li>Longer words: {DIFFICULTY_LABELS[setup.dict_3plus - 1] ?? '—'}</li>
          <li>{timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      <PlayLog plays={plays} players={members} viewingSeq={viewingSeq} onSelectTurn={onSelectTurn} />
    </div>
  )
}
