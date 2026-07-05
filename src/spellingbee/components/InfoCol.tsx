import { outcomeVerb, type GamePlayer } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { DIFFICULTY_LABELS } from '../../common/lib/game/difficulty'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { WordList, type WordListRow } from '../../common/components/game/lists/WordList'
import { RANKS } from '../lib/ranks'
import type { SpellingbeeSetup } from '../lib/setup'
import { RankBar } from './RankBar'
import { Stats } from './Stats'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * spellingbee's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/design-decisions.md → Info column) with two
 * spellingbee picks: the RankBar + Stats are ONE "state" unit and lead (the thing you
 * watch), and there's no help line (the honeycomb makes the move obvious). Order:
 * state (RankBar + Stats) → OpponentStrip (compete) → action row → setup disclosure →
 * the found-words `<WordList>`. Every mutation is a named callback up (`onEndGame` /
 * `onConcede`); PlayArea owns the RPCs + coordination. Prop names match the other
 * games' columns for the same idea (docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
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
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  wordRows,
  reveal,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  isTerminal: boolean
  /** Terminal copy when the game is over (drives the action row), else null. */
  over: TerminalCopy | null
  /** I conceded a compete race — the terminal LOOK while the others race on. */
  isLocallyDone: boolean

  // ── State (RankBar + Stats — one unit) ──
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number

  // ── Opponent strip (compete) ──
  /** The roster (identity + per-player concede/result bits playerOutcome reads). */
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

  // ── Action row (End/Concede, back-to-club at terminal) ──
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: SpellingbeeSetup

  // ── Found-words list ──
  wordRows: WordListRow[]
  /** True at terminal — folds the missed-words reveal into `wordRows`. */
  reveal: boolean
}) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* State — RankBar + Stats are one unit (score progress + the figures),
            kept together and leading. */}
        <RankBar score={foundWordsScore} total={requiredWordsScore} />
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
              return `${outcomeVerb(member)} at ${rank}`
            }}
          />
        )}

        {/* Action row: the End-game button during play; at terminal the bold,
            outcome-colored result line + a compact back-to-club button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : isLocallyDone ? (
          // I conceded; the others race on. Terminal LOOK (a status line + the
          // now-disabled Concede) so the state change reads loudly.
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

        {/* Setup options — what was picked at create time, behind the shared
            disclosure. Closed by default so it doesn't crowd the status above. */}
        <SetupDisclosure>
          <li>{DIFFICULTY_LABELS[setup.required - 1] ?? '—'} required words</li>
          <li>{DIFFICULTY_LABELS[setup.legal - 1] ?? '—'} legal (bonus) words</li>
          {isCompete && targetRankIdx !== null && <li>Target rank: {RANKS[targetRankIdx]}</li>}
          <li>{timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* The required-words answer key ships from game start, so the missed-words
          reveal is gated on terminal: during play only found rows show; at terminal
          the unfound required words are revealed (bonus words are never revealed). */}
      <WordList rows={wordRows} players={players} reveal={reveal} />
    </div>
  )
}
