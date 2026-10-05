// cs-unmet

import { useState } from 'react'
import { canFollow, joinSides, tailLetter } from '../lib/board'
import type { GGameData } from '../types'

/**
 * The word being typed, from the keyboard or the board's letters.
 *
 * Once the chain has a word, the next one MUST start with that word's last
 * letter, so the entry seeds itself with it and won't let it be deleted. Only
 * the letters the player added are held (`draft`); the word is the seed + the
 * draft, derived every render, so playing a word re-seeds the entry with no
 * effect and no stale state.
 *
 * Two keystrokes never land: one that would delete the seed, and an appended
 * letter on the same side of the box as the one before it — refusing the key
 * says so at once, where letting it in would make the player type a word they
 * can already see is wrong. Deletions always go through, and only the board's
 * letters may be typed at all (`charFor`).
 *
 * Every edit calls `onEdit`, so a refusal cannot outlive the word it was
 * about. `submit` hands the word to `sendWord` and empties the draft only once
 * the word has landed: a refused word stays to be fixed.
 */
export function useTypedWord({
  gd,
  sendWord,
  onEdit,
}: {
  gd: GGameData
  // Resolves to whether the word landed (`useChainMove`).
  sendWord: (word: string) => Promise<boolean>
  onEdit: () => void
}): {
  // The seed, then the draft.
  word: string
  // The tail letter the word must start with; empty on an empty chain.
  seed: string
  // The entry's whole intended value, through the two gates above.
  edit: (next: string) => void
  appendLetter: (letter: string) => void
  // Only the board's letters may be typed.
  charFor: (key: string) => string | null
  submit: () => Promise<void>
  // Back to the bare seed, after the chain moved.
  clear: () => void
} {
  // What I have typed after the seed letter the chain hands me — the part of
  // the word that is mine to edit.
  const [draft, setDraft] = useState('')
  const seed = tailLetter(gd.me.board.words) ?? ''
  const word = seed + draft
  const sides = joinSides(gd.puzzle.tiles)

  function edit(next: string) {
    if (!next.startsWith(seed)) return
    if (next.length > word.length && !canFollow(sides, next.at(-2), next.at(-1)!)) return
    onEdit()
    setDraft(next.slice(seed.length))
  }

  function appendLetter(letter: string) {
    onEdit()
    setDraft((d) => d + letter)
  }

  function charFor(key: string) {
    const c = key.toLowerCase()
    return Object.hasOwn(gd.puzzle.tilesById, c) ? c : null
  }

  async function submit() {
    if (await sendWord(word)) setDraft('')
  }

  return { word, seed, edit, appendLetter, charFor, submit, clear: () => setDraft('') }
}
