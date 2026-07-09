# Mobile

The record of the mobile-appearance pass — what "mobile-ready" means here, the
shared breakpoint convention, what's been done so far, and what's deliberately
left for later.

This is the "real mobile pass" that [`ui.md → Audience and platform:
desktop-first`](ui.md#audience-and-platform-desktop-first) named as a future
project. It's now underway, one screen at a time. The desktop-first posture
still holds: **most players are on a laptop/desktop**, so the desktop layout
stays the default and mobile is expressed as an *exception* layered on top —
never mobile-first.

## The rules of this pass

- **Desktop-first, always.** Mobile styles are `@media (max-width: …)` overrides
  on top of the desktop rules. We never rewrite a layout mobile-first with
  `min-width` overlays. A mobile change must not alter the desktop layout at all.
- **The invariant that must survive on a phone: [the page never
  scrolls](ui.md#page-height-fits-the-viewport).** Every screen fits the
  viewport; growth-prone regions scroll inside their own frames, not the
  document. The most common way a narrow screen breaks this is **horizontal**
  overflow — a wide row, a fixed two-column body, or a long unbreakable text
  token forcing the page wider than the viewport. Verify no-scroll headless at a
  phone width before declaring a screen done (see
  [testing](testing.md) — a Playwright render + a `scrollWidth <= innerWidth`
  assertion; a jsdom test can't catch layout width bugs).
- **Graceful, not pixel-perfect.** We make the screen usable and un-scrolled on a
  phone; we don't chase a bespoke mobile design for every component.

## The breakpoint

**`56.25rem` (900px) is the single desktop→mobile line for the whole app.** Below
it: phones and portrait tablets (an iPad in portrait is 768–834px). At or above
it: landscape tablets and desktops keep the full desktop layout. There is one
breakpoint on purpose — a screen either gets the desktop layout or the mobile
one, and every component agrees on where that switch happens.

It was first established in
[`ClubPage.module.css`](../src/common/components/club/ClubPage.module.css); every
mobile override since reuses the same value. CSS can't share a media-query
constant without a build step, so the number is repeated with a comment pointing
back here — grep `56.25rem` to find every mobile override.

## What's been done

### Club page — tabs instead of two columns

[`ClubPage`](../src/common/components/club/ClubPage.tsx) is a two-column body on
desktop (left = active game + start-a-new-game; right = completed/shelved list).
On a phone the two columns are too cramped, so below the breakpoint the body
becomes a **single column with a tab switcher**: a "New game" tab (the left
column) and a "Completed/shelved (N)" tab (the right column). Only the selected
column renders, so the page still fits the viewport. The tab bar is
`display: none` on desktop, where both columns show side by side unchanged. State
lives in `mobileTab`; a `data-tab` attribute on the body drives the CSS that
hides the inactive column.

### Player strip — dots only on mobile

[`PlayersStrip`](../src/common/components/game/PlayersStrip.tsx) (the header's
"who's playing, what color is who" row, shared by the club page and every game
page) shows a colored dot + username per player. Usernames are variable-length
and can be long handles; on a narrow header they overflow and scroll the page.
Below the breakpoint the strip **drops to dots only** — the dot already carries
the whole signal (color = which player, filled/hollow = present/away), so the
name is the droppable half. Desktop still shows names.

### The `.card` shell pages — home / login / claim-username

The three shell screens ([`HomePage`](../src/common/components/home/HomePage.tsx),
[`LoginScreen`](../src/common/components/auth/LoginScreen.tsx),
[`ClaimHandleScreen`](../src/common/components/auth/ClaimHandleScreen.tsx)) all
render inside the global `.card` (in [`theme.css`](../src/common/theme.css)). Two
fixes made them phone-safe:

- **`overflow-wrap: anywhere` on `.card`.** Long *unbreakable* tokens — a long
  username in the "Welcome, …" heading, an email, a solo club's `=handle` — have
  no break opportunity, so they set the card's max-content width and push it past
  a narrow viewport. Allowing a break inside such tokens keeps the card within
  the screen. It only bites words that genuinely can't fit the line, so normal
  prose (and the whole desktop experience) is untouched. A 30-char username would
  have overflowed the desktop card too, so this is general robustness, not a
  mobile-only patch.
- **Trimmed card padding on mobile** (`2rem` → `1.5rem`/`1.25rem` below the
  breakpoint) so a narrow screen isn't eaten by padding.
- The home "SOLO" pill is pinned to `white-space: nowrap` so the new card-level
  wrap can't split its label into "SOL / O".

## TODO — not doing now, recorded so we don't lose them

These two caps attack the overflow problem at the *source* rather than papering
over it with wrapping/truncation. Long user-supplied strings are the main thing
that threatens the no-scroll invariant on a narrow screen (see the `.card` and
player-strip notes above); bounding their length makes the whole app calmer on
mobile and tightens the rosters, chat, and club lists everywhere.

- [ ] **Cap user handles at 10 characters.** The username is shown in chat, every
  game roster, the header player strip, and as the literal handle of the solo
  club (`=<username>`). A 10-char ceiling keeps all of those compact on a phone.
  Enforced where the handle is created — the SQL `CHECK` on `common.profiles.username`
  and the `claim_username` RPC, mirrored by `HANDLE_REGEX` in
  [`ClaimHandleScreen`](../src/common/components/auth/ClaimHandleScreen.tsx)
  (currently 3–30 chars). Alpha prior: fine to just re-narrow the constraint;
  existing over-long handles get re-picked.
- [ ] **Cap club names at 20 characters.** The club name headlines the club page
  and appears in the home clubs list. A 20-char ceiling keeps the title on one
  line on a phone. Enforced at `create_club` (and wherever a rename lands, once
  that exists).
