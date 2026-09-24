// cs-met-wordwheel

import { terminalOutcomeVerb } from '@/common/terminal/terminalOutcomeVerb'
import { type GamePlayer } from '@/common/members/member'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { WordList, type WordListRow } from '@/common/word-list/WordList'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import type { WordwheelSetup } from '../lib/setup'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * wordwheel's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts) with two
 * wordwheel picks: the RankBar + Stats are ONE "state" unit and lead (the thing you
 * watch), and there's no help line (the wheel makes the move obvious). Order:
 * state (RankBar + Stats) → OpponentStrip (compete) → action row → setup disclosure →
 * the found-words `<WordList>`. Every command arrives as a bound action this
 * column simply places — what it does, whether it applies right now and which key
 * also fires it are the action's own business. Prop names match the other
 * games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  isCompete,
  isTerminal,
  over,
  isLocallyDone,
  foundWordsScore,
  requiredWordsScore,
  foundWordsCount,
  requiredWordsCount,
  players,
  selfId,
  targetRankIdx,
  selfRankIdx,
  metricByUser,
  concededIds,
  actRestart,
  actNewGame,
  actConcede,
  actEndGame,
  actBackToClub,
  setupRows,
  wordRows,
  hasBonus,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  /** The terminal message when the game is over (the action row's line), else null. */
  over: TerminalMessage | null
  /** I conceded a compete race while the others race on — the action row says so. */
  isLocallyDone: boolean

  // ── State (RankBar + Stats — one unit) ──
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number

  // ── Opponent strip (compete) ──
  /** The roster (identity + per-player concede/result bits terminalOutcomeVerb reads). */
  players: GamePlayer[]
  selfId: string
  /** The compete target rank index, or null (coop / not set). Gates the strip. */
  targetRankIdx: number | null
  /** The caller's own rank index (self reads this so "You" tracks the RankBar). */
  selfRankIdx: number
  /** Each peer's rank index, from the compete leaderboard. */
  metricByUser: ReadonlyMap<string, number>
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row — the same bindings, in the order the menu lists them ──
  /** Restart THIS board — same letters, finds wiped. A button only at terminal. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup, new board + id. A button only
   *  at terminal; disables itself while the create is in flight, so a slow
   *  network reads as "working". */
  actNewGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. It navigates
   *  directly at terminal and routes through the suspend-confirm flow mid-game. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: WordwheelSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]

  // ── Found-words list ──
  wordRows: WordListRow[]
  /** Does this board have a bonus word list? Drops the list's KIND filter when not. */
  hasBonus: boolean
}) {
  // The row's one varying part: the verdict at terminal, a line while a race
  // runs on without you, nothing while you can play.
  const rowMessage: InfoActionsMessage | undefined = over
    ? { text: over.infoColText, outcome: over.outcome }
    : isLocallyDone
      ? { text: 'You conceded', outcome: 'neutral' }
      : undefined

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — RankBar + Stats are one unit (score progress + the figures),
            kept together and leading. */}
        <RankBar score={foundWordsScore} total={requiredWordsScore} targetIdx={targetRankIdx} />
        <Stats
          foundWordsScore={foundWordsScore}
          requiredWordsScore={requiredWordsScore}
          foundWordsCount={foundWordsCount}
          requiredWordsCount={requiredWordsCount}
        />

        {/* Opponent strip (compete) — below the state unit, per the canonical order. */}
        {isCompete && targetRankIdx !== null && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Rank"
            leading={
              <>
                target: <strong>{RANKS[targetRankIdx]}</strong>
              </>
            }
            // Self reads its rank from the local FE computation (selfRankIdx) so "You"
            // updates in lock step with the RankBar above; peers read the leaderboard.
            metricFor={(p, isSelf) => {
              const rankIdx = isSelf ? selfRankIdx : (metricByUser.get(p.user_id) ?? 0)
              const rank = RANKS[rankIdx]
              // Mid-game: a conceder reads as "out". At terminal, prefix the outcome
              // verb so the two "no longer active" states read differently — "Quit at
              // Amazing" vs "Lost at Amazing" vs "Won at Genius".
              if (!isTerminal) return concededIds.has(p.user_id) ? 'out' : rank
              const member = players.find((m) => m.user_id === p.user_id)
              return `${terminalOutcomeVerb(member)} at ${rank}`
            }}
          />
        )}

        {/* ONE row, one order, every action listed once: which of them is on
            screen is each action's own answer, since `<ActionButton>` draws
            nothing for one that says it is hidden. The game menu lists the same
            bindings in the same order (docs/playarea.md). wordwheel has
            nothing to the left of the divider — no hint, no spoiler — so it
            draws none. ICON-ONLY: the styled tooltips carry the labels. */}
        <InfoActionsRow message={rowMessage}>
          <ActionButton action={actRestart} show="icon" />
          <ActionButton action={actNewGame} show="icon" />
          <ActionButton action={actConcede} show="icon" />
          <ActionButton action={actEndGame} show="icon" />
          {/* `weight` is the placement's to choose, not the action's — filled
              at terminal, outline while the game runs (docs/ui.md → Back to
              club). */}
          <ActionButton action={actBackToClub} show="icon" weight={over ? 'primary' : 'secondary'} />
        </InfoActionsRow>

        {/* Setup options — what was picked at create time, behind the shared
            disclosure. Closed by default so it doesn't crowd the status above. */}
        <SetupDisclosure rows={setupRows} />
      </div>

      {/* The required-words answer key ships from game start, so the missed-words
          reveal is gated on terminal — `wordRows` carries them only then, and the
          list holds them one select back behind its WHO filter's Found default. */}
      <WordList
        rows={wordRows}
        players={players}
        selfId={selfId}
        isCompete={isCompete}
        isTerminal={isTerminal}
        hasBonus={hasBonus}
      />
    </div>
  )
}
