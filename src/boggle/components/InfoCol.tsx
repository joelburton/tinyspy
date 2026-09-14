// cs-unmet

import { terminalOutcomeVerb } from '@/common/terminal/terminalOutcomeVerb'
import { type GamePlayer } from '@/common/members/member'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow } from '@/common/game-page/InfoActionsRow'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { WordList, type WordListRow } from '@/common/word-list/WordList'
import { Stats, type BoggleStats } from './Stats'
import type { BoggleSetup } from '../lib/setup'
import shared from '@/common/game-page/playArea.module.css'

/**
 * boggle's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): word/score
 * readout → OpponentStrip (compete) → action row → help → setup disclosure → the
 * found-words `<WordList>`. Every command arrives as a bound action this column
 * simply places — what it does, whether it applies right now and which key also
 * fires it are the action's own business. Prop names match the other games'
 * columns for the same idea (docs/playarea.md).
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
  score,
  stats,
  players,
  selfId,
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

  // ── State readout ──
  /** The caller/team's TOTAL score (required + bonus) — the OpponentStrip metric. */
  score: number
  /** The 4-cell Stats grid figures (required + bonus, count + score). */
  stats: BoggleStats

  // ── Players (the OpponentStrip — compete) ──
  /** The roster (identity + per-player concede/result bits terminalOutcomeVerb reads). */
  players: GamePlayer[]
  selfId: string
  /** Each peer's score, from the compete leaderboard (self reads `myScore`). */
  metricByUser: ReadonlyMap<string, number>
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  // (ICON-ONLY buttons — the waffle arrangement; tooltips carry the labels.
  //  Playing: End/Concede + back-to-club. Terminal: Restart + New game +
  //  back-to-club.)
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** Restart THIS board — same faces, finds wiped. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup, new board + id. Disables itself
   *  while the create is in flight, so a slow network reads as "working". */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. ONE binding
   *  for both rows: it navigates directly at terminal and routes through the
   *  suspend-confirm flow mid-game. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: BoggleSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** The board's dice-set description (setup echo). */
  diceLabel: string
  /** The scoring-ladder label (setup echo). */
  ladderLabel: string
  minWordLength: number

  // ── Found-words list ──
  wordRows: WordListRow[]
  /** True once the terminal missed-words reveal is folded into `wordRows`. */
  reveal: boolean
  /** Does this board have a bonus word list? Drops the list's KIND filter when not. */
  hasBonus: boolean
}) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → setup disclosure → list. */}

        {/* State — the 4-cell grid: Words · Score · Bonus Words · Bonus Score. */}
        <Stats {...stats} />

        {/* Opponent strip (compete) — each peer's score, identity on a leading disc;
            word counts stay private (the compete privacy line). */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Score"
            metricFor={(p, isSelf) => {
              const peerScore = isSelf ? score : (metricByUser.get(p.user_id) ?? 0)
              // Mid-game: a conceder reads as "out". At terminal, prefix the outcome
              // verb so the "no longer active" states read differently — "Quit at 12"
              // vs "Lost at 12" vs "Won at 40"; an ordinary player shows the number.
              if (!isTerminal) return concededIds.has(p.user_id) ? 'out' : peerScore
              const member = players.find((m) => m.user_id === p.user_id)
              return `${terminalOutcomeVerb(member)} at ${peerScore}`
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

        {/* Help — only while the player can act on it (never silently swapped);
            hidden once conceded, when entry is disabled. */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Type a word, then Enter. <kbd>↑</kbd> recalls your last word.
          </p>
        )}

        {/* Setup — LAST before the list, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

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
