// cs-unmet

/**
 * The page's menu, so a keyboard shortcut can open it without the page acting
 * as a courier: `PageHeaderMenu` registers its menu here, and `act-open-menu`
 * (bound once in `AppActionsHost`) opens whatever is registered.
 *
 * **Why a module slot is safe here.** One page is mounted at a time and a page
 * has one header menu, so there is nothing to arbitrate. That is the same
 * structural argument `infoSheetStore` makes, and the same shape: a slot, not a
 * store anything subscribes to. Nothing re-renders when this changes — the only
 * reader is a keydown handler, which asks at the moment the key is pressed.
 *
 * **A missing menu is a no-op, deliberately.** GamePage's menu unmounts while
 * the game is paused (PlayArea's cleanup clears its sections), so `?` during a
 * pause finds nothing registered and does nothing.
 */

let open: (() => void) | null = null

/**
 * Claim the slot, and return the release. Call it from an effect so the release
 * runs on unmount:
 *
 *     useEffect(() => registerPageMenu(() => ref.current?.open()), [])
 *
 * The release checks identity before clearing, so a page that mounts its
 * replacement before unmounting the old one cannot blank the new registration.
 */
export function registerPageMenu(openMenu: () => void): () => void {
  open = openMenu
  return () => {
    if (open === openMenu) open = null
  }
}

/** Open the page's menu, if there is one. */
export function openPageMenu(): void {
  open?.()
}
