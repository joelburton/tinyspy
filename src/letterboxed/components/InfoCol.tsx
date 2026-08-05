import type React from 'react'
import type { ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GamePlayer } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { HintButton } from '../../common/components/buttons/HintButton'
import { SpoilerButton } from '../../common/components/buttons/SpoilerButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { timerLabel } from '../../common/lib/game/timerLabel'
import type { LetterboxedSetup } from '../lib/setup'
import { BOARD_SIZE, PAR } from '../lib/board'
import { GameTurnLog } from './GameTurnLog'
import { StateLine } from './StateLine'
import type { EventRow } from '../hooks/useGame'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

/**
 * letterboxed's info column. Readouts in the canonical order
 * (docs/playarea.md): state → turn → opponents → actions, then the reveal and
 * the move log below the action slot.
 *
 * The state block is the whole game in two fractions — letters covered out of
 * twelve, words used out of the cap — so a glance answers "how are we doing?".
 *
 * The CHAIN itself is deliberately not here: it sits above the board
 * (`<ChainStrip>`), because it is per-turn state rather than a summary, and on
 * a phone this column is off-canvas behind the info sheet.
 */
export function InfoCol({
  // ── Terminal & turn state ──
  over,
  isTerminal,
  isLocallyDone,
  isTurnGame,
  currentTurnUserId,
  // ── State (the chain and its readouts) ──
  chain,
  maxWords,
  lettersCovered,
  solution,
  solutionRevealed,
  events,
  // ── Players & opponent strip (compete) ──
  players,
  selfId,
  isCompete,
  wordsByUser,
  coveredByUser,
  concededIds,
  // ── Setup disclosure ──
  setup,
  // ── Action row ──
  onHint,
  onSpoiler,
  onReveal,
  revealDisabled,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  onRequestBackToClub,
  // ── Turn-history viewer ──
  viewingIndex,
  onSelectTurn,
}: {
  // ── Terminal & turn state ──
  over: (TerminalCopy & { verdictNode?: ReactNode }) | null
  isTerminal: boolean
  isLocallyDone: boolean
  /** Turn-by-turn co-op. Fixed at create time, so the turn line's presence
   *  never changes mid-game and can't reflow the column. */
  isTurnGame: boolean
  currentTurnUserId: string | null
  // ── State (the chain and its readouts) ──
  chain: string[]
  maxWords: number
  lettersCovered: number
  solution: string[]
  solutionRevealed: boolean
  events: EventRow[]
  // ── Players & opponent strip (compete) ──
  players: GamePlayer[]
  selfId: string
  isCompete: boolean
  wordsByUser: Map<string, number>
  coveredByUser: Map<string, number>
  concededIds: Set<string>
  // ── Setup disclosure ──
  /** What was picked at create time, recapped in the disclosure. */
  setup: LetterboxedSetup
  // ── Action row ──
  /** Coop only — both refused server-side in compete. */
  onHint: () => void
  onSpoiler: () => void
  /** Open the seeded solution for everyone (common.reveal_solution). */
  onReveal: () => void
  /** Already open — a win reveals automatically, so the button goes inert. */
  revealDisabled: boolean
  onEndGame: () => void
  onConcede: () => void
  onRestart: () => void
  onNewGame: () => void
  startingNewGame: boolean
  onBackToClub: () => void
  onRequestBackToClub: () => void
  // ── Turn-history viewer ──
  /** The move open on the board, or null when live. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {
  // Click-to-define, the shared popover the word lists and turn logs use.
  const { define, popover } = useDefinePopover()
  // Pointer-only, deliberately: NOT focusable, no role="button". See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineProps = (word: string) => ({
    className: 'definable',
    title: 'Click to define',
    onClick: (e: React.MouseEvent<HTMLSpanElement>) => define(word, e.currentTarget),
  })

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        <StateLine
          lettersCovered={lettersCovered}
          wordsUsed={chain.length}
          maxWords={maxWords}
        />

        {/* Whose-turn line — only in a turn-order game. Rendering it in a
            free-for-all game would print "Waiting for someone…" forever,
            since the pointer is null there. */}
        {isTurnGame && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        {/* Compete: the two numbers a race may publish. Never the words.
            DELIBERATELY unchanged at terminal (Joel, 2026-08-05) — wordiply's
            strip switches to a verdict there, but here coverage IS the story:
            "they got 10 of the 12" is what you want to know about a rival
            after a race on coverage. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Covered"
            metricFor={(p) =>
              concededIds.has(p.user_id)
                ? 'out'
                : `${coveredByUser.get(p.user_id) ?? 0}/${BOARD_SIZE} · ${wordsByUser.get(p.user_id) ?? 0}w`
            }
          />
        )}

        {/* Action row — ICON-ONLY. TERMINAL: outcome line + Restart / New game
            / Club. CONCEDED (others race on): the terminal look + a disabled
            Concede. PLAYING: End (coop) / Concede (compete) + back-to-club. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            <RestartButton iconOnly onClick={onRestart} />
            <RevealButton
              iconOnly
              label="Reveal solution"
              disabled={revealDisabled}
              onClick={onReveal}
            />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : isLocallyDone ? (
          <LocalTerminalRow label="You conceded">
            <ConcedeGameButton iconOnly className={shared.helperButton} disabled />
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {/* The two rungs of the help ladder, icon-only like everything
                else in this row. Coop only: in compete "first past the bar
                wins" would make either a win button, and the server refuses
                them there too. */}
            {!isCompete && (
              <>
                <HintButton iconOnly className={shared.helperButton} onClick={onHint} />
                <SpoilerButton
                  iconOnly
                  label="Show the word"
                  className={shared.helperButton}
                  onClick={onSpoiler}
                />
              </>
            )}
            {isCompete ? (
              <ConcedeGameButton iconOnly className={shared.helperButton} onClick={onConcede} />
            ) : (
              <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
            )}
            <BackToClubButton iconOnly onClick={onRequestBackToClub} />
          </div>
        )}

        {/* Help — the interface in one line, and only while the player can act
            on it (never silently swapped for something else). */}
        {!over && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Click letters or type; click the last one again (or press{' '}
            <kbd>Enter</kbd>) to submit. Every word starts where the last one
            ended — the × takes it back.
          </p>
        )}

        {/* The seeded solution — GATED behind the Reveal button above, not
            shown for free. It ships to the client from game start (the board's
            own word list would give a solution away anyway), so this is a
            display gate rather than a security boundary — but it is still the
            thing that ends the post-mortem, so it waits to be asked for.
            `terminalExtra`: the one region allowed to grow at game over, ABOVE
            the setup disclosure per the canonical order (the reveal is the
            payoff; the recap is bookkeeping). */}
        {solutionRevealed && solution.length > 0 && (
          <div className={cls(shared.terminalExtra, styles.chainBlock)}>
            <div className={styles.blockTitle}>Solvable in two</div>
            <div className={styles.solution}>
              {solution.map((w, i) => (
                <span key={w}>
                  {i > 0 && ' → '}
                  <span {...defineProps(w)}>{w.toUpperCase()}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Setup options — what was picked at create time, behind the shared
            disclosure. Closed by default so it doesn't crowd the state above.
            The word limit is quoted against PAR, the same way the setup form
            asked for it: "5 words" alone doesn't say how much room that is. */}
        <SetupDisclosure>
          <li>
            Word limit: par + {setup.extra_words} ({PAR + setup.extra_words} words)
          </li>
          <li>Dictionary: {difficultyValue(setup.legal_band)}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {popover}
      <GameTurnLog
        events={events}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
