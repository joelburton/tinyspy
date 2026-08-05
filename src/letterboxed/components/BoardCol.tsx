import { useCallback, useMemo, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { terminalPill } from '../../common/lib/game/localPills'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { ActionButton } from '../../common/components/buttons/ActionButton'
import { IconClear, IconUndo } from '../../common/components/icons'
import { Board } from './Board'
import { tailLetter } from '../lib/board'
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
 * ── Undo / Clear ─────────────────────────────────────────────────────────────
 * Both sit here rather than in the info column because on a phone the info
 * column is off-canvas, and undo is the move you need exactly when you are
 * stuck. They are always rendered — disabled, never removed, so nothing
 * reflows when the chain empties (docs/ui.md → layout stability).
 */
export function BoardCol({
  sides,
  chain,
  draft,
  onDraftChange,
  onSubmit,
  onPick,
  onUndo,
  onClear,
  clearAllowed,
  clearLocalFeedback,
  entryDisabled,
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
  onUndo: () => void
  onClear: () => void
  /** Clear is refused server-side in turn-by-turn co-op; the button says why
   *  rather than vanishing. */
  clearAllowed: boolean
  clearLocalFeedback: () => void
  /** Terminal / conceded / not my turn: board + entry are inert. */
  entryDisabled: boolean
  busy: boolean
  localPill: GenericFeedbackMsg | null
  over: (TerminalCopy & { verdictNode?: ReactNode }) | null
}) {
  const seed = tailLetter(chain) ?? ''
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

  // EntryRow hands back the whole intended value. Anything that doesn't still
  // begin with the seed is an attempt to backspace through it — ignored.
  const handleChange = useCallback(
    (next: string) => {
      if (!next.startsWith(seed)) return
      onDraftChange(next.slice(seed.length))
    },
    [seed, onDraftChange],
  )

  const chainFull = chain.length === 0

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <Board
        sides={sides}
        chain={chain}
        word={word}
        onPick={onPick}
        disabled={entryDisabled}
      />

      <div className={styles.entrySlot}>
        <EntryRow
          value={word}
          onChange={handleChange}
          onSubmit={onSubmit}
          placeholder={seed ? `starts with ${seed.toUpperCase()}` : 'any letter'}
          pill={localPill}
          disabled={entryDisabled}
          busy={busy}
          onAnyKey={clearLocalFeedback}
          charFor={charFor}
        />
      </div>

      {/* Chain-level actions. Undo is the escape from a dead-ended chain, so it
          lives next to the board on every screen size. */}
      <div className={styles.chainActions}>
        <ActionButton
          icon={IconUndo}
          label="Undo"
          onClick={onUndo}
          disabled={entryDisabled || chainFull}
          tooltip="Take back the last word"
        />
        <ActionButton
          icon={IconClear}
          label="Clear"
          onClick={onClear}
          disabled={entryDisabled || chainFull || !clearAllowed}
          tooltip={
            clearAllowed
              ? 'Start the chain over'
              : 'Not available in turn-by-turn co-op — undo instead'
          }
        />
      </div>

      {over && (
        <div className={styles.verdictSlot}>
          <GenericFeedbackPill
            msg={terminalPill(over.tone, over.verdictNode ?? over.verdict)}
            onClose={() => {}}
          />
        </div>
      )}
    </div>
  )
}
