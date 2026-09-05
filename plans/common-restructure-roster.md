# The `src/common/` move roster — every file and where it went

> # ✅ EVERY MOVE BELOW HAS HAPPENED, in commit `c2f9baf2`
>
> Companion to [common-restructure.md](common-restructure.md), which holds the
> reasoning and the rulings. **The paths on the LEFT no longer exist** — they
> are where each file lived before 2026-09-04. The heading above each block is
> where it lives now, with the three exceptions listed under this box.
>
> This is the durable mapping: the codemod was a throwaway, and this is what
> answers "where did that file go?" for anyone reading a pre-move doc, commit
> or area record.
>
> A file's test and its `.module.css` traveled with it — they share a stem, and
> the stem is what decided the destination.

Generated 2026-09-04. Regenerate rather than hand-edit when a ruling changes.

**Two files were renamed on arrival**, because a component and a same-named
lowercase module cannot share a folder on a case-insensitive filesystem
(`./menu` and `./Menu` resolve to the same file):

| roster row | landed as |
|---|---|
| `lib/menu/menu.ts` → `common/menu` | `common/menu/menuModel.ts` |
| `test/filterSelect.ts` → `common/lists` | `common/lists/filterSelectHelpers.ts` |

**And one row changed destination**, ruled by Joel on 2026-09-04 once the
common-never-imports-shared guard surfaced the edge (see
[common-restructure.md](common-restructure.md) §7a):

| roster row | landed as |
|---|---|
| `pdf/tiles.ts` → `common/pdf` | `shared/wordle-style/pdfTiles.ts` |


### `common/account` — 6 files

| today (under `src/common/`) |
|---|
| components/account/ColorChoiceList.module.css |
| components/account/ColorChoiceList.tsx |
| components/account/EditProfileModal.test.tsx |
| components/account/EditProfileModal.tsx |
| hooks/account/useAccountMenuSection.ts |
| lib/account/editProfileStore.ts |

### `common/anagram-finder` — 3 files

| today (under `src/common/`) |
|---|
| components/definitions/AnagramDialog.module.css |
| components/definitions/AnagramDialog.test.tsx |
| components/definitions/AnagramDialog.tsx |

### `common/auth` — 5 files

| today (under `src/common/`) |
|---|
| components/auth/ClaimHandleScreen.module.css |
| components/auth/ClaimHandleScreen.test.tsx |
| components/auth/ClaimHandleScreen.tsx |
| components/auth/LoginScreen.test.tsx |
| components/auth/LoginScreen.tsx |

### `common/boot` — 4 files

| today (under `src/common/`) |
|---|
| lib/util/panic.test.ts |
| lib/util/panic.ts |
| lib/util/reloadOnStaleChunk.test.ts |
| lib/util/reloadOnStaleChunk.ts |

### `common/branding` — 8 files

| today (under `src/common/`) |
|---|
| components/branding/GameLogo.module.css |
| components/branding/GameLogo.tsx |
| components/branding/PuzpuzpuzLogo.module.css |
| components/branding/PuzpuzpuzLogo.tsx |
| components/branding/PuzpuzpuzWordmark.module.css |
| components/branding/PuzpuzpuzWordmark.tsx |
| components/branding/homeTitle.png |
| puzpuzpuz.svg |

### `common/buttons` — 33 files

| today (under `src/common/`) |
|---|
| components/buttons/AIButton.tsx |
| components/buttons/BackToClubButton.tsx |
| components/buttons/CancelButton.tsx |
| components/buttons/ClearButton.tsx |
| components/buttons/CloseButton.module.css |
| components/buttons/CloseButton.tsx |
| components/buttons/ConcedeGameButton.tsx |
| components/buttons/DeleteButton.tsx |
| components/buttons/EndGameButton.tsx |
| components/buttons/EndTurnButton.tsx |
| components/buttons/ExchangeButton.tsx |
| components/buttons/HelpButton.tsx |
| components/buttons/HintButton.tsx |
| components/buttons/NewGameButton.tsx |
| components/buttons/PassButton.tsx |
| components/buttons/PauseButton.module.css |
| components/buttons/PauseButton.tsx |
| components/buttons/PeelButton.tsx |
| components/buttons/RestartButton.tsx |
| components/buttons/RevealButton.tsx |
| components/buttons/SharePreviewButton.tsx |
| components/buttons/ShuffleButton.module.css |
| components/buttons/ShuffleButton.tsx |
| components/buttons/SpoilerButton.tsx |
| components/buttons/StandardButton.module.css |
| components/buttons/StandardButton.test.tsx |
| components/buttons/StandardButton.tsx |
| components/buttons/SubmitButton.tsx |
| components/buttons/SubmitWithScore.module.css |
| components/buttons/SubmitWithScore.tsx |
| components/buttons/TrashButton.tsx |
| components/buttons/WordCheckButton.tsx |
| components/buttons/ZoomFitButton.tsx |

