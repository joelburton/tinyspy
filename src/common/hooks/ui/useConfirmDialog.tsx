import { useCallback, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../../components/panels/ConfirmDialog'

export type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmLabel: string
  /** Omit for "Cancel"; pass **null** for a one-button NOTICE (no question to
   *  answer — connections' "no unplayed puzzles left" uses this). */
  cancelLabel?: string | null
}

type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void }

/** The canonical end-game confirm — one copy object so every game's End (the
 *  info-row button, the menu item, the pause overlay's escape hatch) asks the
 *  identical question. Ending is the one always-confirmed act: it's terminal
 *  for the whole group, even solo/coop (unlike suspend, which is confirmed
 *  only when there are peers to surprise). */
export const END_GAME_CONFIRM: ConfirmOptions = {
  title: 'End this game?',
  message: "This ends the game for everyone — you can't undo it.",
  confirmLabel: 'End game',
  cancelLabel: 'Keep playing',
}

/**
 * The canonical new-game confirm, asked only while a game is still in progress
 * (at terminal there's nothing to interrupt, so New game goes straight through).
 *
 * Starting a new game does NOT end this one: `create_game` clears the club's
 * current-view flag on the old row, which stays in `common.games` and can be
 * resumed from the club page — the same "shelved" language ClubPage already
 * uses. So the copy REASSURES rather than warns: the point is that someone who
 * hits `+` by accident doesn't think they just lost their game. Deliberately
 * not phrased like END_GAME_CONFIRM's "you can't undo it", which would be
 * false here.
 */
export const NEW_GAME_CONFIRM: ConfirmOptions = {
  title: 'Start a new game?',
  message:
    'The game in progress will be shelved, not lost — you can resume it from the club page whenever you like.',
  confirmLabel: 'Start new game',
  cancelLabel: 'Keep playing',
}

/**
 * The canonical restart confirm, asked only while a game is still IN PROGRESS —
 * at terminal there's nothing left to lose, so Restart goes straight through.
 *
 * Mid-game it's the most destructive thing in the app after End: it wipes the
 * group's progress on a board they're still playing, for everyone at once, and
 * unlike End it leaves no trace that it happened. So the copy WARNS, in
 * END_GAME_CONFIRM's register rather than NEW_GAME_CONFIRM's reassuring one.
 *
 * Deliberately generic — the per-game sentence ("this clears the grid and
 * everyone's score") went away when Restart became the same act in all thirteen
 * games. What's being wiped is visible on the board in front of you; what isn't
 * obvious, and what this says, is that it hits *everyone*.
 */
export const RESTART_CONFIRM: ConfirmOptions = {
  title: 'Restart this game?',
  message:
    "This clears everyone's progress and starts the same board again — you can't undo it.",
  confirmLabel: 'Restart',
  cancelLabel: 'Keep playing',
}

/**
 * `window.confirm`, but the styled `<ConfirmDialog>` modal — the drop-in for
 * game action handlers:
 *
 *     const { confirm, confirmDialog } = useConfirmDialog()
 *     const handleEndGame = async () => {
 *       if (!(await confirm({ title: 'End this game?', … }))) return
 *       …the RPC…
 *     }
 *     // and render {confirmDialog} anywhere in the tree
 *
 * The promise resolves true on confirm, false on Cancel/Esc/✕. `confirm`'s
 * identity is stable, so it's safe in useCallback deps. A second confirm()
 * while one is pending replaces it (the first resolves false) — can't
 * happen from a modal-blocked UI, but it beats a dangling promise. If the
 * component unmounts mid-question the promise never settles; callers are
 * fire-and-forget async handlers, so nothing leaks or retries.
 */
export function useConfirmDialog(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  confirmDialog: ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending((prev) => {
          prev?.resolve(false) // a superseded question answers "no"
          return { ...opts, resolve }
        })
      }),
    [],
  )

  const settle = (confirmed: boolean) => {
    setPending((prev) => {
      prev?.resolve(confirmed)
      return null
    })
  }

  const confirmDialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, confirmDialog }
}
