// cs-fixed-outcome-fix

import { useCallback, useMemo, type CSSProperties } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { Mark } from '@/common/board-marks/useMark'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { Board } from './Board'
import { ChainStrip } from './ChainStrip'
import { TypedWord } from './TypedWord'
import { canFollow, tailLetter } from '../lib/board'
import {
  DESKTOP_ROW_BUDGET_REM,
  MOBILE_ROW_BUDGET_REM,
  estimateChainRows,
} from '../lib/chainRows'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'

/**
 * letterboxed's board column: the square, the word being built, and the two
 * chain-level actions.
 *
 * ── The locked first letter ──────────────────────────────────────────────────
 * Once the chain has a word, the next one MUST start with that word's last
 * letter, so the entry seeds itself with it and won't let you delete it. That
 * is how the source game behaves, and it turns the game's one non-obvious rule
 * into something you can't get wrong rather than something you get told off
 * for. Mechanically the state here is only the part the player typed
 * (`draft`); the value shown is `seed + draft`, derived every render, so
 * playing a word re-seeds the box with no effect and no stale state.
 *
 * BACKSPACE therefore stops at the seed instead of clearing it — the seed
 * isn't a character the player chose, it's the board telling them where to
 * start.
 *
 * ── Taking a word back ───────────────────────────────────────────────────────
 * There is no Undo button and no Clear button: the last word in the chain
 * strip carries an ×, which is the same action expressed where the thing it
 * affects already is. Clicking it repeatedly walks the chain back to empty, so
 * a bulk clear has nothing left to do.
 */
