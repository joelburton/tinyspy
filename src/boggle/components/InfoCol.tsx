import { outcomeVerb, type GamePlayer } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { WordList, type WordListRow } from '../../common/components/game/lists/WordList'
import { Stats } from './Stats'
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
  words,
  score,
  requiredFound,
  requiredTotal,
  legalTotal,
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

  // ── State readout (the 4-cell Stats grid) ──
  /** All words found (A), and their score (B). */
  words: number
  score: number
  /** Required words found (C) / required on the board (D). */
  requiredFound: number
  requiredTotal: number
  /** Legal words on the board (F) — required + bonus. Legal-found (E) = `words`. */
  legalTotal: number

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

        {/* State — the 4-cell grid: Words · Score · Required Words · Legal Words. */}
        <Stats
          words={words}
          score={score}
          requiredFound={requiredFound}
          requiredTotal={requiredTotal}
          legalFound={words}
          legalTotal={legalTotal}
        />

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
              return `${outcomeVerb(member)} at ${peerScore}`
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

        {/* Help — only while the player can act on it (never silently swapped);
            hidden once conceded, when entry is disabled. */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Type a word, then Enter. <kbd>↑</kbd> recalls your last word.
          </p>
        )}

        {/* Setup — LAST before the list, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>Board: {diceLabel}</li>
          <li>Dictionary (required): {difficultyValue(setup.band)}</li>
          <li>Dictionary (legal): {difficultyValue(setup.legal_band)}</li>
          <li>Scoring: {ladderLabel}</li>
          <li>Min word length: {minWordLength}</li>
          <li>Win at: {setup.win_percent === null ? 'none' : `${setup.win_percent}%`}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      <WordList rows={wordRows} players={players} reveal={reveal} />
    </div>
  )
}
