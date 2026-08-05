import type { ReactNode } from 'react'
import type { GamePlayer } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { BOARD_SIZE } from '../lib/board'
import { GameTurnLog } from './GameTurnLog'
import type { EventRow } from '../hooks/useGame'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

/**
 * letterboxed's info column. Readouts in the canonical order
 * (docs/playarea.md): state → turn → opponents → actions, then the chain and
 * the log below the action slot.
 *
 * The state block is the whole game in two fractions — letters covered out of
 * twelve, words used out of the cap — so a glance answers "how are we doing?".
 * The chain follows, rendered in full: unlike a turn log it is at most six
 * words, so there is no reason to make anyone reconstruct it from the history.
 */
export function InfoCol({
  over,
  isTerminal,
  isLocallyDone,
  isTurnGame,
  currentTurnUserId,
  chain,
  maxWords,
  lettersCovered,
  solution,
  solutionRevealed,
  events,
  players,
  selfId,
  isCompete,
  wordsByUser,
  coveredByUser,
  concededIds,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  onRequestBackToClub,
}: {
  over: (TerminalCopy & { verdictNode?: ReactNode }) | null
  isTerminal: boolean
  isLocallyDone: boolean
  /** Turn-by-turn co-op. Fixed at create time, so the turn line's presence
   *  never changes mid-game and can't reflow the column. */
  isTurnGame: boolean
  currentTurnUserId: string | null
  chain: string[]
  maxWords: number
  lettersCovered: number
  solution: string[]
  solutionRevealed: boolean
  events: EventRow[]
  players: GamePlayer[]
  selfId: string
  isCompete: boolean
  wordsByUser: Map<string, number>
  coveredByUser: Map<string, number>
  concededIds: Set<string>
  onEndGame: () => void
  onConcede: () => void
  onRestart: () => void
  onNewGame: () => void
  startingNewGame: boolean
  onBackToClub: () => void
  onRequestBackToClub: () => void
}) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* The two fractions the whole game reduces to. */}
        <div className={styles.stats}>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Letters</span>
            <span className={styles.statValue}>
              {lettersCovered}
              <span className={styles.statOf}>/{BOARD_SIZE}</span>
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Words</span>
            <span className={styles.statValue}>
              {chain.length}
              <span className={styles.statOf}>/{maxWords}</span>
            </span>
          </div>
        </div>

        {/* Whose-turn line — only in a turn-order game. Rendering it in a
            free-for-all game would print "Waiting for someone…" forever,
            since the pointer is null there. */}
        {isTurnGame && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        {/* Compete: the two numbers a race may publish. Never the words. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Covered"
            metricFor={(p) =>
              concededIds.has(p.user_id)
                ? 'out'
                : `${coveredByUser.get(p.user_id) ?? 0}/${BOARD_SIZE} · ${wordsByUser.get(p.user_id) ?? 0}w`
            }
          />
        )}

        {/* Action row — ICON-ONLY. TERMINAL: outcome line + Restart / New game
            / Club. CONCEDED (others race on): the terminal look + a disabled
            Concede. PLAYING: End (coop) / Concede (compete) + back-to-club. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : isLocallyDone ? (
          <LocalTerminalRow label="You conceded">
            <ConcedeGameButton iconOnly className={shared.helperButton} disabled />
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {isCompete ? (
              <ConcedeGameButton iconOnly className={shared.helperButton} onClick={onConcede} />
            ) : (
              <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
            )}
            <BackToClubButton iconOnly onClick={onRequestBackToClub} />
          </div>
        )}
      </div>

      {/* The chain IS the state, and it is short — show it whole. */}
      <div className={styles.chainBlock}>
        <div className={styles.blockTitle}>Chain</div>
        <ol className={styles.chain}>
          {chain.map((w, i) => (
            <li key={`${w}-${i}`} className={styles.chainWord}>
              {w.toUpperCase()}
            </li>
          ))}
          {chain.length === 0 && <li className={styles.chainEmpty}>No words yet</li>}
        </ol>
      </div>

      {/* The seeded pair, at terminal only. It ships from game start (the
          board's own word list would give a solution away anyway), so this is
          a display choice, not a security boundary. */}
      {solutionRevealed && solution.length > 0 && (
        <div className={styles.chainBlock}>
          <div className={styles.blockTitle}>Solvable in two</div>
          <div className={styles.solution}>
            {solution.map((w) => w.toUpperCase()).join(' → ')}
          </div>
        </div>
      )}

      <GameTurnLog events={events} players={players} selfId={selfId} />
    </div>
  )
}
