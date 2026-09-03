# How `common/` is organized

`src/common/` is the shared shell every game builds on — its `components/`,
`hooks/`, and `lib/` had grown flat (50+ / ~30 / ~20 files), so finding things
and knowing where a new file goes got hard. This doc is the **folder taxonomy**
and, more importantly, the **purpose of each folder** — so placement is decided
by a folder's stated job, not by guessing from whatever files happen to sit next
to each other.

## Principles

- **Organized by feature-DOMAIN** (club, game, chat, setup, definitions, …),
  with a few **cross-cutting UI-primitive** folders (buttons, floating-panels,
  feedback, toasts, fields, text) for things used across domains.
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

- **Furniture that every page carries and no page owns** (the top strip) →
  `components/page-header/`. It isn't home's, club's or game's just because all
  three render it — filing it under any one of them is what let three copies
  drift. **A button that lives in the strip goes here too**, even when what it
  opens lives elsewhere: `ChatButton` and `ScratchpadButton` are header marks,
  not parts of chat or of the scratchpad.
- A **reusable form control** (a labeled input/select/radio) → `components/fields/`,
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
  page-header/   # everything about the top strip — furniture every page carries,
                 #   belonging to no one page, including the marks that open a
                 #   floating panel from it
      PageHeader, PageHeaderButton, PageHeaderMenu, PageHeaderStatusSlot,
      PageHeaderPlayersStrip, ChatButton, ScratchpadButton
  auth/          # pre-app screens — sign in, claim a handle
      LoginScreen, ClaimHandleScreen
  home/          # the landing page after login (your clubs)
      HomePage
  club/          # the club "room": its page + everything shown on it
      ClubPage, CreateClubModal, ClubGameCard, ClubHelpCompanion, EditClubModal, StartGameButtons,
      ModeFilter, GametypeFilter
  account/       # your own menu + profile editing
      UserMenu, EditProfileModal, ColorChoiceList
  chat/          # the club chat floating panel (its header mark is in page-header/)
      ChatBody, Chat
  setup/         # the start-a-game dialog (collect per-game options → create)
      SetupGameModal, SetupDisclosure
  fields/        # reusable form controls (any form, not just setup)
      DictBandField, SetupTimerSection, SelectField, RadioRow,
      SetupCoopStyleSection, SetupNextPuzzleSection
  game/          # a live game's shell + the chrome around the play surface
      GamePage, PauseBoundary, PauseOverlay, SuspendConfirmationBlockingModal,
      OpponentStrip, ModePill, StrikeMarks, GameInvitations
    entry/       # the in-game typed-move input — the word box + its row
        EntryBox, EntryRow
    terminal/    # what shows when a game ENDS
        TerminalActionRow, LocalTerminalRow
    lists/       # info-column list views (turn history, found words) + actor tags
        TurnLog, WordList, TurnLogActor, ActorTag
  definitions/   # click-a-word dictionary lookup
      DefinitionPopover, DefinitionView, WordLookupDialog
  floating-panels/ # the shared shell for every window-like thing that floats over
                 #   the page, + the panels that ride on it
      FloatingPanel, ConfirmationBlockingModal, GameScratchpadCompanion
  menu/          # the one menu (it contains different things on different pages)
      Menu
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
      useCommonGame, useGameTimer, useCelebration, useStandardGameActions,
      useWordSubmit, useHistoryViewer, useRecentlyFound, useGameInvitations,
      makeFoundWordsGame
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
  scratchpad/    # the per-game shared-notes body + takeover-lock state
      useScratchpad
