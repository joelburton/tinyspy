// cs-blessed-game-page

import type { ReactNode } from 'react'
import { Companion } from '../floating-panels/Companion'
import { KeyList } from '../actions/KeyList'
import { HELP_RECT_KEY } from '../floating-panels/FloatingPanel'

type Props = {
  // The game's user-facing brand — the title reads "How to play {brand}".
  brand: string
  onClose: () => void
  // Panel size; defaults to a middle size that fits most rules. A game whose
  // rules run longer or shorter passes its own, to avoid scroll or whitespace.
  size?: { width: number; height: number }
  minSize?: { width: number; height: number }
  // The game's rules, as written.
  children: ReactNode
}

/**
 * The shared help frame every game's `Help.tsx` renders its rules into — the
 * `FloatingPanel`, the uniform "How to play {brand}" title, and the key list
 * (docs/ui.md → "The keys in Help"). A game's `Help` is its rules and nothing
 * else; the chrome is identical everywhere because it is this file.
 *
 * **It closes by its ✕ and nothing else**, like every other companion — the
 * club's help twin, the crosswords note and explain panels, chat. No "Got it":
 * a companion is the shape you put away, not one that asks you a question.
 */
export function GameHelpCompanion({
  brand,
  onClose,
  size = { width: 460, height: 400 },
  minSize = { width: 300, height: 240 },
  children,
}: Props) {
  return (
    <Companion
      // Loose, against the companion default: this is a page to READ, and
      // text packed tight against the window edge is harder to read.
      density="loose"
      // Help STATES OTHERWISE, the way chat does: a companion by every test, but
      // summoned from things — including the setup modal — so it takes the top
      // of the floating-window world rather than the companion rung. Without
      // this the rules open BEHIND the form you pressed "?" in.
      zIndex="var(--z-help)"
      persistKey={HELP_RECT_KEY}
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={size}
      minWidth={minSize.width}
      minHeight={minSize.height}
    >
      {children}
      {/* The keys that work on this page, generated from what is bound. */}
      <KeyList />
    </Companion>
  )
}