### `common/chat` — 11 files

| today (under `src/common/`) |
|---|
| components/chat/Chat.tsx |
| components/chat/ChatBody.module.css |
| components/chat/ChatBody.tsx |
| hooks/chat/useChatFeedback.test.tsx |
| hooks/chat/useChatFeedback.tsx |
| hooks/chat/useClubChat.test.ts |
| hooks/chat/useClubChat.ts |
| lib/chat/chatOpenStore.test.ts |
| lib/chat/chatOpenStore.ts |
| lib/chat/chatUnread.test.ts |
| lib/chat/chatUnread.ts |

### `common/club` — 22 files

| today (under `src/common/`) |
|---|
| components/club/ClubGameCard.module.css |
| components/club/ClubGameCard.tsx |
| components/club/ClubGameDeleteButton.module.css |
| components/club/ClubGameDeleteButton.tsx |
| components/club/ClubGameRow.module.css |
| components/club/ClubGameRow.tsx |
| components/club/ClubHelpCompanion.module.css |
| components/club/ClubHelpCompanion.tsx |
| components/club/ClubPage.module.css |
| components/club/ClubPage.tsx |
| components/club/CreateClubModal.module.css |
| components/club/CreateClubModal.test.tsx |
| components/club/CreateClubModal.tsx |
| components/club/EditClubModal.test.tsx |
| components/club/EditClubModal.tsx |
| components/club/GametypeFilter.tsx |
| components/club/ModeFilter.tsx |
| components/club/StartGameRow.module.css |
| components/club/StartGameRow.tsx |
| components/club/clubFilters.module.css |
| components/club/modeFilterOptions.ts |
| hooks/club/useClubRoster.ts |

### `common/core-css` — 8 files

| today (under `src/common/`) |
|---|
| base.css |
| fixed.css |
| patterns/badge.css |
| patterns/focus-ring.css |
| patterns/heading.css |
| patterns/page.css |
| patterns/segmented.css |
| utilities.css |

### `common/definitions` — 15 files

| today (under `src/common/`) |
|---|
| components/definitions/DefinitionPopover.module.css |
| components/definitions/DefinitionPopover.tsx |
| components/definitions/DefinitionView.module.css |
| components/definitions/DefinitionView.tsx |
| components/definitions/WordEditDialog.module.css |
| components/definitions/WordEditDialog.test.tsx |
| components/definitions/WordEditDialog.tsx |
| components/definitions/WordLookupDialog.module.css |
| components/definitions/WordLookupDialog.test.tsx |
| components/definitions/WordLookupDialog.tsx |
| hooks/definitions/useDefinePopover.tsx |
| hooks/definitions/useDefinition.ts |
| lib/definitions/parseDefinition.test.ts |
| lib/definitions/parseDefinition.ts |
| lib/definitions/wordEditStore.ts |

### `common/devtools` — 7 files

| today (under `src/common/`) |
|---|
| components/font/FontPage.module.css |
| components/font/FontPage.tsx |
| components/font/fontSpecimen.ts |
| components/palette/PalettePage.module.css |
| components/palette/PalettePage.tsx |
| components/palette/palette.test.ts |
| components/palette/palette.ts |

### `common/error-page` — 2 files

| today (under `src/common/`) |
|---|
| components/loading-and-errs/ErrorPage.module.css |
| components/loading-and-errs/ErrorPage.tsx |

### `common/faults` — 4 files

| today (under `src/common/`) |
|---|
| components/feedback/FaultModal.module.css |
| components/feedback/FaultModal.tsx |
| lib/fault/faultStore.test.ts |
| lib/fault/faultStore.ts |

