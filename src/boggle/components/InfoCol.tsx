import { cls } from '../../common/lib/util/cls'
import { playerOutcome, type GamePlayer } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { DIFFICULTY_LABELS } from '../../common/lib/game/difficulty'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { WordList, type WordListRow } from '../../common/components/game/lists/WordList'
import type { BoggleSetup } from '../lib/setup'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * boggle's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/design-decisions.md → Info column): word/score
 * readout → OpponentStrip (compete) → action row → help → setup disclosure → the
 * found-words `<WordList>`. Every mutation is a named callback up (`onEndGame` /
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
  myCount,
  requiredWordsCount,
  myScore,
  players,
  selfId,
  metricByUser,
  concededIds,
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  diceLabel,
  ladderLabel,
  minWordLength,
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

  // ── State readout (words found + score) ──
  myCount: number
  requiredWordsCount: number
  myScore: number

  // ── Players (the OpponentStrip — compete) ──
  /** The roster (identity + per-player concede/result bits playerOutcome reads). */
  players: GamePlayer[]
  selfId: string
  /** Each peer's score, from the compete leaderboard (self reads `myScore`). */
  metricByUser: ReadonlyMap<string, number>
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: BoggleSetup
  /** The board's dice-set description (setup echo). */
  diceLabel: string
  /** The scoring-ladder label (setup echo). */
  ladderLabel: string
  minWordLength: number

  // ── Found-words list ──
  wordRows: WordListRow[]
  /** True once the terminal missed-words reveal is folded into `wordRows`. */
  reveal: boolean
}) {
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* InfoCol order is FIXED (docs/design-decisions.md → Info column):
            state → opponent strip → action row → help → setup disclosure → list. */}

        {/* State — words found / required + score earned. */}
        <p className={shared.infoState}>
          <strong>{myCount}</strong> / {requiredWordsCount} words ·{' '}
          <strong>{myScore}</strong> pts
        </p>

        {/* Opponent strip (compete) — each peer's score, identity on a leading disc;
            word counts stay private (the compete privacy line). */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Score"
            metricFor={(p, isSelf) => {
              const score = isSelf ? myScore : (metricByUser.get(p.user_id) ?? 0)
              // Mid-game: a conceder reads as "out". At terminal, prefix the outcome
              // verb so the "no longer active" states read differently — "Quit at 12"
              // vs "Lost at 12" vs "Won at 40"; an ordinary player shows the number.
              if (!isTerminal) return concededIds.has(p.user_id) ? 'out' : score
              const member = players.find((m) => m.user_id === p.user_id)
              const outcome = member ? playerOutcome(member) : 'lost'
              if (outcome === 'won') return `Won at ${score}`
              if (outcome === 'quit') return `Quit at ${score}`
              return `Lost at ${score}`
            }}
          />
        )}

        {/* Action row — End (coop) / Concede (compete) during play; at terminal the
            bold outcome line + a compact back-to-club button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : isLocallyDone ? (
          // I conceded; the others race on. Terminal LOOK (a status line + the
          // now-disabled Concede) so the state change reads loudly.
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

        {/* Help — only while the player can act on it (never silently swapped);
            hidden once conceded, when entry is disabled. */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Type a word, then Enter. <kbd>↑</kbd> recalls your last word.
          </p>
        )}

        {/* Setup — LAST before the list, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>{diceLabel} board</li>
          <li>{DIFFICULTY_LABELS[setup.band - 1] ?? '—'} required words</li>
          <li>{DIFFICULTY_LABELS[setup.legal_band - 1] ?? '—'} legal (bonus) words</li>
          <li>{ladderLabel} scoring · min length {minWordLength}</li>
          <li>{timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      <WordList rows={wordRows} players={players} reveal={reveal} />
    </div>
  )
}
