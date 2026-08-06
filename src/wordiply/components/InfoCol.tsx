import { outcomeVerb, type GamePlayer } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import type { SetupRow } from '../../common/lib/game/setupRows'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { MAX_GUESSES } from './GuessBoard'
import { LengthScoreBar } from './LengthScoreBar'
import { GameTurnLog } from './GameTurnLog'
import { OpponentReveal, type OpponentReveals } from './OpponentReveal'
import type { GuessRow } from '../hooks/useGame'
import type { WordiplySetup } from '../lib/setup'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

/**
 * wordiply's info column — the canonical order (docs/playarea.md): state →
 * OpponentStrip (compete) → action row → setup disclosure → terminal
 * reveal. Every mutation is a named callback up; PlayArea owns the RPCs.
 *
 * The "state" region enforces the length-only rule: MID-GAME it shows just
 * "Guesses n/5"; at TERMINAL the same fixed-height slot fills in the
 * `<LengthScoreBar>` + the letter-count stat (scores are terminal-only).
 * The reveal beneath names the longest possible word.
 */
export function InfoCol({
  isCompete,
  isTerminal,
  solutionRevealed,
  over,
  isLocallyDone,
  currentTurnUserId,
  // ── State ──
  guessesUsed,
  longest,
  letters,
  maxWordLength,
  longestWord,
  base,
  opponentReveal,
  // ── Opponent strip (compete) ──
  players,
  selfId,
  guessesByUser,
  scoreByUser,
  concededIds,
  // ── Action row ──
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  onRequestBackToClub,
  // ── Setup disclosure ──
  setupRows,
  allGuesses,
}: {
  isCompete: boolean
  isTerminal: boolean
  /** `common.games.solution_revealed` — the common "may they see the solution?"
   *  flag. wordiply doesn't hide its answer (gametypes.hides_solution = false),
   *  so end_game sets it at every ending and this reads like `isTerminal`
   *  today; it's here so the best-possible-word gate lives in the one canonical
   *  place rather than in a per-game expression. */
  solutionRevealed: boolean
  over: TerminalCopy | null
  /** Compete: I conceded but the others race on — the terminal LOOK. */
  isLocallyDone: boolean
  /** Whose turn it is under turn-order, or null for a free-for-all game.
   *  Non-null ⇒ render the shared TurnStatusLine (a turn game). */
  currentTurnUserId: string | null

  // ── State (the caller's / team's track) ──
  guessesUsed: number
  /** Longest guess so far (terminal LengthScoreBar numerator). */
  longest: number
  /** Sum of all guess lengths (terminal letter-count stat). */
  letters: number
  maxWordLength: number
  /** The longest possible word — the terminal reveal. */
  longestWord: string | null
  /** The base fragment — for dimming it inside opponents' revealed words. */
  base: string
  /** Compete terminal: each opponent's revealed words (empty otherwise). */
  opponentReveal: OpponentReveals

  // ── Opponent strip (compete) ──
  players: GamePlayer[]
  selfId: string
  /** Each player's guesses used (the mid-game metric). */
  guessesByUser: ReadonlyMap<string, number>
  /** Each player's length score % (the terminal metric). */
  scoreByUser: ReadonlyMap<string, number>
  concededIds: Set<string>

  // ── Action row ──
  onEndGame: () => void
  onConcede: () => void
  onRestart: () => void
  onNewGame: () => void
  /** New game is mid-flight — disables the button so a slow network reads as
   *  "working", not "nothing happened". Paired with the menu item's own
   *  `disabled`; see useSingleFlight in this game's PlayArea. */
  startingNewGame?: boolean
  onBackToClub: () => void
  onRequestBackToClub: () => void

  // ── Setup disclosure ──
  setup: WordiplySetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** EVERY row for the turn log — rejects included. Distinct from the accepted
   *  guesses the board + the readouts above are built from. */
  allGuesses: GuessRow[]
}) {
  // Click-to-define for the terminal "best possible word" reveal — the same
  // shared popover the word lists / waffle's answer reveal use.
  const { define, popover } = useDefinePopover()
  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* State — guesses only during play; score + letters at terminal.
            Fixed min-height so the swap doesn't jump the rows below. */}
        <div className={styles.stateBlock}>
          {isTerminal ? (
            <>
              <LengthScoreBar longest={longest} maxLen={maxWordLength} />
              <div className={styles.letterStat}>
                <strong>{letters}</strong> letters across {guessesUsed} guess
                {guessesUsed === 1 ? '' : 'es'}
              </div>
            </>
          ) : (
            <div className={styles.guessCount}>
              <strong>{guessesUsed}</strong>
              <span className={styles.guessCountOf}> / {MAX_GUESSES} guesses</span>
            </div>
          )}
        </div>
        {/* Whose-turn line — only for a turn-order game (pointer non-null). An
            ADJACENT line: wordiply's state region is a bespoke stateBlock (not the
            shared .infoState), so TurnStatusLine sits beside it rather than replacing
            it. Its presence is fixed at create-time, so it can't reflow. */}
        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        {/* Opponent strip (compete) — mid-game shows each opponent's guesses
            used (never a score — scores are terminal-only); at terminal it
            switches to the length score %. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel={isTerminal ? 'Length' : 'Guesses'}
            metricFor={(p) => {
              if (!isTerminal) {
                return concededIds.has(p.user_id) ? 'out' : `${guessesByUser.get(p.user_id) ?? 0}/${MAX_GUESSES}`
              }
              const member = players.find((m) => m.user_id === p.user_id)
              return `${outcomeVerb(member)} · ${scoreByUser.get(p.user_id) ?? 0}%`
            }}
          />
        )}

        {/* Action row — ICON-ONLY. TERMINAL: outcome line + Restart / New game
            / Club. CONCEDED (others race on): the terminal look + disabled
            Concede. PLAYING: End (coop) / Concede (compete) + back-to-club. */}
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
            {isCompete ? (
              <ConcedeGameButton iconOnly className={shared.helperButton} onClick={onConcede} />
            ) : (
              <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
            )}
            <BackToClubButton iconOnly onClick={onRequestBackToClub} />
          </div>
        )}

        {/* Setup — what was picked at create time. */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

      {/* The reveal — the longest possible word (hidden until now). There is
          no WordList: the board rows are the words. */}
      {solutionRevealed && longestWord && (
        <div className={styles.reveal}>
          <span className={styles.revealLabel}>
            Best possible word: <span className={styles.revealLen}>{maxWordLength}</span>
          </span>
          {/* Click-to-define — a bare button styled as the word (like waffle's
              answer reveal + the shared word lists). */}
          <button
            type="button"
            className={styles.revealWord}
            title="Click to define"
            onClick={(e) => define(longestWord, e.currentTarget)}
          >
            {longestWord.toUpperCase()}
          </button>
        </div>
      )}

      {/* Compete terminal reveal — opponents' actual words, hidden all game.
          Renders null in coop / mid-game (opponentReveal is empty). */}
      {isTerminal && <OpponentReveal base={base} opponents={opponentReveal} />}

      {/* Turn log — LAST, per the canonical info-column order (docs/playarea.md).
          Shows rejects as well as accepted guesses: in coop it's the only way to
          see who tried what, and the only way to see that someone already tried
          a non-word. It scrolls inside its own box (the shared <TurnLog>), so a
          growing log never moves anything above it. */}
      <GameTurnLog
        guesses={allGuesses}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
      />

      {popover}
    </div>
  )
}