### `common/feedback` — 16 files

| today (under `src/common/`) |
|---|
| components/feedback/FailureLine.module.css |
| components/feedback/FailureLine.tsx |
| components/feedback/GenericFeedbackPill.module.css |
| components/feedback/GenericFeedbackPill.test.tsx |
| components/feedback/GenericFeedbackPill.tsx |
| hooks/feedback/useDismissLocalFeedbackOnKey.test.ts |
| hooks/feedback/useDismissLocalFeedbackOnKey.ts |
| hooks/feedback/useGlobalFeedback.test.ts |
| hooks/feedback/useGlobalFeedback.ts |
| hooks/feedback/useLocalFeedback.test.ts |
| hooks/feedback/useLocalFeedback.ts |
| lib/feedback/genericFeedback.ts |
| lib/game/genericPills.test.ts |
| lib/game/genericPills.ts |
| lib/game/localPills.test.ts |
| lib/game/localPills.ts |

### `common/fields` — 42 files

| today (under `src/common/`) |
|---|
| components/fields/CheckboxField.module.css |
| components/fields/CheckboxField.test.tsx |
| components/fields/CheckboxField.tsx |
| components/fields/CheckboxListField.module.css |
| components/fields/CheckboxListField.test.tsx |
| components/fields/CheckboxListField.tsx |
| components/fields/ColorField.test.tsx |
| components/fields/ColorField.tsx |
| components/fields/DateField.module.css |
| components/fields/DateField.test.tsx |
| components/fields/DateField.tsx |
| components/fields/DictBandField.test.tsx |
| components/fields/DictBandField.tsx |
| components/fields/Field.test.tsx |
| components/fields/Field.tsx |
| components/fields/ManualBoardField.module.css |
| components/fields/ManualBoardField.test.tsx |
| components/fields/ManualBoardField.tsx |
| components/fields/NumberField.module.css |
| components/fields/NumberField.test.tsx |
| components/fields/NumberField.tsx |
| components/fields/PlayersField.module.css |
| components/fields/PlayersField.test.tsx |
| components/fields/PlayersField.tsx |
| components/fields/RadioRow.module.css |
| components/fields/RadioRow.test.tsx |
| components/fields/RadioRow.tsx |
| components/fields/ReadOnlyField.module.css |
| components/fields/ReadOnlyField.test.tsx |
| components/fields/ReadOnlyField.tsx |
| components/fields/SelectField.module.css |
| components/fields/SelectField.test.tsx |
| components/fields/SelectField.tsx |
| components/fields/TextField.module.css |
| components/fields/TextField.test.tsx |
| components/fields/TextField.tsx |
| components/fields/errorUnder.test.tsx |
| components/fields/errorUnder.ts |
| components/fields/field.module.css |
| components/fields/fieldContract.tsx |
| components/fields/fieldProps.ts |
| components/fields/groupTiles.ts |

### `common/floating-panels` — 16 files

| today (under `src/common/`) |
|---|
| components/floating-panels/AcknowledgeBlockingModal.tsx |
| components/floating-panels/BlockingModal.module.css |
| components/floating-panels/BlockingModal.tsx |
| components/floating-panels/Companion.tsx |
| components/floating-panels/ConfirmationBlockingModal.tsx |
| components/floating-panels/Dialog.tsx |
| components/floating-panels/FloatingPanel.module.css |
| components/floating-panels/FloatingPanel.tsx |
| components/floating-panels/NormalModal.tsx |
| components/floating-panels/modalActions.module.css |
| hooks/ui/useAcknowledge.tsx |
| hooks/ui/useConfirmation.tsx |
| hooks/ui/useDraggablePanel.test.ts |
| hooks/ui/useDraggablePanel.ts |
| hooks/ui/useFocusTrap.ts |
| hooks/ui/usePanelEscape.ts |

### `common/forms` — 4 files

| today (under `src/common/`) |
|---|
| components/fields/StandardForm.module.css |
| components/fields/StandardForm.test.tsx |
| components/fields/StandardForm.tsx |
| components/fields/formState.ts |

### `common/game-page` — 19 files

