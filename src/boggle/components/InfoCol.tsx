import { outcomeVerb, type GamePlayer } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { WordList, type WordListRow } from '../../common/components/game/lists/WordList'
import { Stats, type BoggleStats } from './Stats'
import type { BoggleSetup } from '../lib/setup'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * boggle's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): word/score
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
  score,
  stats,
  players,
  selfId,
  metricByUser,
  concededIds,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  onBackToClub,
  onRequestBackToClub,
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

  // ── State readout ──
  /** The caller/team's TOTAL score (required + bonus) — the OpponentStrip metric. */
  score: number
  /** The 4-cell Stats grid figures (required + bonus, count + score). */
  stats: BoggleStats

  // ── Players (the OpponentStrip — compete) ──
  /** The roster (identity + per-player concede/result bits playerOutcome reads). */
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
  onEndGame: () => void
  onConcede: () => void
  /** Restart THIS board — same faces, finds wiped (the menu's replay-board,
   *  unconfirmed at terminal since there's nothing to lose). */
  onRestart: () => void
  /** Start a fresh follow-up game — same setup, new board + id. */
  onNewGame: () => void
  /** Direct navigation to the club — terminal only (nothing to lose). */
  onBackToClub: () => void
  /** Mid-game back-to-club: routes through the shell's suspend-confirm flow
   *  (menu.requestBackToClub), NOT direct navigation — leaving a live game
   *  shelves it. */
  onRequestBackToClub: () => void

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
              return `${outcomeVerb(member)} at ${peerScore}`
            }}
          />
        )}

        {/* Action row — ICON-ONLY (the waffle arrangement; the styled tooltips
            carry the labels). TERMINAL: the bold outcome line + Restart /
            New game / back-to-club (primary). CONCEDED (the others race on):
            the terminal LOOK — a status line + the now-disabled Concede.
            PLAYING: End/Concede + back-to-club (via the suspend-confirm flow). */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {/* Stay-here options left of the leave option (Club): run this
                board back, or spin up the next one. */}
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} />
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
