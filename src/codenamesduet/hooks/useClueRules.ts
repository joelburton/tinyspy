// cs-unmet

import { useState } from 'react'
import { readStored, writeStored } from '@/common/web-storage/storage'
import type { GGameData } from '../types'

/**
 * The clue rules companion (`ClueRulesCompanion`): whether it is open, and the
 * two ways it changes.
 *
 * It opens on its own once per game for each player — on turn 1 of a running
 * game, unless this browser has seen it dismissed for this game — and again
 * whenever the info column's "Rules for clues" link asks. Closing it, by its ✕,
 * is what marks it seen. Without storage it opens on every turn-1 load,
 * which costs a click and nothing else.
 */
export function useClueRules(gd: GGameData): {
  isOpen: boolean
  open: () => void
  close: () => void
} {
  const seenKey = `puzpuzpuz:codenamesduet:clueRulesSeen:${gd.id}`
  // Read once, at mount: the start of the game is a moment, so a page opened
  // later in the game does not pop it.
  const [isOpen, setIsOpen] = useState(() =>
    !gd.ended && gd.turns.num === 1 && readStored('local', seenKey, null) === null)

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => {
      writeStored('local', seenKey, '1')
      setIsOpen(false)
    },
  }
}
