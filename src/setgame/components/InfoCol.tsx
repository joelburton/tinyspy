// cs-unmet

import { terminalOutcomeVerb } from '@/common/terminal/terminalOutcomeVerb'
import { type GamePlayer } from '@/common/members/member'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import type { EventRow } from '../hooks/useGame'
import { Counts } from './Counts'
import { countsFor } from '../lib/readouts'
import { GameEventLog } from './GameEventLog'
import { LastSet } from './LastSet'
import shared from '@/common/game-page/playArea.module.css'

type Props = {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  /** Compete: I conceded but the others race on — the terminal LOOK. */
  isLocallyDone: boolean
  /** The terminal message when the game is over (drives the action row), else null. */
  over: TerminalMessage | null
  currentTurnUserId: string | null
  // ── State ──
  /** Sets taken by the whole table. */
  teamFound: number
  /** Cards still undealt. */
  deckLeft: number
  lastClaim: EventRow | null
  /** Every event — the event log's rows. */
  events: EventRow[]
  // ── Per-player (compete strip, and the coop terminal breakdown) ──
  players: GamePlayer[]
  selfId: string
  foundByUser: ReadonlyMap<string, number>
  concededIds: Set<string>
  // ── Hint (coop only) ──
  /** Ask for a hint. The SAME binding the board column's mobile copy places;
   *  it carries its own gray "No hints when competing" face. */
  actHint: BoundAction
  hintsUsed: number
  // ── Event log ──
  historyId: number | null
  onShowHistory: (index: number | null) => void
  // ── Actions ──
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** Deal this board again from scratch. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup, new deal + id. Disables itself
   *  while the create is in flight, so a slow network reads as "working". */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction
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
  actHint,
  hintsUsed,
  historyId,
  onShowHistory,
  actEndGame,
  actConcede,
  actRestart,
  actNewGame,
  actBackToClub,
  setupRows,
}: Props) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* One row of labeled numbers — the same component the mobile status
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
              return `${terminalOutcomeVerb(member)} · ${n}`
            }}
          />
        )}

        {over ? (
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : isLocallyDone ? (
          <InfoActionsRow message={{ text: 'You conceded', outcome: 'neutral' }}>
            {/* Concede disables itself once conceded — the row keeps its shape
                and the button says why it can't be pressed again. */}
            <ActionButton action={actConcede} show="icon" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {/* The hint sits with the other game actions rather than on a line
                of its own — it is one of the things you can DO here, not a
                feature that needs its own billing.
                
                RENDERED IN COMPETE TOO, disabled and saying why. Hiding it
                would leave a player hunting for a button they know this game
                has; a disabled one with a reason answers the question before
                it is asked. (The ban itself is the priced-hint rule: a free
                generative hint decides a race.) */}
            <ActionButton action={actHint} show="icon" />
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actConcede} show="icon" />
            <ActionButton action={actEndGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" />
          </InfoActionsRow>
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
      <GameEventLog
        events={events}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