| today (under `src/common/`) |
|---|
| components/game/DeviceBlockNotice.module.css |
| components/game/DeviceBlockNotice.tsx |
| components/game/GameHelpCompanion.module.css |
| components/game/GameHelpCompanion.tsx |
| components/game/GamePage.module.css |
| components/game/GamePage.tsx |
| components/game/ModePill.module.css |
| components/game/ModePill.test.tsx |
| components/game/ModePill.tsx |
| components/game/PlayArea.module.css |
| components/game/PlayAreaErrorBoundary.test.tsx |
| components/game/PlayAreaErrorBoundary.tsx |
| components/game/PlayAreaMountLog.tsx |
| hooks/game/useCommonGame.test.ts |
| hooks/game/useCommonGame.ts |
| hooks/game/useStandardGameActions.test.ts |
| hooks/game/useStandardGameActions.ts |
| hooks/input/useGameHasKeyboard.ts |
| lib/gamePageCtx.ts |

### `common/home` — 2 files

| today (under `src/common/`) |
|---|
| components/home/HomePage.module.css |
| components/home/HomePage.tsx |

### `common/icons` — 1 files

| today (under `src/common/`) |
|---|
| components/icons.ts |

### `common/info-sheet` — 10 files

| today (under `src/common/`) |
|---|
| components/game/InfoSheet.module.css |
| components/game/InfoSheet.tsx |
| components/game/InfoSwitchButton.tsx |
| components/game/MobileStatusBar.module.css |
| components/game/MobileStatusBar.tsx |
| components/game/OpponentStrip.module.css |
| components/game/OpponentStrip.tsx |
| components/game/infoPanel.module.css |
| hooks/game/useInfoSheet.ts |
| lib/game/infoSheetStore.ts |

### `common/invitations` — 5 files

| today (under `src/common/`) |
|---|
| components/game/GameInvitations.tsx |
| hooks/game/useGameInvitations.test.ts |
| hooks/game/useGameInvitations.ts |
| lib/game/gameInvites.test.ts |
| lib/game/gameInvites.ts |

### `common/keyboard` — 11 files

| today (under `src/common/`) |
|---|
| hooks/input/useAppShortcuts.test.ts |
| hooks/input/useAppShortcuts.tsx |
| hooks/input/useBacktickEscape.test.ts |
| hooks/input/useBacktickEscape.ts |
| hooks/input/useCaptureKeys.test.ts |
| hooks/input/useCaptureKeys.ts |
| hooks/input/useGlobalKeyHandler.test.ts |
| hooks/input/useGlobalKeyHandler.ts |
| hooks/input/useSwallowTab.ts |
| hooks/input/useTabRing.ts |
| lib/util/keyboardHandoff.ts |

### `common/lists` — 8 files

| today (under `src/common/`) |
|---|
| components/game/FilterSelect.module.css |
| components/game/FilterSelect.test.tsx |
| components/game/FilterSelect.tsx |
| components/lists/SelectionList.module.css |
| components/lists/SelectionList.tsx |
| components/lists/SimpleScrollableList.module.css |
| components/lists/SimpleScrollableList.tsx |
| test/filterSelect.ts |

### `common/loading` — 2 files

| today (under `src/common/`) |
|---|
| components/loading-and-errs/Loading.module.css |
| components/loading-and-errs/Loading.tsx |

### `common/manifest` — 5 files

| today (under `src/common/`) |
|---|
| lib/game/manifestRpcs.test.ts |
| lib/game/manifestRpcs.ts |
| lib/game/statusLabel.ts |
| lib/gameManifest.test.ts |
| lib/gameManifest.ts |

### `common/members` — 7 files

| today (under `src/common/`) |
|---|
| components/text/Dot.module.css |
| components/text/Dot.tsx |
| lib/color/memberColor.test.ts |
| lib/color/memberColor.ts |
| lib/members/member.ts |
| lib/members/memberList.ts |
| test/gamePlayers.ts |

### `common/menu` — 7 files

| today (under `src/common/`) |
|---|
| components/menu/Menu.module.css |
| components/menu/Menu.test.tsx |
| components/menu/Menu.tsx |
| lib/game/gameMenu.test.ts |
| lib/game/gameMenu.ts |
| lib/menu/menu.ts |
| lib/menu/pageMenuStore.ts |

### `common/mobile` — 7 files

