// cs-unmet

import { useEffect, useRef } from 'react'
import { setIsChatPanelOpen } from './chatPanelOpenStore'
import type { ClubMessage } from './useClubChat'

type OpenOnImportantMessageOptions = {
  messages: ClubMessage[]
  loading: boolean
}

/**
 * Opens the chat panel when a message starting with `!` arrives — one that
 * arrives while the page is open, never one already in the log when it loads,
 * so an old `!` doesn't pop the panel every time someone comes in.
 */
export function useOpenOnImportantMessage({
  messages,
  loading,
}: OpenOnImportantMessageOptions): void {
  // The newest message already looked at; null until the first load settles.
  const lastSeenIdRef = useRef<string | null>(null)
  const isInitializedRef = useRef(false)

  useEffect(function openOnImportantMessage() {
    if (loading) return
    const latest = messages.at(-1)
    if (!isInitializedRef.current) {
      // The first load: what is already here counts as seen.
      lastSeenIdRef.current = latest?.id ?? null
      isInitializedRef.current = true
      return
    }
    if (!latest || latest.id === lastSeenIdRef.current) return
    lastSeenIdRef.current = latest.id
    if (latest.content.startsWith('!')) setIsChatPanelOpen(true)
  }, [messages, loading])
}
