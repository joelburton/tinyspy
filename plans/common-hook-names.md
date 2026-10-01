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

## C. Hook and type names that don't say what they are (done)

- [x] `feedback/usePeerFeedback` shows a message per new peer event; its
  siblings say so (`useShowEndingFeedback`, `useShowWaitingMessage`):
  `useShowPeerFeedback`.
- [x] Types named for a container: `usePanelEscape`'s `Entry` → `OpenPanel`;
  `useClubPresence`'s `ClubPresenceEntry` → `MemberLocation`; `useDefinition`'s
  return type `State` → `DefinitionLookup`; `useMoveAttention`'s
  `MoveAttention` (its options) → `MoveAttentionOptions`; `useRealtimeRefetch`'s
  `Config` → `RealtimeRefetchConfig`.
- [x] `useRealtimeRefetch`'s and `useRefetchOnGameUpdate`'s `mounted()` mean
  "still mounted and still the newest load": `isCurrent()` / `isLatest()`.
- [x] `terminal/useCelebration` returns `show`, which reads as a verb; it is a
  yes/no: `isShown`.

  As done: `useShowPeerFeedback`; `OpenPanel`; `MemberGameOrClub`;
  `DefinitionRequestState`; `MoveAttentionOptions`; `RealtimeRefetchOptions`
  (a hook's argument type is `<Hook>Options`); the getter is `isCurrent()`;
  `useCelebration` returns `isOpen`, the word the app uses for a dialog.

## D. Vague names inside hooks (done)

- [x] A value that isn't what its name says: `useSetupDialog`'s `game` (a
  manifest); `useHistoryViewer`'s `open` (which turn is open);
  `useBoardSelectionCursor`'s `selection` (the cursor); `useStickyChoice`'s
  `value` (the choice); `useCaptureKeys`' `value` option (the pending text);
  `useSolutionReveal`'s `pick`; `useClubSetupPresence`'s `announce`.
- [x] Generic words: `useClubChat`'s `load` and `row`; `useGameInvitations`'
  `load`, `built`, `have`; `useCommonGame`'s `state` and `entry`;
  `useClubRoster`'s `rowsRes`; `useScratchpad`'s `foreign`, `editingBy`,
  `ScratchpadApi`.
- [x] "Request" in `useSetupDialog` (`requestedGametype`, `requestConsumed`)
  means a URL parameter, not a network request.

  As done: `useSetupDialog`'s `manifest`, `gametype` (also in
  `ClubPageLoader`), `hasBeenClosed`, `linkManifest`; `openTurn`;
  `selectionCursor` (also `SelectionList`); `choice`; `pendingText`;
  `myChoice`; `mySetup`; `loadMessages` and `message`; `scanForInvites`,
  `newInvites`, `pendingIds`, `unseenInvites`; `presence` / `tabs` / `tab` in
  all three presence loops; `otherHolder`. Kept: `useClubRoster`'s `rowsRes`
  and `load` (the context says what they are), `editingBy`, `ScratchpadApi`.
  Every hook that takes options now names their type `<Hook>Options`; eight
  had it inline.

## E. Booleans not phrased as yes/no (done)

- [x] `useChatFeedback`'s `important`, `useClubGames`' `failed`,
  `useScratchpad`'s `shared`, `useWordListFilter`'s `peopleVisible`,
  `usePanelEscape`'s `listening`.

  As done: `isImportant`; `hasReadFailed` (ClubPage's `hasGamesReadFailed`);
  `isShared`; `arePlayersOffered`; `isListening`.

## F. Functions not led by a verb (done)

- [x] `useCommonGame`'s `timerModeOf`; `useBoardCursorKeys`' and
  `useBoardSelectionCursor`'s `state`; `useMoveAttention`'s `changed`;
  `useEventLogPlayerPicker`'s `defaultSelection`; `useWordListFilter`'s
  `emptyTextFor`; `useCaptureKeys`' `asciiLetters`; `useBacktickEscape`'s
  `backtickToEscape`; `usePanelEscape`'s `rankOf`, `topmost`, `focused`;
  `useTabRing`'s `innermost`, `onScreen`, `programmaticOnly`, `liveStops`.

  As done: only the yes/no checks, which take an `is`: `isOnScreen`,
  `isProgrammaticOnly`. The rest are left for when each file is next read.

## G. Module-level arrow functions (done)

- [x] `routing/router.ts`: `subscribeToPath`, `readPath`.

## H. "Terminal" wording — owed to the common terminal sweep

Where it appears, for that sweep: `useClubGames.isTerminal` (ClubPage reads
it), `useChangeCause`, `useSetupDialog`, `useSolutionReveal`, `useGameTimer`,
`useCaptureKeys`, `useWordListFilter`, `useEventLogPlayerPicker`,
`useShowEndingFeedback`, `useStandardGameActions`.