| today (under `src/common/`) |
|---|
| breakpoints.css |
| hooks/ui/useCoarsePointer.ts |
| hooks/ui/useIsMobile.ts |
| hooks/ui/useMediaQuery.ts |
| hooks/ui/usePhone.ts |
| hooks/ui/useVisualViewport.ts |
| lib/util/layoutWidth.ts |

### `common/move-flash` — 5 files

| today (under `src/common/`) |
|---|
| hooks/game/useMoveCausedChange.ts |
| hooks/game/useTurnStartFlash.ts |
| hooks/ui/useFlash.test.ts |
| hooks/ui/useFlash.ts |
| lib/game/feedbackTiming.ts |

### `common/outcomes` — 1 files

| today (under `src/common/`) |
|---|
| lib/outcomes.ts |

### `common/page-header` — 12 files

| today (under `src/common/`) |
|---|
| components/page-header/ChatButton.module.css |
| components/page-header/ChatButton.tsx |
| components/page-header/PageHeader.module.css |
| components/page-header/PageHeader.tsx |
| components/page-header/PageHeaderButton.module.css |
| components/page-header/PageHeaderButton.tsx |
| components/page-header/PageHeaderMenu.tsx |
| components/page-header/PageHeaderPlayersStrip.module.css |
| components/page-header/PageHeaderPlayersStrip.tsx |
| components/page-header/PageHeaderStatusSlot.module.css |
| components/page-header/PageHeaderStatusSlot.tsx |
| components/page-header/ScratchpadButton.tsx |

### `common/pause-suspend` — 7 files

| today (under `src/common/`) |
|---|
| components/game/PauseBoundary.test.tsx |
| components/game/PauseBoundary.tsx |
| components/game/PauseOverlay.module.css |
| components/game/PauseOverlay.tsx |
| components/game/SuspendConfirmationBlockingModal.tsx |
| lib/game/pause.test.ts |
| lib/game/pause.ts |

### `common/pdf` — 11 files

| today (under `src/common/`) |
|---|
| pdf/columns.ts |
| pdf/frame.test.ts |
| pdf/frame.ts |
| pdf/marks.ts |
| pdf/tiles.ts |
| pdf/turnLog.test.ts |
| pdf/turnLog.ts |
| pdf/wordColumns.test.ts |
| pdf/wordColumns.ts |
| pdf/wordListBody.ts |
| pdf/wordSections.ts |

### `common/realtime` — 15 files

| today (under `src/common/`) |
|---|
| hooks/realtime/useClubPresence.test.ts |
| hooks/realtime/useClubPresence.ts |
| hooks/realtime/useClubSetupPresence.tsx |
| hooks/realtime/useRealtimeReconnect.test.ts |
| hooks/realtime/useRealtimeReconnect.ts |
| hooks/realtime/useRealtimeRefetch.test.ts |
| hooks/realtime/useRealtimeRefetch.ts |
| lib/supabase/channelDedup.test.ts |
| lib/supabase/channelDedup.ts |
| lib/supabase/channelTeardown.test.ts |
| lib/supabase/channelTeardown.ts |
| lib/supabase/postgresAttached.test.ts |
| lib/supabase/postgresAttached.ts |
| lib/supabase/realtimeDiag.test.ts |
| lib/supabase/realtimeDiag.ts |

### `common/reveal` — 2 files

| today (under `src/common/`) |
|---|
| hooks/game/useSolutionReveal.test.ts |
| hooks/game/useSolutionReveal.ts |

### `common/routing` — 4 files

| today (under `src/common/`) |
|---|
| lib/routing/Link.test.tsx |
| lib/routing/Link.tsx |
| lib/routing/router.test.ts |
| lib/routing/router.ts |

### `common/scratchpad` — 5 files

| today (under `src/common/`) |
|---|
| components/floating-panels/GameScratchpadCompanion.module.css |
| components/floating-panels/GameScratchpadCompanion.tsx |
| hooks/scratchpad/useScratchpad.test.ts |
| hooks/scratchpad/useScratchpad.ts |
| lib/scratchpad/scratchpadOpenStore.ts |

### `common/session` — 3 files

| today (under `src/common/`) |
|---|
| hooks/session/useProfile.ts |
| hooks/session/useSession.test.ts |
| hooks/session/useSession.ts |

### `common/setup-form` — 23 files

