// cs-unmet

import { FloatingPanel, type FloatingPanelProps } from './FloatingPanel'

/**
 * A DIALOG — a floating window you summoned to do one thing, which stays where
 * you put it: the anagram finder, the word lookup, the word editor.
 *
 * It does not dim the page. That is the line between a dialog and a modal here:
 * a dialog is a tool open beside your work, so the page underneath stays live
 * and you can leave it open. A modal claims the page until you deal with it.
 *
 * Against a COMPANION, which is the same shape and the same behavior, the
 * difference is the stacking tier — help and chat open ABOVE a dialog, so
 * pressing `?` inside one shows the rules rather than opening behind it.
 *
 * What a dialog IS — the scrim, the drag, the focus trap, the escape rule, the
 * tier — is `FloatingPanel`'s `FAMILY` table, in one place so the claims cannot
 * drift apart. This supplies the family name and nothing else.
 */
export function Dialog(props: Omit<FloatingPanelProps, 'family'>) {
  return <FloatingPanel family="dialog" {...props} />
}
