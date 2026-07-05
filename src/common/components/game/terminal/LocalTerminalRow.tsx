import type { ReactNode } from 'react'
import { cls } from '../../../lib/util/cls'
import shared from '../PlayArea.module.css'

type Props = {
  /** The neutral status line — "You conceded" / "Waiting for others" / "You're out" /
   *  "Solved — waiting" / "Watching — not in this game", per game + sub-state. */
  label: ReactNode
  /** The trailing action, if any: usually the now-inert Concede (or the live
   *  End/Concede in the games that reuse one `endButton` for both rows). Optional —
   *  waffle's "watching" state is a bare status line with no button. */
  children?: ReactNode
}

/**
 * The info column's LOCALLY-TERMINAL action row — the neutral-toned twin of
 * <TerminalActionRow>. When a compete player has dropped out (conceded / out of
 * moves / solved-and-waiting) but the game is still LIVE for the others, the slot
 * takes the terminal LOOK — a bold neutral status line + (usually) the now-inert
 * action — so the state change reads loudly rather than as a silently-swapped help
 * line. The `over ?` branch renders <TerminalActionRow>; this is the "I'm done, the
 * others race on" branch that every InfoCol's middle case duplicated.
 *
 * Only the wrapper + the neutral tone are shared here: the status text and the
 * trailing action genuinely differ per game (game-specific copy; a disabled Concede
 * in some, the live End/Concede in others), so those are `label` + `children`.
 */
export function LocalTerminalRow({ label, children }: Props) {
  return (
    <div className={cls(shared.infoActions, shared.terminalActions)}>
      <span className={cls(shared.outcome, shared.outcome_neutral)}>{label}</span>
      {children}
    </div>
  )
}