export function BoardCol({
  sides,
  chain,
  liveChain,
  historyLabel,
  historyActor,
  onExitHistory,
  draft,
  onDraftChange,
  refused,
  onSubmit,
  onPick,
  onRemoveLast,
  localFeedbackSlot,
  entryDisabled,
  isMyTurn,
  busy,
}: {
  // ── Board & chain ──
  sides: string
  // Words to DRAW — a past move's chain while the history viewer is open, the
  // live one otherwise.
  chain: string[]
  // The real chain, always. The entry's seed letter and the × come off this,
  // never off a historical snapshot: reviewing a past move must not change
  // what your next move is.
  liveChain: string[]
  // ── Turn-history viewer ──
  // The viewed move's one-line description (drives the banner + the frame), or
  // null when live.
  historyLabel: string | null
  /** Whose chain is on screen, when it is not the viewer's own. */
  historyActor?: Actor | null
  onExitHistory: () => void
  // ── Entry ──
  // The word this player just had refused — the board shakes its letters, and
  // the mark's nonce is what they are keyed on so a second refusal shakes
  // again. Handed on only while it still describes what is in the box: edit a
  // letter and the answer is about a word that no longer exists.
  refused: Mark<{ word: string }> | null
  // Only the letters the PLAYER added — the seed is derived, see above.
  draft: string
  onDraftChange: (next: string) => void
  onSubmit: () => void
  // A letter was clicked on the board.
  onPick: (letter: string) => void
  // The × on the chain's last word.
  onRemoveLast: () => void
  // PlayArea's below-board slot — the entry row draws its top in place of
  // the controls, and a keystroke is the player's next move, so it dismisses
  // a gesture-cleared message.
  localFeedbackSlot: FeedbackSlot
  // ── Gates ──
  // The board is not mine to type into (`!isBoardInteractive` — over,
  // conceded, a teammate's turn) or the chain is full: board + entry are inert.
  entryDisabled: boolean
  // The move is mine (the page's `isMyTurn`) — the chain's × takes a word back,
  // a move sent to the server. Deliberately NOT `!entryDisabled`: when the
  // chain is full the entry freezes but the × must stay live, since taking a
  // word back is then the only move on the board.
  isMyTurn: boolean
  busy: boolean
}) {
  // Viewing a past turn ⟺ there is one open (docs/playarea.md → Prop
  // conventions: one prop says so, and the flag is derived, never passed).
  const isViewingHistory = historyLabel !== null
  const seed = tailLetter(liveChain) ?? ''
  const word = seed + draft

  const boardLetters = useMemo(() => new Set([...sides]), [sides])

  // Only board letters may be typed. Anything else is swallowed by the capture
  // hook rather than landing in the box and then being rejected on submit.
  const charFor = useCallback(
    (key: string) => {
      const c = key.toLowerCase()
      return c.length === 1 && boardLetters.has(c) ? c : null
    },
    [boardLetters],
  )

  // WordEntryArea hands back the whole intended value; this is the one gate it
  // passes through, and it enforces two things:
  //
  //   1. Anything that no longer begins with the seed is an attempt to
  //      backspace through the locked first letter — ignored.
  //   2. An APPENDED letter that can't legally follow the one before it (same
  //      side of the box) never enters the field at all. Letting it in and
  //      rejecting it on submit would make the player type a word they can
  //      already see is wrong; refusing the keystroke says so immediately.
  //      Deletions are always allowed through.
  const handleChange = useCallback(
    (next: string) => {
      if (!next.startsWith(seed)) return
      if (next.length > word.length) {
        const added = next[next.length - 1]
        if (!canFollow(sides, next[next.length - 2], added)) return
      }
      onDraftChange(next.slice(seed.length))
    },
    [seed, word, sides, onDraftChange],
  )

  // The chain strip's reserved rows, per breakpoint (which one applies is
  // pure CSS — no JS breakpoint read; both vars ride along and the media
  // query picks). Derived from the LIVE chain: most games never leave the
  // base reservation, and when a long chain genuinely needs another row the
  // board absorbs it through --avail-h (see lib/chainRows.ts for the deal).
  //
  // KEEP IT ON liveChain even though the strip now RENDERS the viewed chain.
  // The two are different questions: what the strip shows, and how much room is
  // held for it. Switching this to the shown chain looks like an obvious tidy-up
  // and is a reflow bug — opening move #1 would shrink the strip, --avail-h
  // would hand the space to the board, and the whole column would jump every
  // time you reviewed an early turn (docs/ui.md → layout stability).
  const chainRowsStyle = useMemo(
    () =>
      ({
        '--chain-rows-desktop': Math.min(
          4,
          Math.max(2, estimateChainRows(liveChain, DESKTOP_ROW_BUDGET_REM)),
        ),
        '--chain-rows-mobile': Math.min(
          4,
          Math.max(3, estimateChainRows(liveChain, MOBILE_ROW_BUDGET_REM)),
        ),
      }) as CSSProperties,
    [liveChain],
  )

  return (
    <div className={cls(shared.boardCol, styles.boardCol)} style={chainRowsStyle}>
      {/* NO MobileStatusBar, deliberately (docs/mobile.md's adoption rule: a
          game needs the bar only if its core state is invisible once the info
          column slides away). Here the board IS the letters readout — covered
          letters fill green — and the chain strip is the words readout; the
          one invisible number, words left under the cap, is restated by the
          accepted-word result after every move. */}

      {/* The chain strip and the board are ONE SNAPSHOT, so they share one
          history outline rather than wearing one each.

          They're a pair because they're two views of the same state: the strip
          lists the words, the board shows which letters they covered and traces
          the line between them. Framing only the board (the earlier shape) left
          the strip live while the board rolled back, so the two disagreed and
          showed a combination that never existed. One box also beats two here
          on looks — `.historyFrame` is an outline with a 3px offset, so adjacent
          frames would put two outlines a few pixels apart with the column
          gap between them.

          The wrapper re-declares the column's own flex + gap so inserting it
          changes no spacing: the strip↔board gap is this gap, and the
          wrapper↔entry gap is still the column's.

          `.historyFrame` also makes the whole region click-through, so a click on
          either falls to useHistoryViewer's click-anywhere-to-exit. */}
      <div
        className={cls(styles.historyFramed, isViewingHistory && history.historyFrame)}
      >
        {/* The chain reads ABOVE the board: it is the state, and it says what
            letter the next word must start with. On a phone the info column is
            off-canvas, so a per-turn readout can't live there.

            `chain`, not `liveChain` — while a past move is open this is that
            move's chain. Disabled then too, which is what takes the × off the
            last pill: you can't take back a word from a snapshot, and the same
            flag drops the pill's ×-shaped right padding so the row stays even.
            (Row COUNT still comes from liveChain — see chainRowsStyle above.) */}
        <ChainStrip
          chain={chain}
          onRemoveLast={onRemoveLast}
          disabled={!isMyTurn || isViewingHistory}
        />

        <Board
          sides={sides}
          chain={chain}
          word={isViewingHistory ? '' : word}
          onPick={onPick}
          disabled={entryDisabled || isViewingHistory}
          shakeNonce={refused && refused.value.word === word ? refused.nonce : null}
        />
      </div>

      {/* The shared RESERVED-HEIGHT swap box: it holds either the entry row
          or the slot's top message — a word result, a hint, "Chain is full",
          the terminal verdict, whichever ranks highest — and its fixed
          min-height is what stops the board above from moving as those swap
          (docs/ui.md → layout stability). An earlier version used a bare div
          here and the whole column shifted every time a pill appeared. */}
      <div
        className={cls(
          shared.moveAreaOrLocalFeedback,
          styles.entrySlot,
          // The banner is `inset: 0`, so its host must be positioned — but only
          // while viewing, so a `position` this box doesn't otherwise want
          // isn't sitting on it during play (historyViewer.module.css says so).
          isViewingHistory && history.historyBannerHost,
        )}
      >
        {isViewingHistory && (
          <HistoryBanner label={historyLabel} actor={historyActor} onExit={onExitHistory} />
        )}
        <WordEntryArea
          value={word}
          onChange={handleChange}
          onSubmit={onSubmit}
          placeholder="Type or click letters"
          // Per-character rendering, so the carried-over first letter can say
          // it isn't yours to delete.
          children={<TypedWord word={word} seedLength={seed.length} />}
          localFeedbackSlot={localFeedbackSlot}
          // Also hard-off while a past move is open: freezing capture lets the
          // viewer's `act-exit-history` consume the keystroke (back to live)
          // instead of editing the live draft behind the banner.
          disabled={entryDisabled || isViewingHistory}
          busy={busy}
          onAnyKey={localFeedbackSlot.dismiss}
          charFor={charFor}
          // No history here: a submitted word joins the chain rather than going
          // away, so there is nothing for ↑ to bring back — and ↓ could only
          // clear back to the seed, which the gate above refuses anyway.
          hasHistory={false}
        />
      </div>
    </div>
  )
}
