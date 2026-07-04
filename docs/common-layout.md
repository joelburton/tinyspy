# How `common/` is organized

`src/common/` is the shared shell every game builds on — its `components/`,
`hooks/`, and `lib/` had grown flat (50+ / ~30 / ~20 files), so finding things
and knowing where a new file goes got hard. This doc is the **folder taxonomy**
and, more importantly, the **purpose of each folder** — so placement is decided
by a folder's stated job, not by guessing from whatever files happen to sit next
to each other.

> **Status:** this is the **target** layout. The move hasn't been made yet — see
> [Migration plan](#migration-plan-one-time--remove-this-section-once-done) at the
> bottom. Until then, `common/` is still flat; use this doc to decide where things
> *will* go (and, if you're adding a file now, drop it where this says it belongs).

## Principles

- **Organized by feature-DOMAIN** (club, game, chat, setup, definitions, …),
  with a few **cross-cutting UI-primitive** folders (buttons, panels, feedback,
  toasts, fields, text) for things used across domains.
- **The same domain name recurs across the three layers.** `definitions/`,
  `chat/`, and `toast(s)/` appear in `components/`, `hooks/`, and/or `lib/`. That
  echo is deliberate — you find everything about a concept by its name in each
  layer — which is why a folder is kept even when it holds a single file today.
- **Co-located siblings move together.** A component's `*.module.css` and its
  `*.test.tsx` live beside it; treat the pair/triple as one unit.
- **Per-game code is NOT here.** Each game's `PlayArea` / `BoardCol` / `InfoCol`
  / `useGame` lives under `src/<game>/`. `common/` is only the shared shell — if
  a thing is specific to one gametype, it doesn't belong in `common/`.

## Where does a new file go?

Read the folder comment and match the file's **job**, not its shape. Some rules
that fall out of the taxonomy and have bitten us before:

- A **reusable form control** (a labelled input/select/radio) → `components/fields/`,
  even if today it's only used by the setup dialog. Fields are general; the setup
  dialog is one consumer.
- The **in-game move-entry input** (the box you type a word into) is NOT a form
  field → `components/game/entry/`.
- A **toast** (bottom-right announcement) is NOT feedback → `toasts/`. **Feedback**
  is specifically the near-input validity pill + its local/global state.
- A **generic text renderer** (e.g. `RichMessage`) is NOT feedback just because an
  error happens to use it → `components/text/`.
- A **game-invitation** surface/hook is game domain, not feedback and not session
  → `game/`.

## `common/components/`

```
components/
  auth/          # pre-app screens — sign in, claim a handle
      LoginScreen, ClaimHandleScreen
  home/          # the landing page after login (your clubs)
      HomePage
  club/          # the club "room": its page + everything shown on it
      ClubPage, CreateClubPage, ClubGameCard, ClubHelp, EditClubDialog, StartGameButtons
  account/       # your own menu + profile editing
      UserMenu, EditProfileDialog, ColorChoiceList
  chat/          # the club chat panel
      ChatBubble, ChatBody, FloatingChat
  setup/         # the start-a-game dialog (collect per-game options → create)
      SetupGameDialog, SetupDisclosure
  fields/        # reusable form controls (any form, not just setup)
      DifficultyField, TimerField, SelectField, RadioRow
  game/          # a live game's shell + the chrome around the play surface
      GamePage, PauseBoundary, PauseOverlay, SuspendConfirmDialog,
      StatusSlot, PlayersStrip, OpponentStrip, ModePill, StrikeMarks, GameInvitations
    entry/       # the in-game typed-move input — the word box + its row
        EntryBox, EntryRow
    terminal/    # what shows when a game ENDS
        GameOverModal, TerminalModal, TerminalActionRow
    lists/       # info-column list views (turn history, found words) + actor tags
        TurnLog, WordList, TurnLogActor, ActorTag
  definitions/   # click-a-word dictionary lookup
      DefinitionPopover, DefinitionView, WordLookupDialog
  panels/        # generic floating/popup chrome (the draggable shell, the dropdown menu)
      FloatingPanel, Menu
  feedback/      # the near-input validity pill ("not a word", "too short")
      GenericFeedbackPill
  toasts/        # the bottom-right announcement stack (a generic primitive)
      Toast, ToastHost
  buttons/       # every purpose button + the ActionButton base
      ActionButton, SubmitButton, EndGameButton, ConcedeGameButton, PeelButton,
      BackToClubButton, … (all existing)
  text/          # general rich-text rendering (messages w/ inline player discs)
      RichMessage
  branding/      # the app + per-game logos
      PuzpuzpuzLogo, GameLogo
```

## `common/hooks/`

```
hooks/
  game/          # live-game state, timer, terminal, move-submit, invitations, history
      useCommonGame, useGameTimer, useTerminalModal, useEndGameMenu,
      useWordSubmit, useHistoryViewer, useRecentlyFound, useGameInvitations
  realtime/      # supabase presence + reconnect/refetch plumbing
      useClubPresence, useClubSetupPresence, useRealtimeRefetch, useRealtimeReconnect
  session/       # the auth session + the user's own profile
      useSession, useProfile
  feedback/      # the local/global feedback-pill state
      useGlobalFeedback, useLocalFeedback, useDismissLocalFeedbackOnKey
  input/         # keyboard capture, board-cursor, app shortcuts
      useCaptureKeys, useBoardCursorKeys, useArrowHistory, useGlobalKeyHandler,
      useGameHasKeyboard, useAppShortcuts
  ui/            # generic UI helpers (drag, draggable panel, transient flash)
      useDragGesture, useDraggablePanel, useFlash
  definitions/   # word-definition fetch + popover state
      useDefinition, useDefinePopover
  chat/          # club-chat data
      useClubChat
```

## `common/lib/`

```
lib/
  games.ts       # the game REGISTRY (manifests + GameManifest type) — kept at the
                 #   root because it's the central, heavily-imported entry point
  supabase/      # the supabase client + realtime channel-name helper
      supabase, channelDedup
  routing/       # the hash router + <Link>
      router, Link
  game/          # game-logic helpers (NOT the registry above)
      gridCursor, pause, terminalCopy, timerLabel, difficulty, peers, gameInvites
  definitions/   # dictionary-definition parsing
      parseDefinition
  color/         # member/tile color derivation
      memberColor, tileColor
  chat/          # chat open-state + unread stores
      chatOpenStore, chatUnread
  toast/         # the toast store
      toastStore
  util/          # tiny cross-cutting utilities (class names, dates, layout width)
      cls, friendlyDate, layoutWidth
```

## Judgment calls (recorded so they don't get re-litigated)

- **`useCommonGame`** is both game-state and realtime; it lives in `hooks/game/`
  (its job is "the common game," realtime is the mechanism).
- **`GameInvitations` / `useGameInvitations`** → `game/`. They're game-invite UI,
  not feedback and not session.
- **`GameLogo`** → `branding/` with the app logo. It's a logo (rendered in the
  game header AND on club cards), grouped with `PuzpuzpuzLogo` by that shape.
- **`RichMessage`** → `text/`. General-purpose; it renders setup errors today but
  its job is inline player-segment text, not feedback.
- **`games.ts`** stays at `lib/` root (not `lib/game/`) — it's THE registry, and
  a dead-obvious top-level path beats one more level of nesting.

## Migration plan (one-time — remove this section once done)

This is a pure **move + import-path** refactor: no behavior changes, `tsc -b` is
the safety net (it flags every stale import). Do it in small tranches so each diff
is reviewable and stays green.

**Before starting**

1. *(Optional but recommended)* add a path alias so future moves hurt less and the
   path edits are find-replaceable: `"paths": { "@common/*": ["src/common/*"] }`
   in `tsconfig` + the matching `resolve.alias` in `vite.config`. Not required —
   relative imports work — but it caps the churn of the *next* reorg.
2. **Shared CSS modules first.** A few `*.module.css` files have NO component and
   are imported across directories (`PlayArea.module.css`, `historyViewer.module.css`,
   `modalActions.module.css`, …). They can't just ride along with one component.
   Decide a stable home for each (e.g. `PlayArea.module.css` → `components/game/`)
   and update every importer in one focused commit, so later component moves don't
   trip over them.

**Then, one folder per commit** — lowest-coupling first, `game/` last:

`buttons/` (done) → `branding/`, `text/`, `toasts/`, `feedback/`, `home/`, `auth/`
→ `fields/`, `definitions/`, `panels/`, `chat/`, `account/` → `setup/` → `club/`
→ `game/` (+ its `entry/` / `terminal/` / `lists/` subfolders). Hooks and lib can
interleave or follow; same tranche discipline.

**Each tranche**

1. `git mv` the `.tsx` + co-located `.module.css` + `.test.tsx` together.
2. Fix imports: the moved files' own relative imports (depth changed), and every
   external importer's path to them. `npx tsc -b` enumerates all breakage — iterate
   to zero.
3. `npx tsc -b` + `npx eslint` + `npx vitest run` green.
4. Commit (`refactor(common): move <folder> …`), one folder per commit.

**Gotchas**

- **Restart the vite dev server** after the mass moves — HMR caches module
  resolutions and a rename storm leaves it serving 404s for old paths (a full dev
  restart clears it).
- **`git mv` preserves history** — use it, don't delete+create.
- **eslint import-direction rules** govern game↔game imports; moving *within*
  `common/` doesn't cross them, but re-run eslint each tranche to be sure.
- Update **any docs that reference old paths** (grep `docs/` for `common/components/`
  etc.) as part of the same tranche.
