// cs-unmet

import { useState } from 'react'
import { useBindAction } from '../actions/useBindAction'
import { useAccountMenuSection } from '../account/useAccountMenuSection'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/useFeedbackSlot'
import type { MenuSection } from '../menu/menuModel'
import { navigate } from '../routing/router'

type ClubPageActionsOptions = {
  // Where "Rename club" says it is coming soon.
  globalFeedbackSlot: FeedbackSlot
}

/** A dialog the club menu opens. */
type MenuDialog = {
  isOpen: boolean
  close: () => void
}

/**
 * Binds the club page's actions and returns the club menu built from them,
 * with the two dialogs its rows open.
 *
 * - **Help** opens the club's Help companion.
 * - **Back to home** goes to the club list; it is the club page's "up a level",
 *   as Back to club is a game page's.
 * - **Edit club** opens the club editor.
 * - **Rename club** is a placeholder that says it is coming soon.
 *
 * The menu is these rows, then the account section, as on every page.
 */
export function useClubPageActions({
  globalFeedbackSlot,
}: ClubPageActionsOptions): {
  // The club menu's sections (menu/doc.md).
  menuSections: MenuSection[]
  help: MenuDialog
  editClub: MenuDialog
} {
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isEditClubOpen, setIsEditClubOpen] = useState(false)
  const accountSection = useAccountMenuSection()

  const actHelp = useBindAction('act-help', {
    describe: () => 'active',
    run: () => setIsHelpOpen(true),
  })
  const actBackToHome = useBindAction('act-back-to-home', {
    describe: () => 'active',
    run: () => navigate('/'),
  })
  const actEditClub = useBindAction('act-edit-club', {
    describe: () => 'active',
    run: () => setIsEditClubOpen(true),
  })
  const actRenameClub = useBindAction('act-rename-club', {
    describe: () => 'active',
    run: () => {
      globalFeedbackSlot.show(
        FeedbackMessage.acknowledgment('noted', 'Rename club: coming soon'))
    },
  })

  return {
    menuSections: [
      { items: [actHelp, actBackToHome, actEditClub, actRenameClub] },
      accountSection,
    ],
    help: { isOpen: isHelpOpen, close: () => setIsHelpOpen(false) },
    editClub: { isOpen: isEditClubOpen, close: () => setIsEditClubOpen(false) },
  }
}
