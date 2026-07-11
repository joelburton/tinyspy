import { useCallback, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../../components/panels/ConfirmDialog'

export type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
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
