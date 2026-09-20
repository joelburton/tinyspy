// cs-unmet

import { terminalOutcomeVerb } from '@/common/terminal/terminalOutcomeVerb'
import { type GamePlayer } from '@/common/members/member'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
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
  actEndGame,
  actConcede,
  actRestart,
  actNewGame,
  actBackToClub,
  setupRows,
  wordRows,
  reveal,
  hasBonus,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  /** The terminal message when the game is over (drives the action row), else null. */
  over: TerminalMessage | null
  /** I conceded a compete race — the terminal LOOK while the others race on. */
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

  // ── Action row (ICON-ONLY buttons — the waffle arrangement; tooltips
  //    carry the labels. Playing: End/Concede + back-to-club. Terminal:
  //    Restart + New game + back-to-club.) ──
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** Restart THIS board — same letters, finds wiped. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup, new board + id. Disables itself
   *  while the create is in flight, so a slow network reads as "working". */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. ONE binding
   *  for both rows: it navigates directly at terminal and routes through the
   *  suspend-confirm flow mid-game. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: WordwheelSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]

  // ── Found-words list ──
  wordRows: WordListRow[]
  /** True once the terminal missed-words reveal is folded into `wordRows`. */
  reveal: boolean
  /** Does this board have a bonus word list? Drops the list's KIND filter when not. */
  hasBonus: boolean
}) {
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

        {/* Action row — ICON-ONLY (the waffle arrangement; the styled tooltips
            carry the labels). TERMINAL: the bold outcome line + Restart /
            New game / back-to-club (primary). CONCEDED (the others race on):
            the terminal LOOK — a status line + the now-disabled Concede.
            PLAYING: End/Concede + back-to-club (via the suspend-confirm flow). */}
        {over ? (
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            {/* Stay-here options left of the leave option (Club): run this
                board back, or spin up the next one. */}
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
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actConcede} show="icon" />
            <ActionButton action={actEndGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" />
          </InfoActionsRow>
        )}

        {/* Setup options — what was picked at create time, behind the shared
            disclosure. Closed by default so it doesn't crowd the status above. */}
        <SetupDisclosure rows={setupRows} />
      </div>

      {/* The required-words answer key ships from game start, so the missed-words
          reveal is gated on terminal: during play only found rows show; at terminal
          the unfound required words are revealed (bonus words are never revealed). */}
      <WordList
        rows={wordRows}
        players={players}
        reveal={reveal}
        selfId={selfId}
        isCompete={isCompete}
        isTerminal={isTerminal}
        hasBonus={hasBonus}
      />
    </div>
  )
}
