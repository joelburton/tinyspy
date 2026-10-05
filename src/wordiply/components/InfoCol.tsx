// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { LengthScoreBar } from './LengthScoreBar'
import { GameEventLog } from './GameEventLog'
import { OpponentReveal } from './OpponentReveal'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './PlayArea.module.css'

/**
 * wordiply's info column — the canonical order (docs/playarea.md): state →
 * whose turn → OpponentStrip (compete) → action row → setup disclosure → the
 * revealed word → opponents' words → the event log. Every command is an action
 * PlayArea hands down.
 *
 * The "state" region keeps the length-only rule: MID-GAME it shows just
 * "Guesses n/5"; once the game has ended the same fixed-height slot fills in
 * the `<LengthScoreBar>` + the letter-count stat, the builder's scores.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
  solution,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others play on — for the action row's line; null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // The best possible word to DISPLAY, or null while it stays hidden.
  solution: string | null
}) {
  const sld = gd.stateLineData
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // Mid-race each player's guess count, or "out" once they have ended; once the
  // game has ended, how it went for them and their length score.
  function getGuessesOrScore(player: GPlayer) {
    if (!gd.ended) return player.ending ? 'out' : `${player.nGuessesUsed}/${player.maxGuesses}`
    const verb = player.outcome === 'won' ? 'Won' : player.conceded ? 'Conceded' : 'Lost'
    return `${verb} · ${player.lengthScore}%`
  }

  // Once the race has ended, every rival's words are mine to see.
  const rivals = gd.compete && gd.ended ? gd.players.filter((p) => p !== gd.me) : []

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — guesses only during play; score + letters once ended.
            Fixed min-height so the swap doesn't jump the rows below. The
            scores are written with the ending. */}
        <div className={styles.stateBlock}>
          {gd.ended ? (
            <>
              <LengthScoreBar
                lengthScore={sld.lengthScore!}
                longestWordLen={sld.longestWordLen!}
                maxWordLen={sld.maxWordLen}
              />
              <div className={styles.letterStat}>
                <strong>{sld.nLetters}</strong> letters across {sld.nGuessesUsed} guess
                {sld.nGuessesUsed === 1 ? '' : 'es'}
              </div>
            </>
          ) : (
            <div className={styles.guessCount}>
              <strong>{sld.nGuessesUsed}</strong>
              <span className={styles.guessCountOf}> / {sld.maxGuesses} guesses</span>
            </div>
          )}
        </div>
        {/* Whose-turn line — only for a turn-order game. An ADJACENT line:
            wordiply's state region is a bespoke stateBlock, so TurnStatusLine
            sits beside it rather than replacing it. */}
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* Opponent strip (compete) — mid-game each racer's guesses used
            (never a score), once ended their length score. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel={gd.ended ? 'Length' : 'Guesses'}
            metricFor={getGuessesOrScore}
          />
        )}

        {/* Action row — ICON-ONLY. ENDED: outcome line + Restart / Reveal /
            New game / Club. OUT OF THE RACE (others race on): my ending's line
            + Stop. PLAYING: Stop (coop) / Concede (compete) + back-to-club. */}
        {gd.ended ? (
          <InfoActionsRow message={actionRowMessage}>
            <ActionButton action={actions.actRestart} show="icon" />
            {/* The best possible word, hidden until asked for: a score you can
                read without being told the answer is a puzzle you can keep
                chewing on, so it waits for this button (and the same button
                takes it back). */}
            <ActionButton action={actions.actReveal} show="icon" />
            <ActionButton action={actions.actNewGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : actionRowMessage ? (
          <InfoActionsRow message={actionRowMessage}>
            {/* Both exits are placed and each says whether it applies: out of
                the race, Concede hides and Stop comes out in its place. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" />
          </InfoActionsRow>
        )}

        {/* Setup — what was picked at create time. */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* The reveal — the longest possible word, shown only while this viewer
          is asking for it. There is no WordList: the board rows are the words.
          It grows the column when opened and gives the space back when closed
          (a blessed exception to docs/ui.md → Layout stability: the reflow IS
          the reveal, and only ever on the viewer's own click). */}
      {solution !== null && (
        <div className={styles.reveal}>
          <span className={styles.revealLabel}>
            Best possible word: <span className={styles.revealLen}>{gd.puzzle.maxWordLen}</span>
          </span>
          <DefinableWord word={solution} className={styles.revealWord} />
        </div>
      )}

      {/* Compete, once ended — each rival's words, withheld all race. */}
      <OpponentReveal base={gd.puzzle.base} rivals={rivals} />

      {/* Event log — LAST, per the canonical info-column order (docs/playarea.md).
          Shows rejects as well as accepted guesses: in coop it's the only way to
          see who tried what, and the only way to see that someone already tried
          a non-word. It scrolls inside its own box (the shared <EventLog>), so a
          growing log never moves anything above it. */}
      <GameEventLog
        events={gd.events}
        players={gd.players}
        myId={gd.me.id}
        mode={gd.mode}
        isGameEnded={gd.ended}
        historyView={historyView}
      />
    </div>
  )
}
