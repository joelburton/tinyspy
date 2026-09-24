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
 * wordwheel's info column — near-zero state, an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column readouts):
 * state (RankBar + Stats) → OpponentStrip (compete) → action row → setup
 * disclosure → the found-words `<WordList>`. There is no help line. Every
 * command arrives as a bound action this column simply places — what it does,
 * whether it applies right now and which key also fires it are the action's
 * own business. Prop names match the other games' columns for the same idea
 * (docs/playarea.md).
 */
export function InfoCol({
  // ── Mode + phase ──
  isCompete,
  isTerminal,
  terminalMessage,
  isLocallyDone,
  // ── State (RankBar + Stats) ──
  foundWordsScore,
  requiredWordsScore,
  foundWordsCount,
  requiredWordsCount,
  // ── Opponent strip (compete) ──
  players,
  selfId,
  targetRankIdx,
  selfRankIdx,
  metricByUser,
  concededIds,
  // ── Action row ──
  actRestart,
  actNewGame,
  actConcede,
  actEndGame,
  actBackToClub,
  // ── Setup disclosure ──
  setupRows,
  // ── Found-words list ──
  wordRows,
  hasBonus,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  // The terminal message when the game is over (the action row's line), else null.
  terminalMessage: TerminalMessage | null
  // I conceded a compete race while the others race on — the action row says so.
  isLocallyDone: boolean

  // ── State (RankBar + Stats — one unit) ──
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number

  // ── Opponent strip (compete) ──
  // The roster (identity + the concede/result bits `terminalOutcomeVerb` reads).
  players: GamePlayer[]
  selfId: string
  // The compete target rank index, or null (coop / not set). Gates the strip.
  targetRankIdx: number | null
  // The caller's own rank index, so "You" tracks the RankBar.
  selfRankIdx: number
  // Each peer's rank index, from the compete leaderboard.
  metricByUser: ReadonlyMap<string, number>
  // Who has conceded — the strip's "out" cell mid-game.
  concededIds: Set<string>

  // ── Action row — the same bindings, in the order the menu lists them ──
  // Restart THIS board — same letters, finds wiped. A button only at terminal.
  actRestart: BoundAction
  // Start a fresh follow-up game — same setup, new board + id. A button only
  // at terminal; disables itself while the create is in flight.
  actNewGame: BoundAction
  // Drop out of a race while the others play on — hidden outside compete.
  actConcede: BoundAction
  // End the game for the whole table — coop's exit; it hides itself in a race.
  actEndGame: BoundAction
  // Leave for the club — the shell's own action, off `ctx.menu`. It navigates
  // directly at terminal and routes through the suspend-confirm flow mid-game.
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: WordwheelSetup
  // The setup recap — the SAME array the PDF prints (lib/setupSummary.ts).
  setupRows: SetupRow[]

  // ── Found-words list ──
  wordRows: WordListRow[]
  // Does this board have a bonus word list? Drops the list's KIND filter when not.
  hasBonus: boolean
}) {
  // The row's one varying part: the verdict at terminal, a line while a race
  // runs on without you, nothing while you can play.
  const rowMessage: InfoActionsMessage | undefined = terminalMessage
    ? { text: terminalMessage.infoColText, outcome: terminalMessage.outcome }
    : isLocallyDone
      ? { text: 'You conceded', outcome: 'neutral' }
      : undefined

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — the RankBar over the figures. */}
        <RankBar score={foundWordsScore} total={requiredWordsScore} targetIdx={targetRankIdx} />
        <Stats
          foundWordsScore={foundWordsScore}
          requiredWordsScore={requiredWordsScore}
          foundWordsCount={foundWordsCount}
          requiredWordsCount={requiredWordsCount}
        />

        {/* Opponent strip (compete). */}
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
            bindings in the same order (docs/playarea.md). Icon-only: the
            tooltips carry the labels. */}
        <InfoActionsRow message={rowMessage}>
          <ActionButton action={actRestart} show="icon" />
          <ActionButton action={actNewGame} show="icon" />
          <ActionButton action={actConcede} show="icon" />
          <ActionButton action={actEndGame} show="icon" />
          {/* `weight` is the placement's to choose, not the action's — filled
              at terminal, outline while the game runs (docs/ui.md → Back to
              club). */}
          <ActionButton action={actBackToClub} show="icon" weight={terminalMessage ? 'primary' : 'secondary'} />
        </InfoActionsRow>

        {/* Setup options, behind the shared disclosure; closed by default. */}
        <SetupDisclosure rows={setupRows} />
      </div>

      {/* The answer key ships from game start, so the missed-words reveal is
          gated on terminal: `wordRows` carries them only then. */}
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
