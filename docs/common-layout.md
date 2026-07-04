# How `common/` is organized

`src/common/` is the shared shell every game builds on — its `components/`,
`hooks/`, and `lib/` had grown flat (50+ / ~30 / ~20 files), so finding things
and knowing where a new file goes got hard. This doc is the **folder taxonomy**
and, more importantly, the **purpose of each folder** — so placement is decided
by a folder's stated job, not by guessing from whatever files happen to sit next
to each other.

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
  icons.ts       # the shared inline-SVG icon set (a root file, not a subfolder)
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

## How this was applied (for the next reorg)

The move was done as a **`git mv` + import-rewrite codemod** (a throwaway Node
script), not by hand, then verified with `tsc -b` (the definitive net — it resolves
every import in the project) + `vitest` + a club→game e2e. Two gotchas worth knowing
if you reorganize again:

- **`vi.mock('…relative…')` paths are NOT `import` statements**, so an
  import-rewriting codemod misses them — the mocks silently stop intercepting and
  ~50 tests fail with "real module ran." Rewrite `vi.mock()` path args in a second
  pass (same resolve-old-path → map-to-new-path logic).
- **Restart the vite dev server afterward.** HMR caches module resolutions, and a
  rename storm leaves the running server serving 404s for old paths (Playwright
  reuses that server, so e2e breaks until it's restarted).

`git mv` kept history for all 182 moved files. The pre-existing `react-hooks/refs`
lint errors in `useGlobalFeedback` / `useLocalFeedback` / `useWordSubmit` were
unrelated to this move (they failed at HEAD too) and have since been fixed
(`f3b6cc2`).
