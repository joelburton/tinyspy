// cs-audited-definitions

import { useState } from 'react'
import { DefinitionPopover } from './DefinitionPopover'

/**
 * Click-to-define for a surface that shows words: call this once per surface,
 * spread `define` onto each word, and drop `popover` into the render.
 *
 * `define(word, el)` opens the popover for `word`, anchored under `el` (pass the
 * clicked element, usually `e.currentTarget`); `popover` is the element to
 * render, null when nothing is being defined. The lookup itself is
 * `<DefinitionPopover>`'s; this hook only owns the open/anchor/close state.
 *
 *   const { define, popover } = useDefinePopover()
 *   <span onClick={(e) => define(word, e.currentTarget)}>{word}</span>
 *   {popover}
 */
export function useDefinePopover() {
  // The word currently being defined + the element it anchors under (null = idle).
  const [defining, setDefining] = useState<{ word: string; rect: DOMRect } | null>(
    null,
  )

  const define = (word: string, el: HTMLElement) =>
    setDefining({ word, rect: el.getBoundingClientRect() })

  const popover = defining ? (
    <DefinitionPopover
      initialWord={defining.word}
      anchorRect={defining.rect}
      onClose={() => setDefining(null)}
    />
  ) : null

  return { define, popover }
}
