import { outcomeVerb, type GamePlayer } from '../../common/lib/games'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { HintButton } from '../../common/components/buttons/HintButton'
import type { SetupRow } from '../../common/lib/game/setupRows'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import type { EventRow } from '../hooks/useGame'
import { Counts } from './Counts'
import { countsFor, hintLabel } from '../lib/readouts'
import { GameTurnLog } from './GameTurnLog'
import { LastSet } from './LastSet'
import shared from '../../common/components/game/PlayArea.module.css'

type Props = {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  /** Compete: I conceded but the others race on — the terminal LOOK. */
  isLocallyDone: boolean
  over: TerminalCopy | null
  currentTurnUserId: string | null
  // ── State ──
  /** Sets taken by the whole table. */
  teamFound: number
  /** Cards still undealt. */
  deckLeft: number
  lastClaim: EventRow | null
  /** Every event — the turn log's rows. */
  events: EventRow[]
  // ── Per-player (compete strip, and the coop terminal breakdown) ──
  players: GamePlayer[]
  selfId: string
  foundByUser: ReadonlyMap<string, number>
  concededIds: Set<string>
  // ── Hint (coop only) ──
  canHint: boolean
  onHint: () => void
  hintsUsed: number
  // ── Turn log ──
  viewingIndex: number | null
  onSelectTurn: (index: number | null) => void
  // ── Actions ──
  onEndGame: () => void
  onConcede: () => void
  onRestart: () => void
  onNewGame: () => void
  startingNewGame?: boolean
  onBackToClub: () => void
  onRequestBackToClub: () => void
  // ── Setup echo ──
  setupRows: SetupRow[]
}

/**
 * setgame's info column, in the canonical order (docs/playarea.md): state
 * readouts, then the turn line, then the opponent strip, then the action row,
 * then the setup recap.
 *
 * **Coop never shows a per-player breakdown** — not mid-game, where individual
 * counts would quietly turn a cooperative game into a visible contest, and not
 * at the terminal either, where a breakdown is PUSHED at the table whether or
 * not anyone wanted the comparison. The log's player filter answers the same
 * question, PULLED by whoever went looking for it.
 *
 * The counts row here is the desktop half of a pair: the mobile status bar above
 * the board renders the same `<Counts>` with a shorter list, because below the
 * breakpoint this whole column is off-canvas in the `<InfoSheet>`.
 */
export function InfoCol({
  isCompete,
  isTerminal,
  isLocallyDone,
  over,
  currentTurnUserId,
  teamFound,
  deckLeft,
  lastClaim,
  events,
  players,
  selfId,
  foundByUser,
  concededIds,
  canHint,
  onHint,
  hintsUsed,
  viewingIndex,
  onSelectTurn,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  onRequestBackToClub,
  setupRows,
}: Props) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* One row of labelled numbers — the same component the mobile status
            bar renders, so the two can't word a count differently. Which counts
            each surface shows is `countsFor`. */}
        <div className={shared.infoState}>
          <Counts items={countsFor('info', { isCompete, teamFound, deckLeft, hintsUsed })} />
        </div>

        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        <LastSet claim={lastClaim} players={players} />

        {/* Compete: everyone's count, live. Unlike most compete strips this
            leaks nothing — the claims all happened face-up, so the number is
            something a player could have counted themselves. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Sets"
            metricFor={(p) => {
              const n = foundByUser.get(p.user_id) ?? 0
              if (!isTerminal) return concededIds.has(p.user_id) ? 'out' : `${n}`
              const member = players.find((m) => m.user_id === p.user_id)
              return `${outcomeVerb(member)} · ${n}`
            }}
          />
        )}

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
            {/* The hint sits with the other game actions rather than on a line
                of its own — it is one of the things you can DO here, not a
                feature that needs its own billing.
                
                RENDERED IN COMPETE TOO, disabled and saying why. Hiding it
                would leave a player hunting for a button they know this game
                has; a disabled one with a reason answers the question before
                it is asked. (The ban itself is the priced-help rule: free
                generative help decides a race.) */}
            <HintButton
              iconOnly
              className={shared.helperButton}
              onClick={onHint}
              disabled={isCompete || !canHint}
              label={hintLabel(isCompete)}
            />
            {isCompete ? (
              <ConcedeGameButton iconOnly className={shared.helperButton} onClick={onConcede} />
            ) : (
              <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
            )}
            <BackToClubButton iconOnly onClick={onRequestBackToClub} />
          </div>
        )}

        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

      {/* The log — LAST, per the canonical info-column order (docs/playarea.md).
          It replaced a per-player breakdown at the terminal: a breakdown is
          PUSHED at the table whether or not anyone wanted the comparison, while
          the log's player filter is PULLED by whoever went looking. Coop should
          not end on a scoreboard nobody asked for. It scrolls inside its own
          box, so a growing log never moves anything above it. */}
      <GameTurnLog
        events={events}
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
