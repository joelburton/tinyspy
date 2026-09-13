// cs-audited-scratchpad

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
  /** null = the shared coop pad; a user id = that player's private compete pad. */
  ownerId: string | null
  myId: string
  username: string
  // The club roster, so the player holding the shared lock draws as their
  // name and disc.
  members: Member[]
}

/**
 * The per-game scratchpad floating panel — rendered at the GamePage level
 * (outside PauseBoundary, so it survives pause and shows at terminal) for
 * games whose manifest opts in. The header `<ScratchpadButton>` toggles it
 * via the shared open-state store; geometry persists per-game.
 *
 * The hook runs even while the panel is closed (background body sync + lock),
 * mirroring how chat keeps syncing when collapsed.
 */
export function GameScratchpadCompanion({ gameId, ownerId, myId, username, members }: Props) {
  const open = useIsScratchpadOpen()
  const sp = useScratchpad(gameId, ownerId, myId, username)

  if (!open) return null

  const shared = ownerId === null
  const status = sp.editingBy ? (
    <span className={styles.editing}>
      <DotActor
        actor={memberById(members, sp.editingBy.userId)}
        fallback={sp.editingBy.username}
        show="both"
      />{' '}
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
