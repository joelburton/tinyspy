// cs-blessed-codenamesduet

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import {
  useDismissLocalFeedbackOnKey,
} from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { usePickedTile } from '../hooks/usePickedTile'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { Board } from './Board'
import { ClueStrip } from './ClueStrip'
import { StateLine } from './StateLine'
import styles from './BoardCol.module.css'
import type {
  GClueStrip,
  GGameData,
  GHistoryView,
  GSuggestState,
  GTile,
} from '../types'

/**
 * codenamesduet's board column — the 5×5 `Board`, and under it the fixed-height
 * below-board slot: the `ClueStrip` during play, or the local slot's top message
 * (a not-ok, the ending's verdict), with the turn viewer's banner over either.
 *
 * A two-input game: a guess is a tile click — or the keyboard's pick and Enter
 * (the board's cursor) — and this column owns the guess
 * (`useSubmitGuess`); a clue is the `ClueStrip` form, which owns
 * `submit_clue`, `pass_turn` and the AI suggestion. Neither owns game state —
 * the reveal arrives in the next blob, and PlayArea hands this column the board
 * to render, live or a viewed turn's. Not-oks show into PlayArea's local slot,
 * the one InfoCol's Stop shows into too. See docs/playarea.md.
 */
export function BoardCol({
  gd,
  tiles,
  historyView,
  partnerKeyShown,
  endingOutcome,
  localFeedbackSlot,
  onSuggestionChange,
}: {
  gd: GGameData
  // The board to draw — the live one or a viewed turn's (PlayArea picks).
  tiles: GTile[]
  historyView: GHistoryView
  // I asked to see my partner's key; the board draws it once the game has ended.
  partnerKeyShown: boolean
  // The ending's outcome, for the game-over frame's color; null while playing.
  endingOutcome: EndOutcome | null
  // PlayArea's below-board slot. This column and the clue strip show their
  // not-oks into it (a rejected guess / clue / pass), and while it holds
  // anything — a not-ok, the ending's verdict — the pill takes the clue
  // strip's place.
  localFeedbackSlot: FeedbackSlot
  // Open / update / close the AI clue-suggestion dialog; its state is PlayArea's.
  onSuggestionChange: (state: GSuggestState | null) => void
}) {
  // ─── Which board is on screen ─────────────────────────────────
  // Live, or a past turn's (PlayArea picks); everything that would write to the
  // board answers to it.
  const suddenDeath = gd.me.suddenDeath
  // The move is mine: the server's pointer names me — or, in sudden death with
  // words on both sides, it names nobody and the rulebook lets either of us
  // guess, which one pointer cannot say.
  const isMyMove = gd.me.onTurn ||
    (suddenDeath && gd.turns.holder === null && gd.me.stillPlaying)
  // The board takes my guess: the move is mine and it is a guess — the clue is
  // in, or it is sudden death. The clue-giver holds the move too, but their
  // move is the clue form, not the board.
  const isInteractive = isMyMove && (suddenDeath || gd.turns.currClue !== null)
  // I may guess right now: never over a past turn.
  const canGuess = isInteractive && !historyView.isViewing
  // Still playing, and the move is my partner's.
  const isWaitingForTurn = gd.me.stillPlaying && !isMyMove
  // The board frame flashes the moment the turn arrives — the same arrival the
  // page's bell rings on (the shared pointer), so the two land together.
  const myTurnJustStarted = useTurnStartFlash(gd.me.onTurn)
  // Guesses the server has recorded — the cause the attention flash reads.
  const moveCount = gd.events.filter((e) => e.kind === 'guess').length
  // What the clue strip under the board shows.
  const strip: GClueStrip = suddenDeath
    ? 'suddenDeath'
    : gd.turns.currClue !== null
      ? gd.me.clueGiver ? 'partnerGuessing' : 'myGuess'
      : gd.me.clueGiver ? 'myClue' : 'waitingForClue'

  // ─── The pending move ─────────────────────────────────────────
  // The guess and its trip to the server (`useSubmitGuess`), the picked tile
  // (`usePickedTile`), and the column's keys.
  const tilesById = gd.me.board.tilesById
  const guess = useSubmitGuess({
    gameId: gd.id,
    tilesById,
    me: gd.me,
    localFeedbackSlot,
    isViewingHistory: historyView.isViewing,
  })
  const pick = usePickedTile({ tilesById, me: gd.me, canGuess, localFeedbackSlot })
  useBoardColActions({
    pickedTile: pick.tile,
    canGuess,
    choosePickedTile: pick.choose,
    clearPickedTile: pick.clear,
    sendGuess: guess.send,
    isGuessOut: guess.inFlightTile !== null,
  })

  // Any key is the player's next move, so it dismisses a gesture-cleared
  // message; a keystroke aimed at the clue field never reaches it (see
  // `useDismissLocalFeedbackOnKey`).
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // A tile click guesses at once — unless a guess is still out, since you
  // shouldn't guess again until its reveal lands — and any pick goes.
  function guessTile(tile: GTile) {
    if (guess.inFlightTile !== null) return
    pick.clear()
    guess.send(tile)
  }

  // ─── Render ───────────────────────────────────────────────────

  // Whatever the slot holds on top takes the clue strip's place; an empty
  // slot hands it back.
  const top = useWatchAndGetTopFeedbackMsg(localFeedbackSlot)

  return (
    <div className={shared.boardCol}>
      {/* The live readout above the board, on a phone only; see `MobileStatusBar`. */}
      <MobileStatusBar>
        <StateLine facts={gd.me}/>
      </MobileStatusBar>
      <Board
        tiles={tiles}
        moveCount={moveCount}
        marks={{
          pickedTile: pick.tile,
          inFlightTile: guess.inFlightTile,
          endingOutcome,
          isWaitingForTurn,
          myTurnJustStarted,
        }}
        historyView={historyView}
        me={gd.me}
        partner={gd.partner}
        showsPartnerKey={gd.ended && partnerKeyShown}
        isInteractive={isInteractive}
        onPick={pick.choose}
        onGuess={guessTile}
      />
      {/* The below-board slot (docs/playarea.md → Board sizing). Two states in
          one fixed-height slot, so the board above never shifts as they swap:
          the slot's pill when it holds anything — a not-ok, the verdict — else
          the ClueStrip. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback,
          historyView.isViewing && history.historyBannerHost)}>
          {/* The shared banner overlays this below-board slot while a past turn is
              open — the ClueStrip / pill stays mounted underneath, so an in-progress
              clue survives. */}
          {historyView.isViewing && (
            <HistoryBanner label={historyView.label} onExit={historyView.exit}/>
          )}
          {top !== null ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot}/>
            </div>
          ) : (
            <div className={styles.moveArea}>
              <ClueStrip
                gameId={gd.id}
                strip={strip}
                currentClue={gd.turns.currClue}
                partner={gd.partner}
                // Its not-oks go into the same slot.
                localFeedbackSlot={localFeedbackSlot}
                onSuggestionChange={onSuggestionChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
