# club

The club room and everything shown in it: the page, the entries that stand for
a game, the two filters, and the dialogs that create and edit a club.

## Intro to area

A club is the venue — a named group of friends that exists between sessions —
and this is the room. It answers four questions at once, which is why it is two
columns rather than a list: who is here, what is being played, what could be
started, and everything the club has ever played. `App` renders it at
`/c/<handle>`.

Who is here is the roster strip in the header, lit by presence rather than by a
stored flag, because presence expires on its own when a tab closes. What is
being played is the current game, called out above the start list and flying an
orange flag on its own row further down — it is one game named twice, not two
kinds of thing. What could be started is the left column, one row per gametype
the club is enrolled in, and what has been played is the right, every game the
club has including the current one. The two columns are peers: choosing from
one of them is why you came.

Getting there is two reads with two different jobs. `common.get_club_page` is
one call for the club, its roster and its enrolled gametypes — none of which
change while you are here — and the page does not exist until it answers, which
is what `<ClubPageLoader>` is for. The games list is the other, and it is never
settled: it re-reads on every change to one of the club's `common.games` rows,
so a game someone else starts or finishes appears without a refresh.

Three of the four game entries you can see are the same object. The current-game
card, a games-list row and a start-list row all draw `<GameEntry>` — a logo, a
title line with its mode badge, a smaller second line — and differ in the box
around it and in what the second line says. That is deliberate: the page should
read as one kind of thing seen three times.

## Details

**Who renders the page, and what it renders.** Nodes from other folders are
named in parentheses; everything else is this folder's:

```
App ── /c/<handle> ──> ClubPageLoader          get_club_page, and the wait for its answer
                       └── ClubPage
                           ├── PageHeader (page-header)
                           │     ├── PageHeaderMenu (page-header) — logo: PuzpuzpuzLogo (branding)
                           │     ├── ChatButton (page-header)
                           │     └── PageHeaderStatusSlot (page-header)   the roster, lit by presence
                           ├── <main>
                           │     ├── Segmented (buttons)                  the phone's two tabs
                           │     ├── ModeFilter · GametypeFilter          twice each: the phone's row, and each column's
                           │     ├── left column
                           │     │     ├── CurrentGameCard → GameEntry + ClubGameDeleteButton
                           │     │     └── SelectionList (lists) → StartGameRow → GameEntry   one per enrolled gametype
                           │     └── right column
                           │           └── SelectionList (lists) → ClubGameRow → GameEntry + ClubGameDeleteButton
                           ├── Chat (chat)                                for the life of the page
                           ├── ClubHelpCompanion                          while Help is open
                           ├── SetupGameModal (setup-form)                while a game is being started
                           └── EditClubModal                              while the enrollment is being edited
```

`GameEntry` draws `GameLogo` (branding) and `ModeBadge`. `CreateClubModal`
is the one component here this page does not render — `HomePage` does.

- **Each filter is in the tree twice, and cannot be once** — why is in
  [docs/mobile.md](../../../docs/mobile.md) → "Club page — tabs instead of two
  columns", with the rest of this page's mobile shape. What that section does
  not say, because it is about the markup rather than the alternative: one
  instance placed by a `useIsMobile` hook would state the mobile threshold
  twice, in a media query and in JS, and those two reads can disagree across a
  resize. A duplicated STATELESS control has nothing to disagree about. The
  cost the duplication does carry is real DOM, which is why
  `club-filters.e2e.ts` scopes every locator.
- **The current-game pointer is healed here, not trusted.** A game flagged
  current with nobody present in it is a pointer that stuck, and this page is
  where that shows, so after a short grace period it clears the flag itself.
  Presence is the evidence — a game page announces its game on the club's
  presence channel — and how the pointer sticks in the first place is
  [docs/common.md](../../../docs/common.md) → the current-view pointer.
- **Deleting the current game is a broadcast, then the RPC.** Its players may
  be on the game page, so the page sends the same `suspend` event the suspend
  confirm does, waits a beat for them to leave, and only then deletes. The
  broadcast is friendliness rather than correctness and never blocks the
  delete. A game that is not current has nobody in it by definition and goes
  straight to the RPC. `handleDelete` in `ClubPage.tsx` carries the mechanics.
- **A failed games read is shown in the header's slot**, which is otherwise
  for other people's news. Nothing retries that read — it re-runs only when
  another of the club's game rows changes — so a stale list is a page to
  reload, and the members strip the message hides is not what the player needs
  meanwhile. A delete's own answers are toasts for the same reason: they must
  not cost the strip.
- **`?new=<gametype>` opens the setup dialog on arrival.** It is sent from
  outside this folder — the game page's ⌥+ and crosswords' New game — for a
  fresh game whose options you want to change first. The page reads it once,
  and closing the dialog drops it from the URL so a refresh does not reopen
  it. `useSetupDialog` is where a press and an arrival become one answer.
- **The two filters persist differently, because they mean different things.**
  The mode filter is a standing taste ("I'm here for compete games") that
  narrows a menu of things you could start and hides nothing that exists, so it
  sticks, per user, across clubs (`useStickyChoice`). The gametype filter
  narrows the club's real games, so it is not remembered: a page that opened
  already filtered from last week would read as "where did our games go?"
- **A finished game's row is not dimmed, shrunk or lightened.** The corner flag
  is the whole signal. Each extra "this one's done" channel cost something:
  a fade dulled the logo and status colors, which carry information, and a type
  change gave the list three row heights.
- **The keyboard.** The page's tab ring is its two lists and nothing else, and
  focus starts on the start list. Arrows move each list's own cursor and Enter
  acts on it; a click moves the cursor too, so the mouse and the keys never
  disagree about which row you are on. The current-game card is mouse-only, and
  its border is a dark neutral because a blue ring means the keyboard cursor.
- **The mode badge.** The mode is shown as a `ModeBadge`, never written into a
  game's name, so a coop and compete pair carry the same name. The UI says
  "Co-op" where the data says `coop` — `MODE_LABEL` in `gameManifest.ts` is the
  one place the two spellings differ. The club editor always shows the badge,
  solo club or not, because it lists both siblings and the badge is the only
  thing telling two identically named rows apart. A game's status line never
  repeats the mode (`labelFor`), since the badge beside it already says it.
- **`useClubRoster` lives here and this page does not use it.** The game page
  does, for chat: a game knows its players, but chat is club-wide, and a sender
  who is not in the game still needs a name. It sits in this folder because
  the roster is the club's.
