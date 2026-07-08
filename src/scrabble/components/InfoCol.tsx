import { outcomeVerb, type Member, type GamePlayer } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { Dot } from '../../common/components/text/Dot'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { AIButton } from '../../common/components/buttons/AIButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { ScrabbleSetup } from '../lib/setup'
import type { RankedMove } from '../lib/rank'
import type { PlayerRow, PlayRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/** The AI suggest-a-move box's state (owned by PlayArea, rendered here —
 *  the LocalFeedbackMsg convention). `idle` still renders the box: its
 *  height is reserved whether or not there's anything to show. `ready`
 *  remembers the board `version` the moves were computed against, so
 *  PlayArea can derive staleness at render (a teammate may have played). */
export type SuggestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; moves: RankedMove[]; version: number }
  | { status: 'error'; message: string }

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
  players,
  selfId,
  playerStates,
  concededIds,
  onEndGame,
  onConcede,
  onBackToClub,
  suggest,
  canSuggest,
  onSuggest,
  onApplySuggestion,
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
  players: GamePlayer[]
  selfId: string
  playerStates: PlayerRow[]
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Suggest-a-move (docs/scrabble-ai.md S5) ──
  /** The suggest box's state, or null to not render it at all (compete — the
   *  mode never changes mid-game, so its absence is not a reflow). */
  suggest: SuggestState | null
  /** May ask right now (playing, seated, not over) — gates the button only;
   *  the box itself stays mounted at its reserved height. */
  canSuggest: boolean
  onSuggest: () => void
  /** Stage a suggested move's tiles on the board (BoardCol applies it). */
  onApplySuggestion: (move: RankedMove) => void

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
                <Dot color={currentMember?.color} />{' '}
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
            players={players}
            selfId={selfId}
            metricLabel="Score"
            metricFor={(player) => {
              const ps = playerStates.find((p) => p.user_id === player.user_id)
              const score = ps?.score ?? 0
              // Mid-game a conceder reads as "out"; at terminal the score line is
              // prefixed with the outcome verb (Quit / Lost / Won). The strip types
              // `player` as Member, so read the concede/result bits back off `players`.
              if (!isTerminal) return concededIds.has(player.user_id) ? 'out' : score
              const gpm = players.find((m) => m.user_id === player.user_id)
              return `${outcomeVerb(gpm)} · ${score}`
            }}
          />
        )}

        {/* Action row — End (coop) / Concede (compete) during play; the "You
            conceded" terminal look once I've dropped out (others race on); at
            terminal the bold outcome line + a compact back-to-club button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : isCompete && myConceded ? (
          <LocalTerminalRow label="You conceded">
            <ConcedeGameButton className={shared.helperButton} disabled />
          </LocalTerminalRow>
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

        {/* Suggest-a-move (coop): the AI button + the top-5 list. The box is a
            FIXED height in every state (idle / loading / results / error) so a
            suggestion arriving never shifts the sections below — see the module
            css. Clicking a row stages that move's tiles on the board for review;
            the suggester never submits. */}
        {suggest && (
          <div className={styles.suggestBox} data-zone="suggest">
            <div className={shared.infoActions}>
              <AIButton
                label="Suggest"
                className={shared.helperButton}
                disabled={!canSuggest || suggest.status === 'loading'}
                onClick={onSuggest}
              />
            </div>
            <div className={styles.suggestBody}>
              {suggest.status === 'loading' && <p>Thinking…</p>}
              {suggest.status === 'error' && <p className={styles.suggestError}>{suggest.message}</p>}
              {suggest.status === 'ready' && suggest.moves.length === 0 && (
                <p>No legal moves — swap tiles?</p>
              )}
              {suggest.status === 'ready' &&
                suggest.moves.map((move, i) => (
                  <button
                    key={i}
                    type="button"
                    className={styles.suggestRow}
                    onClick={() => onApplySuggestion(move)}
                    title="Stage these tiles on the board"
                  >
                    <span className={styles.suggestWords}>
                      {move.words.map((w) => w.word).join(', ')}
                    </span>
                    <span className={styles.suggestScore}>+{move.score}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>Dictionary (2-letter): {difficultyValue(setup.dict_2)}</li>
          <li>Dictionary (longer): {difficultyValue(setup.dict_3plus)}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      <GameTurnLog plays={plays} players={players} viewingSeq={viewingSeq} onSelectTurn={onSelectTurn} />
    </div>
  )
}