| today (under `src/common/`) |
|---|
| components/setup/PlayersSection.module.css |
| components/setup/PlayersSection.test.tsx |
| components/setup/PlayersSection.tsx |
| components/setup/SetupCoopStyleSection.test.tsx |
| components/setup/SetupCoopStyleSection.tsx |
| components/setup/SetupDisclosure.test.tsx |
| components/setup/SetupDisclosure.tsx |
| components/setup/SetupGameModal.module.css |
| components/setup/SetupGameModal.test.tsx |
| components/setup/SetupGameModal.tsx |
| components/setup/SetupNextPuzzleSection.module.css |
| components/setup/SetupNextPuzzleSection.test.tsx |
| components/setup/SetupNextPuzzleSection.tsx |
| components/setup/SetupSection.module.css |
| components/setup/SetupSection.test.tsx |
| components/setup/SetupSection.tsx |
| components/setup/SetupTimerSection.module.css |
| components/setup/SetupTimerSection.test.tsx |
| components/setup/SetupTimerSection.tsx |
| components/setup/fieldNames.ts |
| lib/game/difficulty.ts |
| lib/game/setupRows.ts |
| lib/setup/setupForm.ts |

### `common/single-flight` — 2 files

| today (under `src/common/`) |
|---|
| hooks/ui/useSingleFlight.test.ts |
| hooks/ui/useSingleFlight.ts |

### `common/supabase` — 11 files

| today (under `src/common/`) |
|---|
| db.ts |
| lib/supabase/dbEnvelope.ts |
| lib/supabase/dbFetch.test.ts |
| lib/supabase/dbFetch.ts |
| lib/supabase/dbLog.ts |
| lib/supabase/dbResult.test.ts |
| lib/supabase/dbResult.ts |
| lib/supabase/edgeFnTransport.test.ts |
| lib/supabase/edgeFnTransport.ts |
| lib/supabase/envelope.ts |
| lib/supabase/supabase.ts |

### `common/terminal` — 11 files

| today (under `src/common/`) |
|---|
| components/game/CelebrationBlockingModal.module.css |
| components/game/CelebrationBlockingModal.test.tsx |
| components/game/CelebrationBlockingModal.tsx |
| components/game/terminal/LocalTerminalRow.test.tsx |
| components/game/terminal/LocalTerminalRow.tsx |
| components/game/terminal/TerminalActionRow.tsx |
| hooks/game/useCelebration.test.ts |
| hooks/game/useCelebration.ts |
| lib/game/terminalCopy.ts |
| lib/members/terminalOutcomeVerb.test.ts |
| lib/members/terminalOutcomeVerb.ts |

### `common/text` — 2 files

| today (under `src/common/`) |
|---|
| components/text/RichMessage.module.css |
| components/text/RichMessage.tsx |

### `common/themes` — 5 files

| today (under `src/common/`) |
|---|
| themes/dark-mode.css |
| themes/daylight.css |
| themes/light-mode.css |
| themes/loadTheme.ts |
| themes/midnight.css |

### `common/timer` — 4 files

| today (under `src/common/`) |
|---|
| hooks/game/useGameTimer.test.ts |
| hooks/game/useGameTimer.ts |
| lib/game/timerLabel.test.ts |
| lib/game/timerLabel.ts |

### `common/toasts` — 6 files

| today (under `src/common/`) |
|---|
| components/toasts/Toast.module.css |
| components/toasts/Toast.test.tsx |
| components/toasts/Toast.tsx |
| components/toasts/ToastHost.module.css |
| components/toasts/ToastHost.tsx |
| lib/toast/toastStore.ts |

### `common/tooltips` — 3 files

| today (under `src/common/`) |
|---|
| components/tooltips/TooltipHost.module.css |
| components/tooltips/TooltipHost.test.tsx |
| components/tooltips/TooltipHost.tsx |

### `common/turn-log` — 13 files

| today (under `src/common/`) |
|---|
| components/game/TurnStatusLine.test.tsx |
| components/game/TurnStatusLine.tsx |
| components/game/lists/ActorMention.module.css |
| components/game/lists/ActorMention.tsx |
| components/game/lists/TurnLog.module.css |
| components/game/lists/TurnLog.tsx |
| components/game/lists/TurnLogActor.tsx |
| components/game/lists/historyViewer.module.css |
| components/game/turnCopy.tsx |
| hooks/game/useHistoryViewer.test.ts |
| hooks/game/useHistoryViewer.ts |
| hooks/game/useTurnLogPlayerPicker.test.tsx |
| hooks/game/useTurnLogPlayerPicker.tsx |

