# toasts

The bottom-right announcement stack: a store any code can push into, the one host that draws it, and the card.

## Design

docs/ui.md → Toasts says which of the app's three message surfaces gets what, and the answer turns on *whose news it is*: your own action answered where you did it is a feedback pill, other people's news is the header slot, and an announcement is a toast. This is how the code answers that.

**One store, one host, and the store is the whole interface.** `showToast(spec)` is the only way in and `dismissToast(id)` the only way out, from anywhere — a page, a hook, a watcher that renders nothing. That is what lets an invitation arriving and a game being deleted share one column in the corner instead of each inventing a place to land, and it is why `window.puptoast()` can exist at all: everything that appears passes through one function. `<ToastHost>` is mounted once at the root, because what pushes a toast is anywhere and the store is how those places reach it without a prop chain; it portals to `<body>` so no ancestor's stacking context can trap it.

**A toast is not a floating panel, and the difference is not cosmetic.** A panel is a thing you work in — you move it, you leave it open, it remembers where you put it. An announcement is something you are told: it cannot be dragged, it carries an ✕ and at most one action, and several of them stack rather than fight over the corner. The stack is capped to the viewport and scrolls inside itself, so a flood of them never makes the page scroll.

**Two lifetimes, and the default is the patient one.** With no `ms` a toast waits for a person — an invitation has to still be there when you come back to the tab, and the club's "…is setting up a game" heads-up mirrors live state, so it lasts exactly as long as that state does. A caller that wants one to leave by itself passes `ms`, usually `DEFAULT_TOAST_MS`; it is longer than a feedback pill's because a pill is already under your eyes and a toast in the corner has to be *noticed* before it can be read. Nothing applies that default for you, which is the honest spelling: omitting `ms` means no clock, not four seconds.

**The clock never fires `onClose`, and that is the load-bearing rule.** `onClose` is "the person dealt with this" — an invitation's is what marks it handled so it never returns. A toast that timed out was dealt with by nobody, so firing it would mark an invite dismissed that its recipient never saw. The same logic splits the two exits a person can take: the ✕ fires `onClose` and removes, while the action button runs and removes *without* firing it, because acting on an announcement is not dismissing it — you joined the game, and the invite drops out on its own once you are in it. The card's spec pins both directions, since getting them backwards is invisible until an invitation goes missing.

**A stable `id` makes `showToast` an upsert**, and that is what lets a reactive source own a toast without tracking one. Pushing the same id replaces the card in place, keeping its position in the stack; a watcher can re-run its whole list on every change and each toast simply refreshes. The invitation watcher works exactly this way.

**Tone is cosmetic and says nothing.** It colors the left stripe and nothing else, because a toast is an announcement rather than a verdict — the meaning is in the words. The stripe's width is `--toast-stripe-width` rather than the frame width it happens to equal: a frame encloses a thing, and this marks one edge.
