// cs-blessed-scratchpad

import { Companion } from '../floating-panels/Companion'
import { StandardButton } from '../buttons/StandardButton'
import { setScratchpadOpen, useIsScratchpadOpen } from './scratchpadOpenStore'
import { useScratchpad } from './useScratchpad'
import { handOffKeyboardOnTab } from '../keyboard/keyboardHandoff'
import { DotActor } from '../members/ActorMention'
import { memberById } from '../members/memberList'
import type { Member } from '../members/member'
import styles from './GameScratchpadCompanion.module.css'

type Props = {
  gameId: string
  // null = the shared coop pad; a user id = that player's private compete pad.
  ownerId: string | null
  myId: string
  // The club roster, which names the player holding the shared lock.
  members: Member[]
}

/**
 * The game's scratchpad panel. GamePage mounts it, outside the pause
 * boundary, for a game whose manifest opts in, and leaves it mounted for the
 * life of the page: closed it renders nothing, while `useScratchpad` keeps
 * the body and the lock in sync underneath. The header mark and `⌥S` flip
 * the shared `scratchpadOpenStore`; the rect is remembered per game.
 *
 * Open, it is a `<Companion>` with two parts: a status line — whose pad this
 * is, or who is editing it and, once they have gone idle, a way to take
 * over — and the textarea, read-only while someone else holds the lock.
 */
export function GameScratchpadCompanion({ gameId, ownerId, myId, members }: Props) {
  const open = useIsScratchpadOpen()
  const sp = useScratchpad(gameId, ownerId, myId)

  if (!open) return null

  const shared = ownerId === null
  const status = sp.editingBy ? (
    <span className={styles.editing}>
      {/* A miss is a member who left the club mid-game: the mark's own
          "someone". */}
      <DotActor actor={memberById(members, sp.editingBy)} show="both" />{' '}
      is editing…
    </span>
  ) : shared ? (
    'Shared with the table.'
  ) : (
    'Private to you.'
  )

  return (
    <Companion
      title="Scratchpad"
      onClose={() => setScratchpadOpen(false)}
      persistKey={`puzpuzpuz:scratchpad:rect:${gameId}`}
      defaultPosition="center"
      defaultSize={{ width: 320, height: 360 }}
      // The floor is what the body needs: the titlebar, the status line and a
      // few lines of notes.
      minHeight={200}
    >
      <div className={styles.lockBar}>
        <span>{status}</span>
        {sp.canTakeOver && (
          <StandardButton
            small
            show="label"
            weight="secondary"
            tone="quiet"
            label="Take over"
            onClick={sp.takeOver}
          />
        )}
      </div>
      <textarea
        className={styles.textarea}
        value={sp.body}
        onChange={(e) => sp.setBody(e.target.value)}
        // Tab hands the keyboard back to the game rather than walking out of
        // the panel — same contract as the chat box. Shift+Tab stays native.
        onKeyDown={handOffKeyboardOnTab}
        readOnly={!sp.canEdit}
        maxLength={10000}
        placeholder={shared ? 'Shared notes…' : 'Your private notes…'}
        aria-label="Scratchpad"
      />
    </Companion>
  )
}
