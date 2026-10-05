// cs-fixed-outcome-fix

import { useMemo, type CSSProperties } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { useChainMove } from '../hooks/useChainMove'
import { useTypedWord } from '../hooks/useTypedWord'
import { Board } from './Board'
import { ChainStrip } from './ChainStrip'
import { TypedWord } from './TypedWord'
import {
  DESKTOP_ROW_BUDGET_REM,
  MOBILE_ROW_BUDGET_REM,
  estimateChainRows,
} from '../lib/chainRows'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import type { GGameData, GHistoryView, GTile } from '../types'

/**
 * letterboxed's board column: the chain strip, the square, and the entry — and
 * the move, which it builds and sends: the word being typed (`useTypedWord`,
 * from the keyboard or the board) and its trips to the server
 * (`useChainMove`).
 *
 * ── The locked first letter ──────────────────────────────────────────────────
 * Once the chain has a word, the next one MUST start with that word's last
 * letter, so the entry seeds itself with it and won't let you delete it. That
 * is how the source game behaves, and it turns the game's one non-obvious rule
 * into something you can't get wrong rather than something you get told off
 * for: BACKSPACE stops at the seed, which isn't a character the player chose.
 *
 * ── Taking a word back ───────────────────────────────────────────────────────
 * There is no Undo button and no Clear button: the last word in the chain
 * strip carries an ×, which is the same action expressed where the thing it
 * affects already is. Clicking it repeatedly walks the chain back to empty, so
 * a bulk clear has nothing left to do.
 */
export function BoardCol({
  gd,
  shownWords,
  historyView,
  localFeedbackSlot,
  myTurnJustStarted,
}: {
  gd: GGameData
  // The chain to DRAW — PlayArea picks it: a past move's while the history
  // viewer is open, the live one otherwise. The entry's seed letter and the ×
  // come off the live chain, never a snapshot: reviewing a past move must not
  // change what your next move is.
  shownWords: string[]
  historyView: GHistoryView
  // PlayArea's below-board slot — the entry row draws its top in place of
  // the controls, and a keystroke is the player's next move, so it dismisses
  // a gesture-cleared message.
  localFeedbackSlot: FeedbackSlot
  // True for a beat at the moment the turn becomes mine — the board frame
  // flashes. Always false in a free-for-all game.
  myTurnJustStarted: boolean
}) {
  const move = useChainMove(gd, localFeedbackSlot)
  const entry = useTypedWord({ gd, sendWord: move.sendWord, onEdit: move.clearRefused })

  // The board responds to me: the move is mine, on the live board. That is the
  // ×'s gate. A full chain also freezes the entry — there is no word to
  // compose — but must leave the × live, since taking a word back is then the
  // only move left.
  const isInteractive = gd.me.onTurn && !historyView.isViewing
  const isEntryOpen = isInteractive && !move.isChainFull

  // The word just refused, while it is still what is in the box: the board
  // shakes its letters, keyed on the nonce so a second refusal shakes again.
  const refusedNonce =
    move.refused && move.refused.value.word === entry.word ? move.refused.nonce : null

  // A board letter clicked is the next move, like a keystroke. It appends —
  // unless it repeats the letter the word already ends on, which submits (see
  // Board.tsx for why that is unambiguous).
  function pickTile(tile: GTile) {
    localFeedbackSlot.dismiss()
    // A tile's id is its letter, which is what the word is spelled in.
    if (entry.word.length > 0 && tile.id === entry.word.at(-1)) {
      void entry.submit()
      return
    }
    entry.appendLetter(tile.id)
  }

  async function removeLastWord() {
    if (await move.removeLast()) entry.clear()
  }

  // The chain strip's reserved rows, per breakpoint (which one applies is
  // pure CSS — both vars ride along and the media query picks). Sized from the
  // LIVE chain, not the one shown: sizing from a past move's would shrink the
  // strip whenever an early move is reviewed, and the whole column would jump
  // (docs/ui.md → layout stability; lib/chainRows.ts for the deal).
  const chainRowsStyle = useMemo(
    () =>
      ({
        '--chain-rows-desktop': Math.min(
          4,
          Math.max(2, estimateChainRows(gd.me.board.words, DESKTOP_ROW_BUDGET_REM)),
        ),
        '--chain-rows-mobile': Math.min(
          4,
          Math.max(3, estimateChainRows(gd.me.board.words, MOBILE_ROW_BUDGET_REM)),
        ),
      }) as CSSProperties,
    [gd.me.board.words],
  )

  return (
    <div className={cls(shared.boardCol, styles.boardCol)} style={chainRowsStyle}>
      {/* No MobileStatusBar, deliberately (docs/mobile.md's adoption rule). */}

      {/* The chain strip and the board are ONE SNAPSHOT — the words, and the
          letters they covered — so they share one history frame, and a click
          on either falls to the viewer's click-anywhere exit. */}
      <div
        className={cls(styles.historyFramed, historyView.isViewing && history.historyFrame)}
      >
        {/* The chain reads ABOVE the board: it is the state, and it says what
            letter the next word must start with. */}
        <ChainStrip
          words={shownWords}
          onRemoveLast={() => void removeLastWord()}
          canRemoveLast={isInteractive}
        />

        <Board
          tiles={gd.puzzle.tiles}
          words={shownWords}
          typedWord={historyView.isViewing ? '' : entry.word}
          isInteractive={isEntryOpen}
          marks={{ shakeNonce: refusedNonce, myTurnJustStarted }}
          onPick={pickTile}
        />
      </div>

      {/* The shared RESERVED-HEIGHT swap box: it holds either the entry row
          or the slot's top message — a word result, a hint, "Chain is full",
          the ending's verdict, whichever ranks highest — and its fixed
          min-height is what stops the board above from moving as those swap
          (docs/ui.md → layout stability). */}
      <div
        className={cls(
          shared.moveAreaOrLocalFeedback,
          styles.entrySlot,
          // The banner is `inset: 0`, so its host must be positioned — but only
          // while viewing (historyViewer.module.css says why).
          historyView.isViewing && history.historyBannerHost,
        )}
      >
        {historyView.isViewing && (
          <HistoryBanner label={historyView.label} actor={historyView.actor} onExit={historyView.exit} />
        )}
        <WordEntryArea
          value={entry.word}
          onChange={entry.edit}
          onSubmit={() => void entry.submit()}
          placeholder="Type or click letters"
          // Per-character rendering, so the carried-over first letter can say
          // it isn't yours to delete.
          children={<TypedWord word={entry.word} seedLength={entry.seed.length} />}
          localFeedbackSlot={localFeedbackSlot}
          // Off while a past move is open too: freezing capture lets the
          // viewer's `act-exit-history` consume the keystroke (back to live)
          // instead of editing the live draft behind the banner.
          disabled={!isEntryOpen}
          busy={move.inFlight}
          onAnyKey={localFeedbackSlot.dismiss}
          charFor={entry.charFor}
          // No history here: a submitted word joins the chain rather than going
          // away, so there is nothing for ↑ to bring back — and ↓ could only
          // clear back to the seed, which the entry refuses anyway.
          hasHistory={false}
        />
      </div>
    </div>
  )
}
