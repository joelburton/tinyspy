# Common hook names

A read of the `src/common/` hooks that the store passes
([store-and-hook-files.md](store-and-hook-files.md)) did not reach, for the
same kinds of fault: names that don't say what a thing is or does, and comments
that no longer match the code. Every item in A was checked against the code.
Names in C–G are proposals, to be agreed before any is changed.

## A. Stale comments — the code says otherwise (done)

- [x] `game-page/useStandardGameActions.ts`: the page remounts on "the new
  `restarts` count" — there is no `restarts`; it is `restart_count`. Also in
  `GamePageGate.tsx` and `GamePage.test.tsx`.
- [x] `single-flight/useSingleFlight.ts`: the usage example wraps
  `handleNewGame`, which doesn't exist, and names the pair backwards — real
  callers wrap a verb and get a handler (`useSingleFlight(submitGuess)` →
  `handleGuess`).
- [x] `realtime/useClubSetupPresence.tsx`: says ClubPage drives it from
  `pendingSetup`; the name is `activeSetup`.
- [x] `realtime/useClubSetupPresence.tsx`: "the invite-toast ids" are the setup
  toasts (`setup:<userId>`).
- [x] `keyboard/useCaptureKeys.ts`: "the any-key watcher above" is bound below.
- [x] `keyboard/useGameHasKeyboard.ts`: says FilterSelect and bananagrams'
  board both cite this hook; only FilterSelect does.
- [x] `keyboard/useBacktickEscape.ts`: "Guards, in order" lists two; the code
  has three (`isComposing` is its own).
- [x] `floating-panels/useDraggablePanel.ts`: the "pure helpers" header sits
  over `useReclampOnResize`, a hook.

## B. History or attribution in comments (done)

- [x] `useStandardGameActions.ts`: "Eleven games used to clean up here…".
- [x] `useStandardGameActions.ts`: the "(Joel, 2026-09-19: …)"-style dated
  notes.
- [x] `event-log/useEventLogPlayerPicker.tsx`: the comment tells a past bug's
  story and the e2e that caught it.
- [x] `board-marks/useChangeCause.ts`: "exactly as before".

## C. Hook and type names that don't say what they are

- [ ] `feedback/usePeerFeedback` shows a message per new peer event; its
  siblings say so (`useShowEndingFeedback`, `useShowWaitingMessage`):
  `useShowPeerFeedback`.
- [ ] Types named for a container: `usePanelEscape`'s `Entry` → `OpenPanel`;
  `useClubPresence`'s `ClubPresenceEntry` → `MemberLocation`; `useDefinition`'s
  return type `State` → `DefinitionLookup`; `useMoveAttention`'s
  `MoveAttention` (its options) → `MoveAttentionOptions`; `useRealtimeRefetch`'s
  `Config` → `RealtimeRefetchConfig`.
- [ ] `useRealtimeRefetch`'s and `useRefetchOnGameUpdate`'s `mounted()` mean
  "still mounted and still the newest load": `isCurrent()` / `isLatest()`.
- [ ] `terminal/useCelebration` returns `show`, which reads as a verb; it is a
  yes/no: `isShown`.

## D. Vague names inside hooks

- [ ] A value that isn't what its name says: `useSetupDialog`'s `game` (a
  manifest); `useHistoryViewer`'s `open` (which turn is open);
  `useBoardSelectionCursor`'s `selection` (the cursor); `useStickyChoice`'s
  `value` (the choice); `useCaptureKeys`' `value` option (the pending text);
  `useSolutionReveal`'s `pick`; `useClubSetupPresence`'s `announce`.
- [ ] Generic words: `useClubChat`'s `load` and `row`; `useGameInvitations`'
  `load`, `built`, `have`; `useCommonGame`'s `state` and `entry`;
  `useClubRoster`'s `rowsRes`; `useScratchpad`'s `foreign`, `editingBy`,
  `ScratchpadApi`.
- [ ] "Request" in `useSetupDialog` (`requestedGametype`, `requestConsumed`)
  means a URL parameter, not a network request.

## E. Booleans not phrased as yes/no

- [ ] `useChatFeedback`'s `important`, `useClubGames`' `failed`,
  `useScratchpad`'s `shared`, `useWordListFilter`'s `peopleVisible`,
  `usePanelEscape`'s `listening`.

## F. Functions not led by a verb

- [ ] `useCommonGame`'s `timerModeOf`; `useBoardCursorKeys`' and
  `useBoardSelectionCursor`'s `state`; `useMoveAttention`'s `changed`;
  `useEventLogPlayerPicker`'s `defaultSelection`; `useWordListFilter`'s
  `emptyTextFor`; `useCaptureKeys`' `asciiLetters`; `useBacktickEscape`'s
  `backtickToEscape`; `usePanelEscape`'s `rankOf`, `topmost`, `focused`;
  `useTabRing`'s `innermost`, `onScreen`, `programmaticOnly`, `liveStops`.

## G. Module-level arrow functions

- [ ] `routing/router.ts`: `subscribeToPath`, `readPath`.

## H. "Terminal" wording — owed to the common terminal sweep

Where it appears, for that sweep: `useClubGames.isTerminal` (ClubPage reads
it), `useChangeCause`, `useSetupDialog`, `useSolutionReveal`, `useGameTimer`,
`useCaptureKeys`, `useWordListFilter`, `useEventLogPlayerPicker`,
`useShowEndingFeedback`, `useStandardGameActions`.
