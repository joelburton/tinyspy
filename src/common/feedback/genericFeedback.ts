// cs-unmet

import type { ReactNode } from 'react'
import type { Outcome } from '../outcomes/outcomes'

/**
 * What a feedback pill IS — the message shape every surface that shows one
 * accepts, and the two-call API for putting one up.
 *
 * Reach for this when a surface needs to SAY something transient: a board
 * reporting a move, a header narrating a peer, a club page acknowledging a
 * chat. `GenericFeedbackMsg` is the message; `GenericFeedbackApi` is the
 * handle you're given to show and clear one — a PlayArea receives it as
 * `globalFeedback` on its `GamePageCtx`, and the below-board slot is reached
 * through `useLocalFeedback`.
 *
 * What each mode means and when to pick it is documented on `mode` below;
 * docs/ui.md → Feedback pill has the rendering half. The three ready-made
 * below-board shapes live in `lib/game/localPills.ts`, and the mapping from a
 * server answer to one of these is `lib/game/genericPills.ts`.
 */

/** A single feedback message. The `dismiss` mode picks how it
 *  leaves the screen. See docs/ui.md → "Dismiss modes" for the
 *  detailed when-to-use guidance. */
export type GenericFeedbackMsg = {
  tone: Outcome
  // The message. Usually a plain string; a `ReactNode` is allowed so a message
  // can embed an inline icon (e.g. bananagrams' dump pill leads with the
  // exchange glyph, matching its dump zone).
  text: ReactNode
  // Optional leading identity disc — the actor's profile-color NAME
  // ('red' … 'pink'), rendered as the shared `<Dot>` (fill + paired border)
  // before the text: the identity anchor for group/peer messages
  // ("(disc) leah found APPLE"). `null` still shows a disc (the neutral
  // fallback — an unresolvable member); ABSENT shows none. See docs/ui.md →
  // "Player identity = a colored disc".
  dot?: string | null
  // What KIND of message this is — which decides both how it goes away and how
  // it looks. One field, four values, no impossible combinations:
  //
  //   - **`sticky`** — "make sure they see this". Stays until something
  //     replaces it or the player acts: a keystroke, a tile click, or a tap on
  //     the pill. The common case for an own-move result ("Not a word").
  //   - **`timed`** — self-clears after `ms` (each surface has its own
  //     default). A tap dismisses it early. Peer narration, acknowledgements.
  //   - **`manual`** — an × is the ONLY way out; a keystroke or a tap on the
  //     body won't do it. For the rare message the player should actively
  //     acknowledge (stackdown's revealed-word spoiler, which has to linger
  //     while they hunt).
  //   - **`permanent`** — a standing condition, not a message: the terminal
  //     verdict, or "Conceded — race continues". Nothing dismisses it; only a
  //     later pill REPLACES it (out-of-race gives way to the final verdict).
  //     Renders with the tinted background that says "this is the state now".
  mode:
    | { kind: 'sticky' }
    | { kind: 'timed'; ms?: number }
    | { kind: 'manual' }
    | { kind: 'permanent' }
}

/**
 * The handle for putting a pill up and taking it down — what a surface hands
 * you so you can speak without knowing where the words land.
 *
 * A PlayArea receives one as `globalFeedback` on its `GamePageCtx`; the hooks
 * that narrate peers (`useGlobalFeedback`, `useChatFeedback`) take one as a
 * parameter. Two surfaces supply it today — `GamePage` for the header slot and
 * `ClubPage` for its own — and a caller cannot tell them apart, which is the
 * point of the shape.
 *
 * **It is ONE slot, so `show` REPLACES.** There is no queue and no stacking:
 * the newest message is the only message, and a second `show` in the same beat
 * means the first was never read. Ordering is the caller's problem — that is
 * what `mode: 'permanent'` above is for, since only a later pill supersedes it.
 *
 * `clear()` empties the slot, and the surface goes back to whatever it shows by
 * default (on GamePage, the players strip).
 *
 * **Both functions keep a stable identity across renders**, so they are safe in
 * a dependency array — each surface builds them with `useCallback` and memoizes
 * the pair. Depending on the API object rather than on `show` is equally fine.
 */
export type GenericFeedbackApi = {
  show: (msg: GenericFeedbackMsg) => void
  clear: () => void
}