```

## `common/lib/`

```
lib/
  gameManifest.ts # WHAT A GAME DECLARES: GameManifest, plus the supporting types
                 #   its members are written in — CommonGameListRow, TimerMode,
                 #   CreatedGame, GameStopResult, MODE_LABEL, playerCount*.
                 #   NOT the manifest list itself, which lives in src/gametypes.ts
                 #   (the one file allowed to import games). Kept at the lib root
                 #   as a heavily-imported entry point. The test for anything
                 #   proposed for it: does it name a GAME?
  gamePageCtx.ts # WHAT A GAME IS HANDED: the values <GamePage> passes down to a
                 #   game's PlayArea. The runtime half of the same contract, and
                 #   its own module because its readers are its own — 32 files
                 #   import it and all 32 are a game's components
  members/       # who someone is — Member + GamePlayer (member.ts, TYPES ONLY so
                 #   its 103 importers erase at runtime), and the two values that
                 #   read them (playerOutcome.ts)
      member, playerOutcome
  setup/         # the <SetupGameModal> ↔ game-form contract — SetupBodyProps,
                 #   SetupSetter, SetupOf, GameSetupForm
      setupForm
  feedback/      # what a feedback pill IS — GenericFeedbackMsg + GenericFeedbackApi
      genericFeedback
  menu/          # what a menu is made of, plus its open/closed state
      menu, pageMenuStore
  supabase/      # the supabase client + realtime channel-name helper
      supabase, channelDedup
  routing/       # the hash router + <Link>
      router, Link
  game/          # game-logic helpers (NOT the registry above)
      gridCursor, pause, terminalCopy, timerLabel, difficulty, peers, gameInvites,
      trie (the flat dictionary trie shared by boggle's solver + scrabble's suggester)
  definitions/   # dictionary-definition parsing
      parseDefinition
  color/         # member/tile color derivation
      memberColor, tileColor
  chat/          # chat open-state + unread stores
      chatOpenStore, chatUnread
  scratchpad/    # the scratchpad open-state store (mirrors chatOpenStore)
      scratchpadOpenStore
  toast/         # the toast store
      toastStore
  util/          # tiny cross-cutting utilities — the ones belonging to no page,
                 #   no game and no subsystem: class names, dates, seeded
                 #   randomness, web storage, log stamps, the boot/render
                 #   last-resort screen
      cls, friendlyDate, keyboardHandoff, layoutWidth, linkify,
      logStamp, mulberry32, panic, reloadOnStaleChunk,
      storage (+ storage.fake, the Storage stand-in tests install)
```

**Touch web storage only through `util/storage.ts`.** `localStorage` and
`sessionStorage` *throw* where a browser blocks site data — on the property
access as readily as on the call — so `readStored` / `writeStored` /
`removeStored` wrap every access, and
[`src/guards/rawStorage.test.ts`](../src/guards/rawStorage.test.ts) fails the
build on a raw one outside them. `readStored`'s `whenUnavailable` argument is
required on purpose: storage being *gone* is not the same event as a key being
*absent*, and `reloadOnStaleChunk` is the caller that needs the opposite answer
from everyone else.

## Judgment calls (recorded so they don't get re-litigated)

- **`useCommonGame`** is both game-state and realtime; it lives in `hooks/game/`
  (its job is "the common game," realtime is the mechanism).
- **`GameInvitations` / `useGameInvitations`** → `game/`. They're game-invite UI,
  not feedback and not session.
- **`GameLogo`** → `branding/` with the app logo. It's a logo (rendered in the
  game header AND on club cards), grouped with `PuzpuzpuzLogo` by that shape.
- **`RichMessage`** → `text/`. General-purpose; it renders setup errors today but
  its job is inline player-segment text, not feedback.
- **`gameManifest.ts` and `gamePageCtx.ts`** stay at `lib/` root (not `lib/game/`)
  — they are THE contract, and a dead-obvious top-level path beats one more level
  of nesting. **Both were named `games.ts` until 2026-09-03**, alongside
  `src/games.ts` — two very different files with one vague name, in a repo whose
  whole subject is games. Renamed for what each holds, and because `game` in this
  repo means *a specific playing* (docs/naming.md): neither file is about one.

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
