// cs-blessed-menu

/**
 * How to open the page's menu, so the `?` key can reach it without the page
 * acting as a courier: `PageHeaderMenu` registers its menu here, and
 * `act-open-menu` (bound once in `AppActionsHost`) opens whatever is
 * registered. A slot, not a store anything subscribes to — the only reader is
 * a keydown handler, which asks at the moment the key is pressed; doc.md →
 * Design says why one slot is safe.
 *
 * **A missing menu is a no-op, deliberately.** Every real page has a header
 * and so a menu; what has none is the sign-in gate, a loading screen, the
 * moment between one page's release and the next's claim. `?` there finds
 * nothing registered and does nothing.
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
