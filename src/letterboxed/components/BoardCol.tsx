import { useCallback, useMemo, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { Board } from './Board'
import { ChainStrip } from './ChainStrip'
import { TypedWord } from './TypedWord'
import { canFollow, tailLetter } from '../lib/board'
import shared from '../../common/components/game/PlayArea.module.css'
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
  draft,
  onDraftChange,
  onSubmit,
  onPick,
  onRemoveLast,
  clearLocalFeedback,
  entryDisabled,
  chainEditable,
  chainFull,
  busy,
  localPill,
  over,
}: {
  sides: string
  /** Words played so far. */
  chain: string[]
  /** Only the letters the PLAYER added — the seed is derived, see above. */
  draft: string
  onDraftChange: (next: string) => void
  onSubmit: () => void
  /** A letter was clicked on the board. */
  onPick: (letter: string) => void
  /** The × on the chain's last word. */
  onRemoveLast: () => void
  clearLocalFeedback: () => void
  /** Terminal / conceded / not my turn / chain full: board + entry are inert. */
  entryDisabled: boolean
  /** May the chain still be edited? Deliberately NOT `!entryDisabled`: when the
   *  chain is full the entry freezes but the × must stay live, since taking a
   *  word back is then the only move on the board. */
  chainEditable: boolean
  /** The cap is reached and the board isn't covered — the only move left is
   *  taking a word back, so the entry gives way to a pill saying so. */
  chainFull: boolean
  busy: boolean
  localPill: GenericFeedbackMsg | null
  over: (TerminalCopy & { verdictNode?: ReactNode }) | null
}) {
  const seed = tailLetter(chain) ?? ''
  const word = seed + draft

  // What occupies the swap box, most-final first. The terminal verdict wins
  // over everything; a full chain is next, because until a word comes back off
  // there is no move to make and the entry would only collect a word it must
  // then refuse.
  const pill = over
    ? terminalPill(over.tone, over.verdictNode ?? over.verdict)
    : chainFull
      ? stickyPill('neutral', 'Chain is full — remove a word')
      : localPill

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

  // EntryRow hands back the whole intended value; this is the one gate it
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

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      {/* The chain reads ABOVE the board: it is the state, and it says what
          letter the next word must start with. On a phone the info column is
          off-canvas, so a per-turn readout can't live there. */}
      <ChainStrip chain={chain} onRemoveLast={onRemoveLast} disabled={!chainEditable} />

      <Board
        sides={sides}
        chain={chain}
        word={word}
        onPick={onPick}
        disabled={entryDisabled}
      />

      {/* The shared RESERVED-HEIGHT swap box: it holds exactly one of the
          entry row, an own-move pill, or the terminal verdict, and its fixed
          min-height is what stops the board above from moving as those swap
          (docs/ui.md → layout stability). An earlier version used a bare div
          here and the whole column shifted every time a pill appeared. */}
      <div className={cls(shared.moveAreaOrLocalFeedback, styles.entrySlot)}>
        <EntryRow
          value={word}
          onChange={handleChange}
          onSubmit={onSubmit}
          placeholder="Type or click letters"
          // Per-character rendering, so the carried-over first letter can say
          // it isn't yours to delete.
          children={<TypedWord word={word} seedLength={seed.length} />}
          pill={pill}
          disabled={entryDisabled}
          busy={busy}
          onAnyKey={clearLocalFeedback}
          charFor={charFor}
        />
      </div>
    </div>
  )
}
