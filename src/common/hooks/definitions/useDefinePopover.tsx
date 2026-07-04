import { useState } from 'react'
import { DefinitionPopover } from '../../components/definitions/DefinitionPopover'

/**
 * Click-to-define plumbing, shared by every word game that lets you tap a word
 * to look it up (waffle's answer reveal, spellingbee / boggle word lists,
 * stackdown's found words, scrabble's play log). Each of those independently
 * carried the same three lines — a `{ word, rect }` state, a setter that grabs
 * the clicked element's bounding rect, and a `<DefinitionPopover>` anchored to
 * it — so it lives here once.
 *
 * `define(word, el)` opens the popover for `word`, anchored under `el` (pass the
 * clicked element, usually `e.currentTarget`); `popover` is the element to drop
 * into the render (null when nothing's being defined). The popover itself —
 * the read-through cache → Wiktionary lookup — is the shared `DefinitionPopover`;
 * this hook only owns the open/anchor/close state.
 *
 *   const { define, popover } = useDefinePopover()
 *   <button onClick={(e) => define(word, e.currentTarget)}>{word}</button>
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
