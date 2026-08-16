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
import type { SetupRow } from '../../common/lib/game/setupRows'
import { BOARD_SIZE } from '../lib/board'
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
  events,
  // ── Players & opponent strip (compete) ──
  players,
  selfId,
  isCompete,
  wordsByUser,
  coveredByUser,
  concededIds,
  // ── Setup disclosure ──
  setupRows,
  // ── Action row ──
  onHint,
  onSpoiler,
  onReveal,
  solutionShown,
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
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts), so
   *  the two can't drift. Built in PlayArea, which holds mode + roster. */
  setupRows: SetupRow[]
  // ── Action row ──
  /** Coop only — both refused server-side in compete. */
  onHint: () => void
  onSpoiler: () => void
  /** Show the seeded pair — or put it away again. A local display toggle
   *  shared with the menu twin; nothing is written and no peer is affected. */
  onReveal: () => void
  /** Is the pair on screen right now? Swaps the button to its Hide face. */
  solutionShown: boolean
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
              revealedLabel="Hide solution"
              revealed={solutionShown}
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

        {/* The seeded pair — GATED behind the Reveal button above, not shown
            for free, and never automatically (a win covers the twelve letters
            with SOME chain; the pair is a different, shorter answer nobody
            saw). It ships to the client from game start (the board's own word
            list would give a solution away anyway), so this is a display gate
            rather than a security boundary — but it is still the thing that
            ends the post-mortem, so it waits to be asked for, and goes away
            again when the asker is done. `terminalExtra`: a region allowed to
            grow when the viewer opens it and to give the space back when they
            close it (a blessed exception to docs/ui.md → Layout stability),
            ABOVE the setup disclosure per the canonical order (the reveal is
            the payoff; the recap is bookkeeping). */}
        {solutionShown && solution.length > 0 && (
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
            Rendered from the shared rows rather than hand-written <li>s: the
            PDF prints this exact array, and when the two were written
            separately they drifted (docs/pdf.md → Setup rows). */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
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