### `common/utils` — 8 files

| today (under `src/common/`) |
|---|
| lib/util/cls.ts |
| lib/util/friendlyDate.test.ts |
| lib/util/friendlyDate.ts |
| lib/util/linkify.test.tsx |
| lib/util/linkify.tsx |
| lib/util/logStamp.ts |
| lib/util/mulberry32.test.ts |
| lib/util/mulberry32.ts |

### `common/web-storage` — 5 files

| today (under `src/common/`) |
|---|
| hooks/ui/useStickyChoice.test.ts |
| hooks/ui/useStickyChoice.ts |
| lib/util/storage.fake.ts |
| lib/util/storage.test.ts |
| lib/util/storage.ts |

### `common/word-entry` — 7 files

| today (under `src/common/`) |
|---|
| components/game/entry/EntryBox.module.css |
| components/game/entry/EntryBox.tsx |
| components/game/entry/EntryRow.tsx |
| components/game/entry/MoveRow.module.css |
| components/game/entry/MoveRow.tsx |
| hooks/input/useArrowHistory.test.ts |
| hooks/input/useArrowHistory.ts |

### `common/word-list` — 7 files

| today (under `src/common/`) |
|---|
| components/game/lists/WordList.module.css |
| components/game/lists/WordList.test.tsx |
| components/game/lists/WordList.tsx |
| hooks/game/useRecentlyFound.test.ts |
| hooks/game/useRecentlyFound.ts |
| hooks/game/useWordListFilter.test.tsx |
| hooks/game/useWordListFilter.tsx |

### `shared/bee-games` — 6 files

| today (under `src/common/`) |
|---|
| components/game/entry/typedWord.module.css |
| components/game/foundWordsPlayArea.module.css |
| hooks/game/makeFoundWordsGame.test.ts |
| hooks/game/makeFoundWordsGame.ts |
| lib/game/foundWords.ts |
| lib/game/foundWordsLeaderboard.ts |

### `shared/board-cursor` — 5 files

| today (under `src/common/`) |
|---|
| components/game/gridCursor.module.css |
| hooks/input/useBoardCursorKeys.test.ts |
| hooks/input/useBoardCursorKeys.ts |
| lib/game/gridCursor.test.ts |
| lib/game/gridCursor.ts |

### `shared/dict-trie` — 2 files

| today (under `src/common/`) |
|---|
| lib/game/trie.test.ts |
| lib/game/trie.ts |

### `shared/grid-and-drag` — 3 files

| today (under `src/common/`) |
|---|
| components/game/dragGhost.module.css |
| hooks/ui/useDragGesture.test.ts |
| hooks/ui/useDragGesture.ts |

### `shared/onscreen-keyboard` — 2 files

| today (under `src/common/`) |
|---|
| components/game/entry/GuessKeyboard.module.css |
| components/game/entry/GuessKeyboard.tsx |

### `shared/rank-ladder` — 7 files

| today (under `src/common/`) |
|---|
| components/game/RankBar.module.css |
| components/game/RankBar.test.tsx |
| components/game/RankBar.tsx |
| components/game/Stats.module.css |
| components/game/Stats.tsx |
| lib/game/rankLadder.test.ts |
| lib/game/rankLadder.ts |

### `shared/word-hunt` — 6 files

| today (under `src/common/`) |
|---|
| hooks/game/useWordSubmit.test.ts |
| hooks/game/useWordSubmit.ts |
| lib/game/foundWordsDisplayRows.test.ts |
| lib/game/foundWordsDisplayRows.ts |
| lib/game/revealWords.test.ts |
| lib/game/revealWords.ts |

### `shared/wordle-style` — 2 files

| today (under `src/common/`) |
|---|
| lib/color/tileColor.test.ts |
| lib/color/tileColor.ts |

### `connections (the game)` — 2 files

| today (under `src/common/`) |
|---|
| components/game/StrikeMarks.module.css |
| components/game/StrikeMarks.tsx |

TOTAL mapped: 497 of 497
